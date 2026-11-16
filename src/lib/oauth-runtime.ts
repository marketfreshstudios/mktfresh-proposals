import { activeConnectorMember } from "./staff-access";
import { OAuthServer } from "./oauth";
import { LocalOAuthStore, SupabaseOAuthStore } from "./oauth-store";
import { supabase } from "./repository";
import { workspaceOrigin } from "./links";
import { requestHost, workspaceSlugFromHost } from "./workspace-address";

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
export function oauthIssuer(req?: Request) {
  const slug = req ? workspaceSlugFromHost(requestHost(req)) : null;
  return slug ? workspaceOrigin(slug) : defaultIssuer();
}

export function oauthServer(req?: Request) {
  const issuer = oauthIssuer(req);
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
