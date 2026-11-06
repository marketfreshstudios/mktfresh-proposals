import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type Actor } from "./model";
import {
  StaffMemberSchema,
  type StaffMember,
  type TeamAction,
  type TeamAudit,
} from "./team-model";
export interface TeamStore {
  get(id: string): Promise<StaffMember | null>;
  list(): Promise<StaffMember[]>;
  audit(all?: boolean): Promise<TeamAudit[]>;
  change(
    actor: Actor,
    id: string,
    action: TeamAction,
    changes?: Record<string, unknown>,
  ): Promise<StaffMember | null>;
}
export class SupabaseTeamStore implements TeamStore {
  constructor(
    private db: SupabaseClient,
    readonly workspaceId: string,
  ) {}
  async get(id: string) {
    const { data, error } = await this.db
      .from("staff_users")
      .select("*")
      .eq("workspace_id", this.workspaceId)
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw new AppError(503, "Unable to load team membership");
    return data ? StaffMemberSchema.parse(data) : null;
  }
  async list() {
    const { data, error } = await this.db
      .from("staff_users")
      .select("*")
      .eq("workspace_id", this.workspaceId)
      .order("display_name");
    if (error) throw new AppError(503, "Unable to load team membership");
    return data.map((x) => StaffMemberSchema.parse(x));
  }
  async audit(all = false) {
    const rows: TeamAudit[] = [];
    const pageSize = 500;
    do {
      let query = this.db
        .from("team_audit")
        .select("*")
        .eq("workspace_id", this.workspaceId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      const { data, error } = await (all
        ? query.range(rows.length, rows.length + pageSize - 1)
        : query.limit(40));
      if (error) throw new AppError(503, "Unable to load recent team changes");
      rows.push(...(data as TeamAudit[]));
      if (!all || data.length < pageSize) break;
    } while (true);
    return rows;
  }
  async change(
    actor: Actor,
    id: string,
    action: TeamAction,
    changes: Record<string, unknown> = {},
  ) {
    const { data, error } = await this.db.rpc("change_team_member", {
      target_workspace: this.workspaceId,
      actor_id: actor.actor.slice(6),
      target_id: id,
      operation: action,
      changes,
    });
    if (error)
      throw new AppError(
        error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409,
        error.message,
      );
    return data?.user_id ? StaffMemberSchema.parse(data) : null;
  }
}
