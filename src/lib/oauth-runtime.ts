import { OAuthServer } from "./oauth";
import { LocalOAuthStore, SupabaseOAuthStore } from "./oauth-store";
import { supabase } from "./repository";
let server: OAuthServer | undefined;
export function oauthServer() {
  return (server ??= new OAuthServer(
    process.env.APP_MODE === "local"
      ? new LocalOAuthStore(process.env.DATA_DIR ?? ".data")
      : new SupabaseOAuthStore(supabase()),
    (
      process.env.OAUTH_ISSUER ??
      process.env.APP_URL ??
      "http://127.0.0.1:3000"
    ).replace(/\/$/, ""),
    [
      "https://claude.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      ...(process.env.OAUTH_REDIRECT_URIS ?? "").split(",").filter(Boolean),
    ],
  ));
}
