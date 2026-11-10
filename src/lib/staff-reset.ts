import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { ResendMailer } from "./jobs";
import { supabase, SupabaseRepository } from "./repository";
import { SupabaseTeamAuth } from "./team";
import { sendTeamEmail, sendPasswordChangedEmail } from "./team-email";
import { workspaceSecuritySender } from "./email-identity";
import { SupabaseTeamStore } from "./team-store";
import type { StaffMember } from "./team-model";
import type { WorkspaceSettings } from "./workspace";

// Matches Supabase Auth's email OTP expiry (3600s in supabase/config.toml).
export const staffResetExpiryMinutes = 60;
export const staffResetRequest = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((email) => email.toLowerCase()),
});

function resetHash(kind: "email" | "ip", value: string, salt: string) {
  return createHmac("sha256", salt)
    .update(`staff-reset:${kind}\0${value}`)
    .digest("hex");
}

function eligibleIdentity(user: User, id: string, email: string) {
  return (
    user.id === id &&
    user.email?.toLowerCase() === email &&
    !!user.email_confirmed_at &&
    (!user.banned_until || Date.parse(user.banned_until) <= Date.now())
  );
}

function workspaceEmail(workspaceId: string) {
  return {
    repo: new SupabaseRepository(supabase(), workspaceId),
    mailer: new ResendMailer(),
  };
}

/** Runs after the generic response, including the lookup and provider work. */
export async function processStaffPasswordReset(
  email: string,
  headers: Headers,
) {
  if (process.env.APP_MODE === "local") return;
  try {
    const db = supabase();
    const salt = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!salt || salt.length < 32)
      throw new Error("Missing reset protection key");
    const forwarded = process.env.VERCEL
      ? (headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ?? "")
      : "";
    // Non-Vercel deployments without a trusted IP source share one fail-closed bucket.
    const ip = isIP(forwarded) ? forwarded : "unavailable";
    const emailHash = resetHash("email", email, salt);
    const { data: admitted, error } = await db.rpc(
      "admit_staff_password_reset",
      {
        target_email_hash: emailHash,
        target_ip_hash: resetHash("ip", ip, salt),
      },
    );
    if (error) throw new Error("Unable to enforce reset rate limits");

    const auth = new SupabaseTeamAuth(db);
    const identity = await auth.findByEmail(email);
    if (!identity?.workspace_id) {
      console.info("Password reset requested", { email_hash: emailHash });
      return;
    }
    const store = new SupabaseTeamStore(db, identity.workspace_id);
    const member = await store.get(identity.id);
    if (!member) return;
    const { error: auditError } = await db.from("team_audit").insert({
      workspace_id: member.workspace_id,
      actor: "system",
      actor_name: "Password reset form",
      target_user_id: member.user_id,
      target_name: member.display_name,
      action: "password_reset_requested",
    });
    if (auditError) throw new Error("Unable to record reset request");
    if (!admitted || !identity.confirmed || member.status !== "active") return;
    if (
      !eligibleIdentity(await auth.user(member.user_id), member.user_id, email)
    )
      return;

    const { repo, mailer } = workspaceEmail(member.workspace_id);
    const settings = (
      await repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    const sender = settings && workspaceSecuritySender(settings);
    if (!sender) return;
    const link = await auth.link(email, "recovery");
    if (
      !eligibleIdentity(link.user, member.user_id, email) ||
      (await store.get(member.user_id))?.status !== "active"
    )
      return;
    await sendTeamEmail(
      repo,
      mailer,
      {
        actor: "system",
        staff_name: "Yeswell",
        staff_email: sender,
        ip: "",
        user_agent: "",
      },
      {
        member,
        email,
        token: link.token_hash,
        type: "recovery",
        replyTo: settings.email,
      },
    );
  } catch {
    // Provider errors can contain an address or credential. Keep them out of logs.
    console.error("Staff password reset could not be processed");
  }
}

export async function notifyStaffPasswordChanged(
  member: Pick<StaffMember, "workspace_id" | "user_id">,
  email: string,
) {
  if (process.env.APP_MODE === "local") return;
  try {
    const { repo, mailer } = workspaceEmail(member.workspace_id);
    await sendPasswordChangedEmail(repo, mailer, member, email);
  } catch {
    console.error("Staff password change notice could not be sent");
  }
}
