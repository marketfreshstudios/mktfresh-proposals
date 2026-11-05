import type { User } from "@supabase/supabase-js";
import { check, type Actor } from "../../src/lib/model";
import {
  StaffMemberSchema,
  type StaffMember,
  type TeamAction,
  type TeamAudit,
} from "../../src/lib/team-model";
import type { TeamStore } from "../../src/lib/team-store";
import type { TeamAuth } from "../../src/lib/team";
import { TeamService } from "../../src/lib/team";
import { MockMailer } from "../../src/lib/jobs";
import { setup, staff } from "../helpers";
import { sha256 } from "../../src/lib/content";
export class TestTeamStore implements TeamStore {
  members = new Map<string, StaffMember>();
  history: TeamAudit[] = [];
  constructor(readonly workspaceId: string) {}
  async get(id: string) {
    const m = this.members.get(id);
    return m?.workspace_id === this.workspaceId ? structuredClone(m) : null;
  }
  async list() {
    return structuredClone(
      [...this.members.values()].filter(
        (m) => m.workspace_id === this.workspaceId,
      ),
    );
  }
  async audit() {
    return structuredClone([...this.history].reverse());
  }
  async change(
    actor: Actor,
    id: string,
    action: TeamAction,
    changes: Record<string, unknown> = {},
  ) {
    const before = await this.get(id),
      admin = await this.get(actor.actor.slice(6));
    check(
      admin &&
        (admin.role === "owner" ||
          (id === admin.user_id &&
            ["name", "password_changed"].includes(action))),
      "Only a super admin can manage users",
      403,
    );
    let after: StaffMember | null = before ? { ...before } : null;
    if (action === "invite")
      after = StaffMemberSchema.parse({
        user_id: id,
        workspace_id: this.workspaceId,
        role: changes.role ?? "member",
        display_name: changes.display_name,
        status: "invited",
        invited_at: new Date().toISOString(),
        invited_by: admin.user_id,
        password_change_required: true,
      });
    else {
      check(after, "Staff member not found", 404);
      if (action === "name") after.display_name = String(changes.display_name);
      if (action === "role") after.role = changes.role as StaffMember["role"];
      if (action === "password_set" || action === "password_changed") {
        after.status = "active";
        after.password_change_required =
          action === "password_set" &&
          changes.password_change_required === true;
        after.session_version++;
      }
      if (action === "deactivate") {
        after.status = "deactivated";
        after.deactivated_at = new Date().toISOString();
        after.session_version++;
      }
      if (action === "reactivate") {
        after.status = "active";
        after.deactivated_at = null;
        after.session_version++;
      }
      if (action === "remove") after = null;
    }
    if (after) this.members.set(id, after);
    else this.members.delete(id);
    this.history.push({
      id: crypto.randomUUID(),
      workspace_id: this.workspaceId,
      actor: actor.actor,
      actor_name: admin.display_name,
      target_user_id: id,
      target_name: after?.display_name ?? before!.display_name,
      action,
      before: before ? structuredClone(before) : null,
      after: after ? structuredClone(after) : null,
      created_at: new Date().toISOString(),
    });
    return after;
  }
}
export class TestTeamAuth implements TeamAuth {
  users = new Map<string, User>();
  passwordHashes = new Map<string, string>();
  banned = new Set<string>();
  links: { user_id: string; token: string; type: string }[] = [];
  constructor(private store: TestTeamStore) {}
  add(id: string, email: string, name: string) {
    const u = {
      id,
      email,
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: { full_name: name },
      email_confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    } as User;
    this.users.set(id, u);
    return u;
  }
  async findByEmail(email: string) {
    const u = [...this.users.values()].find(
      (u) => u.email!.toLowerCase() === email.toLowerCase(),
    );
    return u
      ? {
          id: u.id,
          workspace_id: this.store.members.get(u.id)?.workspace_id ?? null,
          confirmed: !!u.email_confirmed_at,
        }
      : null;
  }
  async user(id: string) {
    const u = this.users.get(id);
    check(u, "Missing Auth user", 404);
    return structuredClone(u);
  }
  async link(email: string, type: "invite" | "recovery", name?: string) {
    let u = [...this.users.values()].find((u) => u.email === email);
    if (!u) {
      u = this.add(crypto.randomUUID(), email, name ?? email);
      u.email_confirmed_at = undefined;
      u.last_sign_in_at = undefined;
    }
    const token = crypto.randomUUID();
    this.links.push({ user_id: u.id, token, type });
    return { user: structuredClone(u), token_hash: token };
  }
  async password(id: string, password: string) {
    this.passwordHashes.set(id, sha256(password));
  }
  async ban(id: string, banned: boolean) {
    if (banned) this.banned.add(id);
    else this.banned.delete(id);
  }
}
export async function teamFixture() {
  const f = await setup();
  const store = new TestTeamStore(f.repo.workspaceId),
    auth = new TestTeamAuth(store),
    mailer = new MockMailer();
  const admin = { ...staff, workspace_id: f.repo.workspaceId };
  store.members.set(
    admin.actor.slice(6),
    StaffMemberSchema.parse({
      user_id: admin.actor.slice(6),
      workspace_id: store.workspaceId,
      role: "owner",
      display_name: admin.staff_name,
    }),
  );
  auth.add(admin.actor.slice(6), admin.staff_email!, admin.staff_name!);
  const id = crypto.randomUUID();
  store.members.set(
    id,
    StaffMemberSchema.parse({
      user_id: id,
      workspace_id: store.workspaceId,
      role: "member",
      display_name: "Jamie Example",
    }),
  );
  auth.add(id, "jamie@example.test", "Jamie Example");
  return {
    ...f,
    store,
    auth,
    mailer,
    admin,
    member: {
      ...admin,
      actor: "staff:" + id,
      staff_role: "member" as const,
      staff_name: "Jamie Example",
      staff_email: "jamie@example.test",
    },
    team: new TeamService(store, auth, f.repo, mailer),
  };
}
