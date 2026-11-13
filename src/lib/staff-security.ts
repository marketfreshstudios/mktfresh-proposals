import { z } from "zod";
import QRCode from "qrcode";
import { check } from "./model";
import { supabase } from "./repository";
import { decryptSecret, encryptSecret } from "./providers/secrets";
import {
  authClient,
  type StaffCredentials,
  staffCredentials,
} from "./staff-session";
import { sessionId, validateStaffMembership } from "./staff-access";
import {
  acceptedTotpStep,
  backupHash,
  newBackupCodes,
  newTotpSecret,
  securityKey,
} from "./staff-security-crypto";
import { StaffPasswordSchema } from "./team-model";
import { setStaffPassword } from "./staff-password";

export async function staffSecurityIdentity(request: Request, twoStep = false) {
  const identity = await staffCredentials(request);
  check(identity.browser, "Use your browser to change security settings", 403);
  const member = await validateStaffMembership(
    identity.user,
    identity.access_token,
    {
      twoStep,
      passwordChange: twoStep,
    },
  );
  const session = sessionId(identity.access_token);
  check(session, "Sign in again to change security settings", 401);
  return { ...identity, session, member };
}

export type StaffSecurityIdentity = Awaited<
  ReturnType<typeof staffSecurityIdentity>
>;
type Enrollment = {
  secret: string;
  session: string;
  expires: number;
  step?: number;
  hashes?: string[];
};
type Factor = {
  revision: string;
  totp_secret: string | null;
  backup_hashes: string[];
  last_totp_step: number | null;
  enrollment: Enrollment | null;
};

export type StaffDevice = {
  id: string;
  current: boolean;
  device: string;
  location: string | null;
  last_active: string;
};

function deviceLabel(agent: string) {
  const device = /iPad/.test(agent)
    ? "iPad"
    : /iPhone/.test(agent)
      ? "iPhone"
      : /Android/.test(agent)
        ? "Android"
        : /Macintosh/.test(agent)
          ? "Mac"
          : /Windows/.test(agent)
            ? "Windows"
            : /Linux/.test(agent)
              ? "Linux"
              : "Unknown device";
  const browser = /Edg(?:e|A|iOS)?\//.test(agent)
    ? "Edge"
    : /(?:Chrome|CriOS)\//.test(agent)
      ? "Chrome"
      : /(?:Firefox|FxiOS)\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : "";
  return browser ? `${device} | ${browser}` : device;
}

function sessionLocation(headers: Headers) {
  if (!process.env.VERCEL) return null;
  const city = headers.get("x-vercel-ip-city");
  if (!city) return null;
  try {
    return (
      [decodeURIComponent(city), headers.get("x-vercel-ip-country-region")]
        .filter(Boolean)
        .join(", ")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 100) || null
    );
  } catch {
    return null;
  }
}

export async function recordStaffDevice(
  request: Request,
  identity: {
    user: { id: string };
    access_token: string;
  },
) {
  const id = sessionId(identity.access_token);
  if (!id) return;
  const db = supabase();
  const { error } = await db.from("staff_security_sessions").upsert(
    {
      session_id: id,
      user_id: identity.user.id,
      user_agent: request.headers.get("user-agent")?.slice(0, 1000),
      location: sessionLocation(request.headers),
    },
    { onConflict: "session_id", ignoreDuplicates: true },
  );
  // Device labels are best effort; a failed label write must not disable sign-in.
  if (error) console.warn("Unable to record the sign-in device");
}

export async function manageStaffSessions(
  user: string,
  current: string | null,
  action: "list" | "one" | "others",
  target: string | null = null,
) {
  const { data, error } = await supabase().rpc("manage_staff_sessions", {
    target_user: user,
    current_session: current,
    operation: action,
    target_session: target,
  });
  check(!error, "Unable to manage your sessions. Try again.", 503);
  return data;
}

export async function admitStaffSecurityAttempt(
  user: string,
  kind: "email" | "password" | "verification",
) {
  const { data, error } = await supabase().rpc("admit_staff_security_attempt", {
    target_user: user,
    attempt_kind: kind,
  });
  check(!error, "Unable to verify this request. Try again.", 503);
  check(data, "Too many attempts. Try again in 15 minutes.", 429);
}

export async function confirmCurrentPassword(
  identity: StaffCredentials,
  password: string,
) {
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: identity.user.email!,
    password,
  });
  check(
    !error && data.session && data.user.id === identity.user.id,
    "Current password is incorrect",
    400,
  );
  const ended = await supabase().auth.admin.signOut(
    data.session.access_token,
    "local",
  );
  check(!ended.error, "Unable to complete the password check. Try again.", 503);
}

async function factor(user: string) {
  const { data, error } = await supabase()
    .from("staff_security")
    .select("revision,totp_secret,backup_hashes,last_totp_step,enrollment")
    .eq("user_id", user)
    .maybeSingle();
  check(!error, "Unable to read two-step verification settings", 503);
  return data as Factor | null;
}

async function replaceFactor(
  identity: StaffSecurityIdentity,
  current: Factor,
  update: Partial<Factor>,
  options: {
    verify?: boolean;
    revoke?: boolean;
  } = {},
) {
  const { data, error } = await supabase().rpc("save_staff_factor", {
    target_user: identity.user.id,
    target_session: identity.session,
    expected_revision: current.revision,
    replacement: { ...current, ...update },
    verify_session: options.verify ?? false,
    revoke_others: options.revoke ?? false,
  });
  check(!error, "Unable to update two-step verification. Try again.", 503);
  check(data, "Security settings changed. Try again with a fresh code.", 409);
}

export async function readStaffSecurity(identity: StaffSecurityIdentity) {
  const [current, rows, password] = await Promise.all([
    factor(identity.user.id),
    manageStaffSessions(identity.user.id, identity.session, "list"),
    supabase()
      .from("team_audit")
      .select("created_at")
      .eq("workspace_id", identity.member.workspace_id)
      .eq("target_user_id", identity.user.id)
      .in("action", ["password_set", "password_changed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const sessions: StaffDevice[] = rows.map(
    ({
      user_agent,
      ...row
    }: Omit<StaffDevice, "device"> & { user_agent: string }) => ({
      ...row,
      device: deviceLabel(user_agent),
    }),
  );
  return {
    two_step: !!current?.totp_secret,
    backup_codes_remaining: current?.backup_hashes.length ?? 0,
    password_changed_at:
      (password.data?.created_at as string | undefined) ?? null,
    sessions,
  };
}

function proof(user: string, current: Factor, input: string) {
  check(current.totp_secret, "Two-step verification is off", 409);
  const code = input.trim();
  if (/^\d{6}$/.test(code)) {
    const step = acceptedTotpStep(
      decryptSecret(current.totp_secret, securityKey(), `staff-totp:${user}`),
      code,
    );
    check(
      step !== null && step > (current.last_totp_step ?? -1),
      "Enter a fresh code from your authenticator app",
      400,
    );
    return { last_totp_step: step };
  }
  const hash = backupHash(user, code);
  check(
    current.backup_hashes.includes(hash),
    "This backup code is invalid or has already been used",
    400,
  );
  return {
    backup_hashes: current.backup_hashes.filter((stored) => stored !== hash),
  };
}

const password = z.string().min(1).max(200);
const verificationCode = z.string().trim().min(1).max(40);
const factorAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z
    .object({
      action: z.literal("prepare"),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/),
    })
    .strict(),
  z.object({ action: z.literal("enable") }).strict(),
  z.object({ action: z.literal("disable"), code: verificationCode }).strict(),
  z
    .object({ action: z.literal("regenerate"), code: verificationCode })
    .strict(),
]);

export async function staffFactorAction(
  identity: StaffSecurityIdentity,
  raw: unknown,
) {
  const input = factorAction.parse(raw),
    user = identity.user.id;
  if (input.action === "start") {
    await admitStaffSecurityAttempt(user, "verification");
    const { error } = await supabase()
      .from("staff_security")
      .upsert(
        { user_id: user },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    check(!error, "Unable to start two-step verification", 503);
    const current = await factor(user);
    check(
      current && !current.totp_secret,
      "Two-step verification is already on",
      409,
    );
    const secret = newTotpSecret();
    const enrollment = {
      secret: encryptSecret(secret, securityKey(), `staff-totp:${user}`),
      session: identity.session,
      expires: Date.now() + 10 * 60_000,
    };
    const label = encodeURIComponent(`Yeswell:${identity.user.email}`);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=Yeswell`;
    const qr = await QRCode.toDataURL(uri, { width: 144, margin: 2 });
    await replaceFactor(identity, current, { enrollment });
    return { secret, qr };
  }

  const current = await factor(user);
  check(current, "Start two-step setup again", 409);
  if (input.action === "prepare" || input.action === "enable") {
    const enrollment = current.enrollment;
    check(
      !current.totp_secret &&
        enrollment &&
        enrollment.session === identity.session &&
        enrollment.expires > Date.now(),
      "Setup expired. Start two-step setup again.",
      409,
    );
    if (input.action === "prepare") {
      await admitStaffSecurityAttempt(user, "verification");
      const secret = decryptSecret(
        enrollment.secret,
        securityKey(),
        `staff-totp:${user}`,
      );
      const step = acceptedTotpStep(secret, input.code);
      check(
        step !== null,
        "Enter a current code from your authenticator app",
        400,
      );
      const codes = newBackupCodes();
      await replaceFactor(identity, current, {
        enrollment: {
          ...enrollment,
          step,
          hashes: codes.map((code) => backupHash(user, code)),
        },
      });
      return { codes };
    }
    check(
      enrollment.hashes?.length === 8 && enrollment.step !== undefined,
      "Verify your authenticator first",
      409,
    );
    await replaceFactor(
      identity,
      current,
      {
        totp_secret: enrollment.secret,
        backup_hashes: enrollment.hashes,
        last_totp_step: enrollment.step,
        enrollment: null,
      },
      { verify: true, revoke: true },
    );
    return { enabled: true };
  }

  await admitStaffSecurityAttempt(user, "verification");
  const checked = proof(user, current, input.code);
  if (input.action === "disable") {
    await replaceFactor(
      identity,
      current,
      {
        totp_secret: null,
        backup_hashes: [],
        last_totp_step: null,
        enrollment: null,
      },
      { revoke: true },
    );
    return { enabled: false };
  }
  const codes = newBackupCodes();
  await replaceFactor(identity, current, {
    ...checked,
    backup_hashes: codes.map((code) => backupHash(user, code)),
  });
  return { codes };
}

export async function verifyStaffSignIn(request: Request, raw: unknown) {
  const { code } = z.object({ code: verificationCode }).strict().parse(raw);
  const identity = await staffSecurityIdentity(request, true);
  const user = identity.user.id;
  const current = await factor(user);
  check(
    current?.totp_secret && identity.member.two_step_required,
    "This sign-in no longer needs a code",
    409,
  );
  await admitStaffSecurityAttempt(user, "verification");
  await replaceFactor(identity, current, proof(user, current, code), {
    verify: true,
  });
  return identity;
}

export async function changeSecurityPassword(
  request: Request,
  identity: StaffSecurityIdentity,
  raw: unknown,
) {
  const input = z
    .object({ current_password: password, password: StaffPasswordSchema })
    .strict()
    .parse(raw);
  check(
    input.current_password !== input.password,
    "Choose a password different from your current one",
  );
  await admitStaffSecurityAttempt(identity.user.id, "password");
  const priorFactor = await factor(identity.user.id);
  const session = await setStaffPassword(request, input);
  const current = sessionId(session.access_token);
  check(current, "Password changed. Sign in again.", 401);
  await recordStaffDevice(request, session);
  const db = supabase();
  // The prior browser already passed its second step and the old password was
  // checked again. Transfer verification to the replacement Auth session only.
  if (priorFactor?.totp_secret) {
    const { data, error } = await db.rpc("save_staff_factor", {
      target_user: identity.user.id,
      target_session: current,
      expected_revision: priorFactor.revision,
      replacement: priorFactor,
      verify_session: true,
      revoke_others: false,
    });
    check(!error, "Password changed. Sign in again.", 503);
    // A changed factor leaves this session unverified and prompts for a new code.
    if (!data) console.info("Two-step settings changed during password update");
  }
  await manageStaffSessions(identity.user.id, current, "others");
  return session;
}
