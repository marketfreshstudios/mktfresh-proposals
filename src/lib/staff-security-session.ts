import { z } from "zod";
import { AppError } from "./model";
import { supabase } from "./repository";
import { decryptSecret, encryptSecret } from "./providers/secrets";
import { readCookie } from "./staff-session";

export class StaffSecurityRequired extends AppError {
  constructor(readonly state: "two-step" | "paused" | "removed") {
    super(
      403,
      state === "two-step"
        ? "Verify your sign-in to continue"
        : state === "paused"
          ? "Staff access deactivated. Contact your super admin."
          : "You no longer have access to this workspace.",
    );
  }
}

export const staffIdentityCookieName = "yeswell_staff_identity";
const securityHint = staffIdentityCookieName;
const cookieLifetime = 30 * 24 * 60 * 60;

export function staffIdentityCookie(user: string) {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) return null;
  const value = encryptSecret(
    JSON.stringify({ user, until: Date.now() + cookieLifetime * 1000 }),
    key,
    securityHint,
  );
  return `${securityHint}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${cookieLifetime}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearStaffIdentity(response: Response) {
  response.headers.append(
    "Set-Cookie",
    `${securityHint}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}

async function priorStaffId(request: Request) {
  const cookie = readCookie(request, securityHint);
  if (!cookie) return null;
  try {
    const hint = z
      .object({ user: z.uuid(), until: z.number() })
      .parse(
        JSON.parse(
          decryptSecret(
            cookie,
            process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
            securityHint,
          ),
        ),
      );
    return hint.until >= Date.now() ? hint.user : null;
  } catch {
    return null;
  }
}

export async function priorStaffState(request: Request, details = false) {
  const id = await priorStaffId(request);
  if (!id) return null;
  const db = supabase();
  const { data: member, error } = await db
    .from("staff_users")
    .select("status")
    .eq("user_id", id)
    .maybeSingle();
  if (error || (member && member.status !== "deactivated")) return null;

  const state = member ? ("paused" as const) : ("removed" as const);
  const result = await db
    .from("team_audit")
    .select("workspace_id,created_at,actor")
    .eq("target_user_id", id)
    .eq("action", member ? "deactivate" : "remove")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!result.data && !member) return null;
  if (!details || !result.data) return { state };

  const event = result.data;
  const [workspace, owner] = await Promise.all([
    db
      .from("workspace_settings")
      .select("data")
      .eq("workspace_id", event.workspace_id)
      .maybeSingle(),
    db
      .from("staff_users")
      .select("user_id,display_name")
      .eq("workspace_id", event.workspace_id)
      .eq("role", "owner")
      .eq("status", "active")
      .order("user_id")
      .limit(1)
      .maybeSingle(),
  ]);
  const contact = owner.data
    ? await db.auth.admin.getUserById(owner.data.user_id)
    : null;
  return {
    state,
    at: event.created_at as string,
    workspace: workspace.data?.data?.company_name as string | undefined,
    timezone: workspace.data?.data?.timezone as string | undefined,
    admin: contact?.data.user?.email
      ? {
          name: owner.data?.display_name as string | undefined,
          email: contact.data.user.email,
        }
      : undefined,
  };
}
