import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { AppError, check } from "./model";
import { supabase } from "./repository";
import { authClient } from "./staff-session";
import { SupabaseTeamAuth } from "./team";
import { StaffPasswordSchema } from "./team-model";
import { ResendMailer } from "./jobs";
import { yeswellFrom } from "./email-identity";
import { workspaceOrigin } from "./links";
import { validWorkspaceSlug } from "./workspace-address";
import { forgetWorkspaceAddresses } from "./workspace-host";

const name = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Required")
    .max(max)
    .refine((v) => !/[\r\n]/.test(v), "Use a single line");
export const SignupSchema = z
  .object({
    business_name: name(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .refine(validWorkspaceSlug, "Use 3 to 30 letters, numbers or hyphens"),
    first_name: name(100),
    last_name: name(100),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email())
      .transform((email) => email.toLowerCase()),
    password: StaffPasswordSchema,
  })
  .strict();
export type SignupInput = z.infer<typeof SignupSchema>;

export const signupEnabled = () => process.env.SIGNUP_ENABLED === "true";

// Lowercase, ASCII, hyphens between words, trimmed to 30 characters.
export function addressFromName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return slug;
}

export type SignupDeps = {
  admit(emailHash: string, ipHash: string): Promise<boolean>;
  addressFree(slug: string): Promise<boolean>;
  identity(
    email: string,
  ): Promise<{
    id: string;
    workspace_id: string | null;
    confirmed: boolean;
  } | null>;
  createUser(
    email: string,
    password: string,
    fullName: string,
  ): Promise<string>;
  updatePendingUser(
    id: string,
    password: string,
    fullName: string,
  ): Promise<void>;
  reserve(
    user: string,
    slug: string,
    business: string,
    fullName: string,
  ): Promise<"reserved" | "address_taken" | "member">;
  link(email: string): Promise<string>;
  send(
    message: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    },
    key: string,
  ): Promise<void>;
  from(): string | null;
};

export class SignupError extends AppError {
  constructor(
    status: number,
    message: string,
    public code: "address_taken" | "email_has_workspace" | "rate_limited",
    public suggestion?: string,
  ) {
    super(status, message);
  }
}

function keyHash(kind: string, value: string) {
  const salt = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!salt || salt.length < 32)
    throw new AppError(503, "Signup is unavailable");
  return createHmac("sha256", salt)
    .update(`signup:${kind}\0${value}`)
    .digest("hex");
}
export function signupIp(headers: Headers) {
  const forwarded = process.env.VERCEL
    ? (headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ?? "")
    : "";
  return isIP(forwarded) ? forwarded : "unavailable";
}

export async function suggestAddress(
  slug: string,
  deps: Pick<SignupDeps, "addressFree">,
) {
  for (let n = 2; n <= 9; n++) {
    const candidate = `${slug.slice(0, 28).replace(/-+$/, "")}-${n}`;
    if (validWorkspaceSlug(candidate) && (await deps.addressFree(candidate)))
      return candidate;
  }
  return undefined;
}

export async function checkAddress(
  raw: string,
  deps: Pick<SignupDeps, "addressFree">,
) {
  const slug = raw.trim().toLowerCase();
  if (!validWorkspaceSlug(slug)) return { available: false, valid: false };
  if (await deps.addressFree(slug)) return { available: true, valid: true };
  return {
    available: false,
    valid: true,
    suggestion: await suggestAddress(slug, deps),
  };
}

const emailHasWorkspace = () =>
  new SignupError(
    409,
    "That email already has a workspace. Sign in instead.",
    "email_has_workspace",
  );

export async function startSignup(raw: unknown, ip: string, deps: SignupDeps) {
  const input = SignupSchema.parse(raw);
  const from = deps.from();
  check(from, "Signup email is not set up yet", 503);
  if (!(await deps.admit(keyHash("email", input.email), keyHash("ip", ip))))
    throw new SignupError(
      429,
      "Too many signup attempts. Try again in an hour.",
      "rate_limited",
    );
  const fullName = `${input.first_name} ${input.last_name}`;
  const taken = async () =>
    new SignupError(
      409,
      `${input.slug} is taken.`,
      "address_taken",
      await suggestAddress(input.slug, deps),
    );
  if (!(await deps.addressFree(input.slug))) throw await taken();
  const identity = await deps.identity(input.email);
  if (identity?.workspace_id || identity?.confirmed) throw emailHasWorkspace();
  // An unconfirmed identity has never proven it owns the email; the person who
  // does can always start over, and only they receive the link.
  const user = identity
    ? (await deps.updatePendingUser(identity.id, input.password, fullName),
      identity.id)
    : await deps.createUser(input.email, input.password, fullName);
  const reserved = await deps.reserve(
    user,
    input.slug,
    input.business_name,
    fullName,
  );
  if (reserved === "member") throw emailHasWorkspace();
  if (reserved === "address_taken") throw await taken();
  const origin = workspaceOrigin(input.slug);
  const url = `${origin}/start/confirm#token_hash=${encodeURIComponent(await deps.link(input.email))}`;
  const host = new URL(origin).host;
  await deps.send(
    {
      from,
      to: input.email,
      subject: `Confirm your email to finish setting up ${input.business_name}`,
      text: `Hi ${input.first_name},\n\nConfirm your email to finish setting up ${host}:\n${url}\n\nThis link works for 1 hour. If you didn't start a Yeswell trial, you can ignore this email.`,
      html: signupEmailHtml(input.first_name, host, url),
    },
    `signup:${user}:${Date.now()}`,
  );
  return { email: input.email, address: host };
}

const escape = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function signupEmailHtml(first: string, host: string, url: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2efe8;font-family:Helvetica,Arial,sans-serif;color:#13303a">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#faf8f4;border:1px solid #e2ddd3;border-radius:14px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:16px">Hi ${escape(first)},</p>
<p style="margin:0 0 22px;font-size:16px;line-height:24px">Confirm your email to finish setting up <strong>${escape(host)}</strong>.</p>
<a href="${escape(url)}" style="display:inline-block;background:#bf5f2e;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px">Confirm email</a>
<p style="margin:22px 0 0;font-size:13px;line-height:19px;color:#55616a">This link works for 1 hour. If you didn't start a Yeswell trial, you can ignore this email.</p>
</div></div></body></html>`;
}

export async function completeSignup(raw: unknown) {
  const { token_hash } = z
    .object({ token_hash: z.string().min(1).max(2000) })
    .strict()
    .parse(raw);
  const { data, error } = await authClient().auth.verifyOtp({
    token_hash,
    type: "magiclink",
  });
  check(
    !error && data.session && data.user,
    "This link is invalid or expired. Start over to get a new one.",
    410,
  );
  const result = await supabase().rpc("complete_workspace_signup", {
    target_user: data.user!.id,
  });
  check(
    !result.error && result.data?.length,
    "This signup has expired. Start over to get a new link.",
    410,
  );
  forgetWorkspaceAddresses();
  const row = result.data[0] as { workspace_id: string; slug: string | null };
  return { session: data.session!, origin: workspaceOrigin(row.slug) };
}

export function supabaseSignupDeps(): SignupDeps {
  const db = supabase();
  const auth = new SupabaseTeamAuth(db);
  const mailer = new ResendMailer();
  return {
    async admit(emailHash, ipHash) {
      const { data, error } = await db.rpc("admit_staff_password_reset", {
        target_email_hash: emailHash,
        target_ip_hash: ipHash,
      });
      if (error) throw new AppError(503, "Signup is unavailable. Try again.");
      return data === true;
    },
    async addressFree(slug) {
      const { data, error } = await db.rpc("workspace_address_free", {
        target_slug: slug,
      });
      if (error) throw new AppError(503, "Signup is unavailable. Try again.");
      return data === true;
    },
    identity: (email) => auth.findByEmail(email),
    async createUser(email, password, fullName) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name: fullName },
      });
      check(
        !error && data.user,
        "Could not create your account. Check the password and try again.",
        400,
      );
      return data.user!.id;
    },
    async updatePendingUser(id, password, fullName) {
      const { error } = await db.auth.admin.updateUserById(id, {
        password,
        user_metadata: { full_name: fullName },
      });
      check(!error, "Could not update your account. Try again.", 400);
    },
    async reserve(user, slug, business, fullName) {
      const { data, error } = await db.rpc("reserve_workspace_signup", {
        target_user: user,
        target_slug: slug,
        target_business: business,
        target_name: fullName,
      });
      if (error) throw new AppError(503, "Signup is unavailable. Try again.");
      return data;
    },
    async link(email) {
      const { data, error } = await db.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      check(
        !error && data.properties?.hashed_token,
        "Could not create your confirmation link. Try again.",
        503,
      );
      return data.properties!.hashed_token;
    },
    send: (message, key) => mailer.send(message, key),
    from: () => yeswellFrom(),
  };
}
