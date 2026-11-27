import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

afterEach(() => vi.unstubAllEnvs());

function hostedEnv() {
  vi.stubEnv("APP_MODE", "local");
  vi.stubEnv("DATA_DIR", mkdtempSync(join(tmpdir(), "oauth-platform-")));
  vi.stubEnv("APP_URL", "https://acme.example.test");
  vi.stubEnv("OAUTH_ISSUER", "https://acme.example.test");
  vi.stubEnv("WORKSPACE_DOMAIN", "example.test");
  vi.stubEnv("DEV_STAFF_TOKEN", "t".repeat(48));
  vi.stubEnv("VERCEL", "");
}
const on = (host: string, path: string, init: RequestInit = {}) =>
  new Request(`https://${host}${path}`, {
    ...init,
    headers: { host, ...(init.headers ?? {}) },
  });

it("uses app.<domain> as its own issuer, separate from any workspace", async () => {
  hostedEnv();
  const rt = await import("../src/lib/oauth-runtime");
  expect(rt.platformIssuer()).toBe("https://app.example.test");
  expect(rt.isPlatformHost(on("app.example.test", "/mcp"))).toBe(true);
  expect(rt.isPlatformHost(on("acme.example.test", "/mcp"))).toBe(false);
  expect(rt.oauthIssuer(on("app.example.test", "/mcp"))).toBe(
    "https://app.example.test",
  );
  expect(rt.oauthServer(on("app.example.test", "/mcp")).resource).toBe(
    "https://app.example.test/mcp",
  );
  vi.stubEnv("WORKSPACE_DOMAIN", "");
  expect(rt.platformIssuer()).toBeNull();
});

it("sends an app.<domain> connection to sign-in, or to the remembered workspace", async () => {
  hostedEnv();
  const route = await import("../src/app/oauth/[action]/route");
  const ctx = (action: string) => ({ params: Promise.resolve({ action }) });
  const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
  const client = await (
    await route.POST(
      on("app.example.test", "/oauth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "ChatGPT",
          redirect_uris: [callback],
        }),
      }),
      ctx("register"),
    )
  ).json();
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: callback,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update("a".repeat(43))
      .digest("base64url"),
    resource: "https://app.example.test/mcp",
    scope: "proposals:read",
    state: "s",
  });
  const fresh = await route.GET(
    on("app.example.test", "/oauth/authorize?" + query),
    ctx("authorize"),
  );
  expect(fresh.status).toBe(303);
  const login = new URL(fresh.headers.get("location")!);
  expect(login.origin).toBe("https://app.example.test");
  expect(login.pathname).toBe("/login");
  expect(login.searchParams.get("next")).toBe("/oauth/connect?" + query);

  const remembered = await route.GET(
    on("app.example.test", "/oauth/authorize?" + query, {
      headers: { cookie: "yeswell_workspace=harbor" },
    }),
    ctx("authorize"),
  );
  const workspace = new URL(remembered.headers.get("location")!);
  expect(workspace.hostname).toBe("harbor.example.test");
  expect(workspace.pathname + workspace.search).toBe("/oauth/connect?" + query);

  // A bad request is refused before anyone is sent anywhere.
  const bad = new URLSearchParams(query);
  bad.set("redirect_uri", "https://evil.test/cb");
  const refused = await route.GET(
    on("app.example.test", "/oauth/authorize?" + bad),
    ctx("authorize"),
  );
  expect(refused.status).toBeGreaterThanOrEqual(400);

  // On a workspace address, connect asks the person to sign in there first.
  const connect = await route.GET(
    on("harbor.example.test", "/oauth/connect?" + query),
    ctx("connect"),
  );
  expect(connect.status).toBe(303);
  const there = new URL(connect.headers.get("location")!);
  expect(there.origin).toBe("https://harbor.example.test");
  expect(there.searchParams.get("next")).toBe("/oauth/connect?" + query);

  // Connect isn't served on app.<domain> itself.
  const none = await route.GET(
    on("app.example.test", "/oauth/connect?" + query),
    ctx("connect"),
  );
  expect(none.status).toBe(404);
});
