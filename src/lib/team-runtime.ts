import { SupabaseTeamStore } from "./team-store";
import { SupabaseTeamAuth, TeamService } from "./team";
import { runtime } from "./runtime";
import { supabase } from "./repository";
import { AppError } from "./model";
export function teamService(workspaceId: string) {
  if (process.env.APP_MODE === "local")
    throw new AppError(
      503,
      "Team invitations and password management require Supabase Auth. Local development sign-in is unchanged.",
    );
  const db = supabase(),
    rt = runtime(workspaceId);
  return new TeamService(
    new SupabaseTeamStore(db, workspaceId),
    new SupabaseTeamAuth(db),
    rt.repo,
    rt.mailer,
  );
}
