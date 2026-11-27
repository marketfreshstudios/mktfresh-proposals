import { activeConnectorMember } from "./staff-access";
import { OAuthServer } from "./oauth";
import { LocalOAuthStore, SupabaseOAuthStore } from "./oauth-store";
import { supabase } from "./repository";
import { workspaceOrigin } from "./links";
import {
  requestHost,
  workspaceDomain,
  workspaceSlugFromHost,
} from "./workspace-address";

const servers = new Map<string, OAuthServer>();
let store: LocalOAuthStore | SupabaseOAuthStore | undefined;

function defaultIssuer() {
  return (
    process.env.OAUTH_ISSUER ??
    process.env.APP_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

/** The connector's issuer for this request: a workspace's own address when
 * it's opened there (each workspace's MCP URL is {address}/mcp, and tokens
 * are bound to that resource), otherwise OAUTH_ISSUER. */
/** The one connector address for every workspace (app.yeswell.co), where
 * signing in decides the workspace. Null without WORKSPACE_DOMAIN. */
export function platformIssuer() {
  const domain = workspaceDomain();
  return domain ? `https://app.${domain}` : null;
}

export function isPlatformHost(req: Request) {
  const issuer = platformIssuer();
  return (
    !!issuer &&
    requestHost(req).toLowerCase().replace(/:\d+$/, "") === new URL(issuer).host
  );
}

export function oauthIssuer(req?: Request) {
  if (req && isPlatformHost(req)) return platformIssuer()!;
  const slug = req ? workspaceSlugFromHost(requestHost(req)) : null;
  return slug ? workspaceOrigin(slug) : defaultIssuer();
}

/** The server for the shared address, used from a workspace's own address
 * to finish a connection that started on app.yeswell.co. */
export function platformOAuthServer() {
  const issuer = platformIssuer();
  return issuer ? serverFor(issuer) : null;
}

export function oauthServer(req?: Request) {
  return serverFor(oauthIssuer(req));
}

function serverFor(issuer: string) {
  let server = servers.get(issuer);
  if (!server) {
    store ??=
      process.env.APP_MODE === "local"
        ? new LocalOAuthStore(process.env.DATA_DIR ?? ".data")
        : new SupabaseOAuthStore(supabase());
    server = new OAuthServer(
      store,
      issuer,
      [
        "https://claude.ai/api/mcp/auth_callback",
        "https://chatgpt.com/connector_platform_oauth_redirect",
        ...(process.env.OAUTH_REDIRECT_URIS ?? "").split(",").filter(Boolean),
      ],
      undefined,
      activeConnectorMember,
    );
    servers.set(issuer, server);
  }
  return server;
}
