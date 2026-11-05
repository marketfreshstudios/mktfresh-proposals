import type { User, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError, check, type Actor } from "./model";
import type { Repository } from "./repository";
import type { Mailer } from "./jobs";
import type { TeamStore } from "./team-store";
import {
  StaffNameSchema,
  StaffRoleSchema,
  TeamChangeSchema,
  type TeamPerson,
} from "./team-model";
import { appOrigin } from "./links";
import { sendTeamEmail } from "./team-email";
export class TeamWorkConflict extends AppError {
  constructor(readonly proposals: { id: string; title: string }[]) {
    super(
      409,
      "This person has unfinished proposals. Finish this work before removing them, or use Deactivate to stop access now.",
    );
  }
}
export interface TeamAuth {
  findByEmail(email: string): Promise<{
    id: string;
    workspace_id: string | null;
    confirmed: boolean;
  } | null>;
  user(id: string): Promise<User>;
  link(
    email: string,
    type: "invite" | "recovery",
    name?: string,
  ): Promise<{ user: User; token_hash: string }>;
  password(id: string, password: string): Promise<void>;
  ban(id: string, banned: boolean): Promise<void>;
}
export class SupabaseTeamAuth implements TeamAuth {
  constructor(private db: SupabaseClient) {}
  async findByEmail(email: string) {
    const { data, error } = await this.db.rpc("team_auth_identity", {
      target_email: email,
    });
    check(!error, "Unable to check staff identity", 503);
    return data as {
      id: string;
      workspace_id: string | null;
      confirmed: boolean;
    } | null;
  }
  async user(id: string) {
    const { data, error } = await this.db.auth.admin.getUserById(id);
    check(!error && data.user, "Unable to load staff identity", 503);
    return data.user;
  }
  async link(email: string, type: "invite" | "recovery", name?: string) {
    const { data, error } = await this.db.auth.admin.generateLink({
      type,
      email,
      options: {
        redirectTo: `${appOrigin()}/set-password`,
        ...(name ? { data: { full_name: name } } : {}),
      },
    });
    // Do not forward provider error bodies or action links to API consumers/logs.
    check(
      !error && data.user && data.properties?.hashed_token,
      "Unable to create sign-in link. The email may already belong to an account; check the team list or use password reset.",
      409,
    );
    return { user: data.user, token_hash: data.properties.hashed_token };
  }
  async password(id: string, password: string) {
    const { error } = await this.db.auth.admin.updateUserById(id, {
      password,
      email_confirm: true,
    });
    check(
      !error,
      "Unable to set password. Check the project's password strength requirements and try again.",
      400,
    );
  }
  async ban(id: string, banned: boolean) {
    const { error } = await this.db.auth.admin.updateUserById(id, {
      ban_duration: banned ? "876000h" : "none",
    });
    check(!error, "Unable to update user authentication", 503);
  }
}
export function requireSuperAdmin(actor: Actor) {
  check(
    actor.actor.startsWith("staff:") && actor.staff_role === "owner",
    "Only a super admin can manage users",
    403,
  );
}
export class TeamService {
  constructor(
    readonly store: TeamStore,
    readonly auth: TeamAuth,
    readonly repo: Repository,
    readonly mailer: Mailer,
  ) {}
  private async admin(actor: Actor) {
    requireSuperAdmin(actor);
    const current = await this.store.get(actor.actor.slice(6));
    check(
      current?.role === "owner" &&
        current.status === "active" &&
        !current.password_change_required,
      "Only a super admin can manage users",
      403,
    );
  }
  async list() {
    const members = await this.store.list();
    return Promise.all(
      members.map(async (m): Promise<TeamPerson> => {
        const u = await this.auth.user(m.user_id);
        return {
          ...m,
          name: m.display_name,
          email: u.email ?? "",
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      }),
    );
  }
  async invite(actor: Actor, raw: unknown) {
    await this.admin(actor);
    const input = z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        display_name: StaffNameSchema,
        role: StaffRoleSchema.default("member"),
      })
      .strict()
      .parse(raw);
    const people = await this.list();
    check(
      !people.some((p) => p.email.toLowerCase() === input.email),
      "This person already belongs to the workspace",
      409,
    );
    const identity = await this.auth.findByEmail(input.email);
    check(
      !identity?.workspace_id,
      "This account already belongs to a workspace",
      409,
    );
    const linkType = identity?.confirmed ? "recovery" : "invite";
    const link = await this.auth.link(
      input.email,
      linkType,
      input.display_name,
    );
    const member = await this.store.change(actor, link.user.id, "invite", {
      display_name: input.display_name,
      role: input.role,
    });
    check(member, "Unable to create staff membership", 503);
    if (identity) await this.auth.ban(member.user_id, false);
    await sendTeamEmail(this.repo, this.mailer, actor, {
      member,
      email: input.email,
      token: link.token_hash,
      type: linkType,
      template: "team_invite",
    });
    return { user_id: member.user_id, invited: true };
  }
  async change(actor: Actor, id: string, raw: unknown) {
    const self = actor.actor === "staff:" + id;
    if ((raw as { action?: unknown })?.action === "name" && self) {
      check(
        actor.actor.startsWith("staff:"),
        "Staff authorization required",
        403,
      );
    } else await this.admin(actor);
    const input = TeamChangeSchema.parse(raw);
    const member = await this.store.get(id);
    check(member, "Staff member not found in this workspace", 404);
    if (
      ["deactivate", "remove", "password_set", "reset_sent"].includes(
        input.action,
      )
    )
      check(
        !self,
        "Use your profile for your own password; you cannot deactivate or remove yourself",
        409,
      );
    if (
      member.role === "owner" &&
      member.status === "active" &&
      (input.action === "deactivate" ||
        input.action === "remove" ||
        (input.action === "role" && input.role !== "owner"))
    ) {
      check(
        (await this.store.list()).filter(
          (m) => m.status === "active" && m.role === "owner",
        ).length > 1,
        "The workspace must keep at least one active super admin",
        409,
      );
    }
    if (input.action === "password_set") {
      check(
        member.status !== "deactivated",
        "Reactivate this person before setting a password",
        409,
      );
      await this.auth.password(id, input.password);
      await this.store.change(actor, id, "password_set", {
        password_change_required: input.choose_new_password,
      });
    } else if (
      input.action === "invite_resent" ||
      input.action === "reset_sent"
    ) {
      check(
        member.status !== "deactivated",
        "Reactivate this person before sending a sign-in email",
        409,
      );
      check(
        input.action !== "invite_resent" || member.status === "invited",
        "Only an invited user can receive another invitation",
        409,
      );
      const user = await this.auth.user(id);
      check(user.email, "Staff email required", 409);
      const identity = await this.auth.findByEmail(user.email);
      const type =
        input.action === "invite_resent" && !identity?.confirmed
          ? "invite"
          : "recovery";
      const link = await this.auth.link(user.email, type, member.display_name);
      check(
        link.user.id === id,
        "Sign-in identity changed; reload the team",
        409,
      );
      await sendTeamEmail(this.repo, this.mailer, actor, {
        member,
        email: user.email,
        token: link.token_hash,
        type,
        template:
          input.action === "invite_resent"
            ? "team_invite"
            : "team_password_reset",
      });
      await this.store.change(actor, id, input.action);
    } else if (input.action === "deactivate" || input.action === "reactivate") {
      // Membership revocation is authoritative even if the Auth service is unavailable.
      if (input.action === "deactivate")
        await this.store.change(actor, id, input.action);
      await this.auth.ban(id, input.action === "deactivate");
      if (input.action === "reactivate")
        await this.store.change(actor, id, input.action);
    } else if (input.action === "remove") {
      const work = (await this.repo.list()).filter(
        (p) =>
          p.source !== "proposify_import" &&
          !["completed", "declined", "expired", "archived"].includes(
            p.status,
          ) &&
          (p.sender?.user_id === id ||
            (p.status === "draft" && p.created_by === "staff:" + id)),
      );
      if (work.length)
        throw new TeamWorkConflict(
          work.map((p) => ({ id: p.id, title: p.title })),
        );
      await this.store.change(actor, id, "remove");
      await this.auth.ban(id, true);
    } else
      await this.store.change(
        actor,
        id,
        input.action,
        input.action === "name"
          ? { display_name: input.display_name }
          : input.action === "role"
            ? { role: input.role }
            : {},
      );
    return { updated: true };
  }
}
