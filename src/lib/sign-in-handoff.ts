import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./model";
import { decryptSecret, encryptSecret } from "./providers/secrets";
import { readCookie } from "./staff-session";
import { requestHost, workspaceDomain } from "./workspace-address";

// Signing in on a host that isn't a workspace's own address (app.yeswell.co):
// the password is checked there, then the browser carries a sealed one-time
// pass to the workspace's address, which turns it into the usual sign-in
// cookies. Sign-in cookies stay on each workspace's own address.
//
// The pass is useless on its own: it only redeems in the browser holding the
// matching cookie (set for the whole workspace domain, cleared on redeem),
// only on the address it names, and only for a minute.

export const HANDOFF_COOKIE = "yeswell_handoff";
export const HANDOFF_SECONDS = 60;
const PURPOSE = "staff-sign-in-handoff";

export type HandoffSession = {
  access_token: string;
  refresh_token?: string;
  user_id: string;
};
export type HandoffFlags = { two_step: boolean; password_change: boolean };
type Payload = HandoffSession &
  HandoffFlags & { host: string; nonce: string; exp: number };

const hash = (value: string) => createHash("sha256").update(value).digest();
const key = () => process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
const secure = (request: Request) =>
  new URL(request.url).protocol === "https:" ? "; Secure" : "";
const cookie = (request: Request, value: string, age: number) =>
  `${HANDOFF_COOKIE}=${value}; Domain=${workspaceDomain()}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax${secure(request)}`;

/** The address to open and the cookie that binds the pass to this browser. */
export function createHandoff(
  request: Request,
  origin: string,
  session: HandoffSession,
  flags: HandoffFlags,
  now = Date.now(),
) {
  const nonce = randomBytes(32).toString("base64url");
  const payload: Payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user_id: session.user_id,
    ...flags,
    host: new URL(origin).host.toLowerCase(),
    nonce: hash(nonce).toString("base64url"),
    exp: now + HANDOFF_SECONDS * 1000,
  };
  const pass = encryptSecret(JSON.stringify(payload), key(), PURPOSE);
  return {
    // A fragment never reaches a server or its logs; the page posts it.
    url: `${origin}/login/continue#${encodeURIComponent(pass)}`,
    cookie: cookie(request, nonce, HANDOFF_SECONDS * 2),
  };
}

export class HandoffExpired extends AppError {
  readonly code = "HANDOFF_EXPIRED";
  constructor() {
    super(400, "This sign-in expired or was already used.");
  }
}

/** Opens a pass on the address it was made for, in the browser it was made in. */
export function redeemHandoff(
  request: Request,
  pass: string,
  now = Date.now(),
) {
  let payload: Payload;
  try {
    payload = JSON.parse(decryptSecret(pass, key(), PURPOSE));
  } catch {
    throw new HandoffExpired();
  }
  const nonce = readCookie(request, HANDOFF_COOKIE);
  const expected = Buffer.from(payload.nonce ?? "", "base64url");
  if (
    typeof payload.exp !== "number" ||
    payload.exp < now ||
    payload.host !== requestHost(request).trim().toLowerCase() ||
    !nonce ||
    expected.length !== 32 ||
    !timingSafeEqual(hash(nonce), expected) ||
    !payload.access_token ||
    !payload.user_id
  )
    throw new HandoffExpired();
  return {
    session: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      user_id: payload.user_id,
    },
    flags: {
      two_step: payload.two_step === true,
      password_change: payload.password_change === true,
    },
    /** Clears the binding cookie, so the pass can't be used twice. */
    clear: cookie(request, "", 0),
  };
}

/** Where the browser goes once the pass is redeemed. */
export const handoffNext = (flags: HandoffFlags) =>
  flags.two_step
    ? "/login?state=two-step"
    : flags.password_change
      ? "/set-password"
      : "/";
