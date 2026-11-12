import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { check } from "./model";
import { ResendMailer } from "./jobs";
import { supabase, SupabaseRepository } from "./repository";
import { workspaceSecuritySender, yeswellFrom } from "./email-identity";
import { emailLayout } from "./email-layout";
import { escape } from "./presentation";
import { appOrigin } from "./links";
import type { WorkspaceSettings } from "./workspace";
import {
  admitStaffSecurityAttempt,
  confirmCurrentPassword,
  manageStaffSessions,
  staffSecurityIdentity,
  type StaffSecurityIdentity,
} from "./staff-security";
import { StaffSessionExpired } from "./staff-session";
import { StaffSecurityRequired } from "./staff-security-session";

type Pending = {
  user_id: string;
  old_email: string;
  new_email: string;
  token_hash: string;
  expires_at: string;
  claimed_at: string | null;
};

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const emailChange = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("request"),
      email: z.string().trim().max(254).pipe(z.email()),
      password: z.string().min(1).max(200),
    })
    .strict(),
  z.object({ action: z.literal("resend") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
]);

async function pendingEmail(user: string) {
  const { data, error } = await supabase()
    .from("staff_email_changes")
    .select("*")
    .eq("user_id", user)
    .maybeSingle();
  check(!error, "Unable to read the pending email change. Try again.", 503);
  return data as Pending | null;
}

export async function staffPendingEmail(user: string) {
  const pending = await pendingEmail(user);
  return pending
    ? { email: pending.new_email, expires_at: pending.expires_at }
    : null;
}

export async function staffEmailAction(
  identity: StaffSecurityIdentity,
  raw: unknown,
) {
  const input = emailChange.parse(raw);
  const db = supabase(),
    user = identity.user.id;
  const previous = await pendingEmail(user);
  if (input.action === "cancel") {
    if (!previous) return null;
    const { data, error } = await db
      .from("staff_email_changes")
      .delete()
      .eq("user_id", user)
      .eq("token_hash", previous.token_hash)
      .is("claimed_at", null)
      .select("user_id")
      .maybeSingle();
    check(
      !error && data,
      "The request changed or confirmation is in progress. Refresh and try again.",
      409,
    );
    return null;
  }

  check(
    !previous?.claimed_at,
    "Confirmation is in progress. Try again shortly.",
    409,
  );
  await admitStaffSecurityAttempt(user, "email");
  if (input.action === "request")
    await confirmCurrentPassword(identity, input.password);
  else
    check(
      previous && previous.old_email === identity.user.email,
      "Start a new email change first.",
      409,
    );

  const old = identity.user.email!;
  const email =
    input.action === "request"
      ? input.email.toLowerCase()
      : previous!.new_email;
  check(email !== old.toLowerCase(), "Enter a different email address.");
  const repo = new SupabaseRepository(db, identity.member.workspace_id);
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  const from = settings && workspaceSecuritySender(settings);
  check(
    (from || yeswellFrom()) && process.env.RESEND_API_KEY,
    "Ask your super admin to configure workspace email before changing your address.",
    409,
  );

  const token = randomBytes(32).toString("base64url");
  const next = {
    user_id: user,
    old_email: old,
    new_email: email,
    token_hash: hash(token),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
  const result = previous
    ? await db
        .from("staff_email_changes")
        .update(next)
        .eq("user_id", user)
        .eq("token_hash", previous.token_hash)
        .is("claimed_at", null)
        .select("user_id")
        .maybeSingle()
    : await db
        .from("staff_email_changes")
        .insert(next)
        .select("user_id")
        .maybeSingle();
  check(
    !result.error && result.data,
    "The request changed. Refresh and try again.",
    409,
  );

  const send = (
    to: string,
    title: string,
    message: string,
    button: { label: string; url: string },
    kind: string,
  ) =>
    new ResendMailer().send(
      {
        to,
        subject: title,
        from: yeswellFrom() ?? `Yeswell <${from}>`,
        reply_to: settings.email,
        ...emailLayout({
          title,
          staff: true,
          origin: appOrigin(),
          bodyHtml: `<p>${escape(message)}</p>`,
          bodyText: message,
          button,
          workspace: settings.company_name,
          sender: "Yeswell",
          contact: settings.email,
          accent: settings.accent_colour,
        }),
      },
      `staff-email-change:${next.token_hash}:${kind}`,
    );

  const url = new URL("/login/confirm-email", appOrigin());
  url.hash = new URLSearchParams({ token }).toString();
  try {
    await Promise.all([
      send(
        email,
        "Confirm your new Yeswell email",
        "Confirm this address to change how you sign in. This link expires in 24 hours.",
        { label: "Confirm email", url: url.toString() },
        "confirmation",
      ),
      send(
        old,
        "A change was requested for your Yeswell email",
        `A request was made to change your sign-in email to ${email}. If this wasn't you, sign in to cancel it or contact your workspace admin.`,
        { label: "Review your account", url: `${appOrigin()}/account` },
        "notice",
      ),
    ]);
  } catch {
    check(
      false,
      "The email change is pending, but we couldn’t deliver both messages. Use Resend to try again.",
      503,
    );
  }
  return { email, expires_at: next.expires_at };
}

export async function confirmStaffEmailChange(request: Request, raw: unknown) {
  const { token } = z
    .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .strict()
    .parse(raw);
  const db = supabase(),
    tokenHash = hash(token);
  let current: StaffSecurityIdentity | null = null;
  try {
    current = await staffSecurityIdentity(request);
  } catch (error) {
    if (!(
      error instanceof StaffSessionExpired ||
      error instanceof StaffSecurityRequired
    ))
      throw error;
  }
  const now = new Date(),
    claim = now.toISOString();
  const { data: pending, error } = await db
    .from("staff_email_changes")
    .update({ claimed_at: claim })
    .eq("token_hash", tokenHash)
    .gt("expires_at", claim)
    .or(
      `claimed_at.is.null,claimed_at.lt.${new Date(now.getTime() - 120_000).toISOString()}`,
    )
    .select("*")
    .maybeSingle();
  check(!error, "Unable to verify the link. Try again.", 503);
  check(
    pending,
    "This confirmation link is invalid, expired, or already in use.",
    410,
  );
  const user = pending.user_id as string;
  if (current?.user.id !== user) current = null;
  let addressUpdated = false;
  try {
    const { data: member, error: memberError } = await db
      .from("staff_users")
      .select("status")
      .eq("user_id", user)
      .maybeSingle();
    check(
      !memberError && member?.status === "active",
      "This account cannot change its email.",
      403,
    );
    const { data: account, error: identityError } =
      await db.auth.admin.getUserById(user);
    check(
      !identityError &&
        account.user?.email &&
        (!account.user.banned_until ||
          Date.parse(account.user.banned_until) <= Date.now()),
      "This account cannot change its email.",
      403,
    );
    check(
      [pending.old_email, pending.new_email].includes(account.user.email),
      "This confirmation link is no longer valid.",
      410,
    );

    // Once Auth confirms the new address, the database gate blocks every other
    // session until revocation completes. Retrying can finish a partial update.
    const keeper = await db
      .from("staff_email_changes")
      .update({
        keep_session: current?.session ?? null,
      })
      .eq("user_id", user)
      .eq("token_hash", tokenHash)
      .eq("claimed_at", claim)
      .select("user_id")
      .maybeSingle();
    check(
      !keeper.error && keeper.data,
      "Unable to confirm the email change. Try again.",
      503,
    );
    if (account.user.email !== pending.new_email) {
      const changed = await db.auth.admin.updateUserById(user, {
        email: pending.new_email,
        email_confirm: true,
      });
      check(
        !changed.error,
        "Unable to change to that address. Try a different email.",
        409,
      );
    }
    addressUpdated = true;
    await manageStaffSessions(user, current?.session ?? null, "others");
    const deleted = await db
      .from("staff_email_changes")
      .delete()
      .eq("user_id", user)
      .eq("token_hash", tokenHash)
      .eq("claimed_at", claim);
    check(!deleted.error, "Email changed. Sign in with your new address.", 503);
    return { email: pending.new_email as string, signed_in: !!current };
  } catch (error) {
    if (!addressUpdated)
      await db
        .from("staff_email_changes")
        .update({ claimed_at: null, keep_session: null })
        .eq("user_id", user)
        .eq("token_hash", tokenHash)
        .eq("claimed_at", claim);
    throw error;
  }
}
