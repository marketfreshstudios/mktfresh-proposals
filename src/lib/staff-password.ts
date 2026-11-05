import { z } from "zod";
import { check, AppError } from "./model";
import { supabase } from "./repository";
import { authClient, staffCredentials } from "./staff-session";
import { validateStaffMembership } from "./staff-access";
import { StaffPasswordSchema } from "./team-model";
import { SupabaseTeamStore } from "./team-store";
import { SupabaseTeamAuth } from "./team";
export const SetStaffPasswordSchema = z
  .object({
    password: StaffPasswordSchema,
    token_hash: z.string().min(1).max(2000).optional(),
    type: z.enum(["invite", "recovery"]).optional(),
    current_password: z.string().min(1).max(200).optional(),
  })
  .strict();
export async function setStaffPassword(request: Request, raw: unknown) {
  const input = SetStaffPasswordSchema.parse(raw),
    client = authClient();
  let session;
  const fromLink = !!input.token_hash;
  if (fromLink) {
    check(
      input.type,
      "Invalid or expired link. Ask your admin to resend.",
      400,
    );
    const { data, error } = await client.auth.verifyOtp({
      token_hash: input.token_hash!,
      type: input.type,
    });
    check(
      !error && data.session,
      "This link is invalid or expired. Ask your admin to resend.",
      410,
    );
    session = data.session;
  } else {
    const identity = await staffCredentials(request);
    const member = await validateStaffMembership(
      identity.user,
      identity.access_token,
      { passwordChange: true },
    );
    // Forced changes require the just-authenticated password session; ordinary changes require current password.
    if (!member.password_change_required) {
      check(input.current_password, "Enter your current password", 400);
      const { data, error } = await client.auth.signInWithPassword({
        email: identity.user.email!,
        password: input.current_password,
      });
      check(
        !error && data.user?.id === identity.user.id && data.session,
        "Current password is incorrect",
        401,
      );
      session = data.session;
    } else
      session = { user: identity.user, access_token: identity.access_token };
  }
  const member = await validateStaffMembership(
    session.user,
    session.access_token,
    { passwordChange: true, invite: fromLink },
  );
  check(fromLink || member.status === "active", "Staff access required", 403);
  const store = new SupabaseTeamStore(supabase(), member.workspace_id);
  await new SupabaseTeamAuth(supabase()).password(
    session.user.id,
    input.password,
  );
  await store.change(
    {
      actor: "staff:" + session.user.id,
      staff_role: member.role,
      workspace_id: member.workspace_id,
      staff_name: member.display_name,
      ip: "",
      user_agent: "",
    },
    session.user.id,
    "password_changed",
  );
  const result = await client.auth.signInWithPassword({
    email: session.user.email!,
    password: input.password,
  });
  check(
    !result.error && result.data.session,
    "Password saved. Sign in with your new password.",
    401,
  );
  await validateStaffMembership(
    result.data.session.user,
    result.data.session.access_token,
  );
  return result.data.session;
}
