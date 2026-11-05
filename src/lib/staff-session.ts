import { createClient, type Session, type User } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { AppError } from "./model";
import { supabase } from "./repository";

export class StaffSessionExpired extends AppError {
  readonly code = "STAFF_SIGNED_OUT";
  constructor(message = "Staff login required") {
    super(401, message);
  }
}
export const STAFF_ACCESS_COOKIE = "proposal_session";
export const STAFF_REFRESH_COOKIE = "proposal_refresh";
export const STAFF_SESSION_AGE = 30 * 24 * 60 * 60;
const responseCookies = new WeakMap<Request, string[]>();
const refreshes = new Map<
  string,
  { until: number; result: Promise<Session> }
>();
const REUSE_MS = 10_000;
export function readCookie(request: Request, name: string) {
  const raw = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  try {
    return raw ? decodeURIComponent(raw) : "";
  } catch {
    return "";
  }
}
function serialized(name: string, value: string, path: string, age: number) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${age}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function staffCookiePair(
  access: string,
  refresh?: string,
  age = STAFF_SESSION_AGE,
) {
  return [
    serialized(STAFF_ACCESS_COOKIE, access, "/", age),
    ...(refresh !== undefined
      ? [
          serialized(STAFF_REFRESH_COOKIE, refresh, "/", age),
          serialized(STAFF_REFRESH_COOKIE, "", "/api", 0),
        ]
      : []),
  ];
}
export function setStaffCookies(
  response: Response,
  session: Pick<Session, "access_token" | "refresh_token">,
) {
  for (const value of staffCookiePair(
    session.access_token,
    session.refresh_token,
  ))
    response.headers.append("Set-Cookie", value);
  return response;
}
export function clearStaffCookies(response: Response) {
  for (const value of staffCookiePair("", "", 0))
    response.headers.append("Set-Cookie", value);
  return response;
}
export function withStaffCookies(request: Request, response: Response) {
  for (const value of responseCookies.get(request) ?? [])
    response.headers.append("Set-Cookie", value);
  return response;
}
/** Only cookies minted/validated by this request are forwarded; never trust actor headers. */
export function staffRequestHeaders(request: Request) {
  const headers = new Headers(request.headers);
  const values = responseCookies.get(request);
  if (values?.length) {
    const cookies = (headers.get("cookie") ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(
        (s) =>
          s &&
          ![STAFF_ACCESS_COOKIE, STAFF_REFRESH_COOKIE].some((name) =>
            s.startsWith(name + "="),
          ),
      );
    cookies.push(
      ...values
        .filter((s) => !s.includes("Max-Age=0"))
        .map((s) => s.split(";")[0]),
    );
    headers.set("cookie", cookies.join("; "));
  }
  return headers;
}
export function authClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    throw new AppError(503, "Configure Supabase Auth");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
function retryable(error: { status?: number; name?: string }) {
  return (
    (error.status ?? 0) >= 500 ||
    error.status === 429 ||
    error.name === "AuthRetryableFetchError"
  );
}
function refreshKey(token: string) {
  return createHash("sha256")
    .update(`${process.env.SUPABASE_URL}\0${token}`)
    .digest("hex");
}
async function refresh(token: string) {
  const now = Date.now(),
    key = refreshKey(token);
  for (const [id, entry] of refreshes)
    if (entry.until <= now) refreshes.delete(id);
  const existing = refreshes.get(key);
  if (existing) return existing.result;
  // Single-flight plus a bounded reuse window for requests already in transit.
  // Other server instances use Supabase's documented rotation reuse interval.
  const result = (async () => {
    const { data, error } = await authClient().auth.refreshSession({
      refresh_token: token,
    });
    if (error || !data.session) {
      if (error && retryable(error))
        throw new AppError(503, "Sign-in service unavailable. Try again.");
      throw new StaffSessionExpired();
    }
    return data.session;
  })();
  if (refreshes.size >= 512) refreshes.delete(refreshes.keys().next().value!);
  const entry = { until: Infinity, result };
  refreshes.set(key, entry);
  void result
    .then(() => {
      entry.until = Date.now() + REUSE_MS;
    })
    .catch(() => {
      if (refreshes.get(key) === entry) refreshes.delete(key);
    });
  return result;
}
export type StaffCredentials = {
  user: User;
  access_token: string;
  refresh_token?: string;
  browser: boolean;
};
export async function staffCredentials(
  request: Request,
): Promise<StaffCredentials> {
  const authorization = request.headers.get("authorization");
  const browser = !authorization;
  let access_token = (
    authorization ?? readCookie(request, STAFF_ACCESS_COOKIE)
  ).replace(/^Bearer /, "");
  let refresh_token = browser
    ? readCookie(request, STAFF_REFRESH_COOKIE)
    : undefined;
  try {
    if ((!access_token && !refresh_token) || !process.env.SUPABASE_URL)
      throw new StaffSessionExpired();
    if (access_token) {
      const { data, error } = await supabase().auth.getUser(access_token);
      if (!error && data.user)
        return { user: data.user, access_token, refresh_token, browser };
      if (error && retryable(error))
        throw new AppError(503, "Sign-in service unavailable. Try again.");
    }
    if (!refresh_token) throw new StaffSessionExpired("Invalid session");
    const session = await refresh(refresh_token);
    access_token = session.access_token;
    refresh_token = session.refresh_token;
    return { user: session.user, access_token, refresh_token, browser };
  } catch (error) {
    if (browser && error instanceof AppError && error.status === 401)
      responseCookies.set(request, staffCookiePair("", "", 0));
    throw error;
  }
}
/** Touch both browser cookies only after staff membership was verified. */
export function keepStaffSession(
  request: Request,
  credentials: StaffCredentials,
) {
  if (credentials.browser)
    responseCookies.set(
      request,
      staffCookiePair(credentials.access_token, credentials.refresh_token),
    );
}
export async function revokeStaffSession(request: Request) {
  const original = readCookie(request, STAFF_REFRESH_COOKIE);
  let rotated: string | undefined;
  try {
    if (!process.env.SUPABASE_URL) return;
    // Local development credentials and OAuth bearer tokens are outside this flow.
    if (
      process.env.APP_MODE === "local" &&
      process.env.NODE_ENV !== "production" &&
      !process.env.VERCEL
    )
      return;
    let access = readCookie(request, STAFF_ACCESS_COOKIE);
    if (original) {
      const session = await refresh(original);
      access = session.access_token;
      rotated = session.refresh_token;
    }
    if (access) await supabase().auth.admin.signOut(access, "local");
  } catch {
    /* Logout still clears browser cookies if Auth is unavailable. */
  } finally {
    if (original) refreshes.delete(refreshKey(original));
    if (rotated) refreshes.delete(refreshKey(rotated));
  }
}
