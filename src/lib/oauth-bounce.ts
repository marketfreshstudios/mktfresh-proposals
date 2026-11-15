import { randomBytes } from "node:crypto";
import { workspaceOrigin } from "./links";
import { requestHost, validWorkspaceSlug } from "./workspace-address";

// QuickBooks and Stripe each allow one registered callback URL, on one host.
// A workspace on its own address starts the connection there and names itself
// in the OAuth state; the registered host bounces the callback back to that
// address, where the state cookie was set and the exchange happens.

const NONCE = /^[\w-]{43}$/;
/** The registered QuickBooks and Stripe Connect callback paths. */
export const OAUTH_CALLBACK_PATHS = [
  "/api/connections/qbo/callback",
  "/api/connections/stripe/callback",
];

/** A one-time OAuth state, naming the workspace address when it has one. */
export function oauthState(slug?: string | null) {
  const nonce = randomBytes(32).toString("base64url");
  return slug && validWorkspaceSlug(slug) ? `${nonce}.${slug}` : nonce;
}

/** The workspace address an OAuth state names, or null. Undefined if malformed. */
export function oauthStateSlug(state: string): string | null | undefined {
  const [nonce, slug, ...rest] = state.split(".");
  if (rest.length || !NONCE.test(nonce ?? "")) return undefined;
  if (slug === undefined) return null;
  return validWorkspaceSlug(slug) ? slug : undefined;
}

/** Origins allowed to run a connection whose callback is `callback`. */
export function oauthOriginAllowed(
  callback: URL,
  origin: string,
  slug?: string | null,
) {
  return (
    origin === callback.origin || (!!slug && workspaceOrigin(slug) === origin)
  );
}

/** A callback URL that arrived for the given state is genuine when it is the
 * registered callback, or that same path on the address the state names. */
export function oauthCallbackAllowed(callback: URL, url: URL, state: string) {
  if (url.pathname !== callback.pathname) return false;
  if (url.origin === callback.origin) return true;
  const slug = oauthStateSlug(state);
  return !!slug && workspaceOrigin(slug) === url.origin;
}

/** On the registered callback host, sends a callback for another workspace's
 * address there, query intact. Null when it belongs here. */
export function bounceOAuthCallback(
  req: Request,
  paths: string[] = OAUTH_CALLBACK_PATHS,
) {
  const url = new URL(req.url);
  if (req.method !== "GET" || !paths.includes(url.pathname)) return null;
  const slug = oauthStateSlug(url.searchParams.get("state") ?? "");
  if (!slug) return null;
  const target = new URL(url.pathname + url.search, workspaceOrigin(slug));
  if (target.host === requestHost(req).toLowerCase()) return null;
  return new Response(null, {
    status: 303,
    headers: { Location: target.href, "Cache-Control": "no-store" },
  });
}
