import type { User } from "@supabase/supabase-js";
import { AppError, check } from "./model";
import { StaffSessionExpired } from "./staff-session";
import { StaffSecurityRequired } from "./staff-security-session";
import { supabase } from "./repository";
export class StaffPasswordRequired extends AppError {
  readonly code = "STAFF_PASSWORD_REQUIRED";
  constructor() {
    super(403, "Choose a new password before continuing");
  }
}
export function sessionId(token: string) {
  try {
    const value = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return typeof value.session_id === "string" ? value.session_id : null;
  } catch {
    return null;
  }
}
export async function validateStaffMembership(
  user: User,
  access: string,
  options: {
    passwordChange?: boolean;
    invite?: boolean;
    twoStep?: boolean;
  } = {},
) {
  const db = supabase();
  const { data, error } = await db
    .from("staff_users")
    .select(
      "user_id,workspace_id,role,display_name,status,password_change_required,session_version",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new AppError(503, "Unable to verify staff access");
  if (!data) throw new StaffSecurityRequired("removed");
  if (data.status === "deactivated") throw new StaffSecurityRequired("paused");
  check(
    (data.status ?? "active") === "active" ||
      (options.invite && data.status === "invited"),
    "Accept your invitation before signing in",
    403,
  );
  // Existing tokens are valid JWTs at Auth but may outlive a revoked Auth session.
  const id = sessionId(access);
  if (id || data.session_version > 0 || process.env.APP_MODE !== "local") {
    if (!id) throw new StaffSessionExpired();
    const result = await db.rpc("staff_session_security", {
      target_user: user.id,
      target_session: id,
    });
    if (result.error) throw new AppError(503, "Unable to verify staff session");
    if (result.data === "two_step" && !options.twoStep)
      throw new StaffSecurityRequired("two-step");
    if (result.data !== "ok" && result.data !== "two_step")
      throw new StaffSessionExpired();
    if (data.password_change_required && !options.passwordChange)
      throw new StaffPasswordRequired();
    return { ...data, two_step_required: result.data === "two_step" };
  }
  if (data.password_change_required && !options.passwordChange)
    throw new StaffPasswordRequired();
  return { ...data, two_step_required: false };
}
export async function activeConnectorMember(workspace: string, userId: string) {
  if (process.env.APP_MODE === "local") return;
  const { data, error } = await supabase()
    .from("staff_users")
    .select("user_id,status,password_change_required")
    .eq("workspace_id", workspace)
    .eq("user_id", userId)
    .maybeSingle();
  check(
    !error &&
      data &&
      (data.status ?? "active") === "active" &&
      !data.password_change_required,
    "Staff access revoked",
    401,
  );
}
