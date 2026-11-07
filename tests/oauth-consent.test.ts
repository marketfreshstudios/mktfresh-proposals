import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

it("lets the consent form redirect to the registered callback origin, and only that origin", async () => {
  process.env.APP_MODE = "local";
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "oauth-consent-"));
  process.env.OAUTH_ISSUER = "http://127.0.0.1:3000";
  process.env.DEV_STAFF_TOKEN = "t".repeat(48);
  delete process.env.VERCEL;
  const route = await import("../src/app/oauth/[action]/route");
  const ctx = (action: string) => ({ params: Promise.resolve({ action }) });
  const callback = "https://claude.ai/api/mcp/auth_callback";
  const registered = await route.POST(
    new Request("http://127.0.0.1:3000/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude",
        redirect_uris: [callback],
      }),
    }),
    ctx("register"),
  );
  const client = await registered.json();
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: callback,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update("a".repeat(43))
      .digest("base64url"),
    resource: "http://127.0.0.1:3000/mcp",
    scope: "proposals:read proposals:draft",
    state: "s",
  });
  const page = await route.GET(
    new Request("http://127.0.0.1:3000/oauth/authorize?" + query, {
      headers: { authorization: "Bearer " + process.env.DEV_STAFF_TOKEN },
    }),
    ctx("authorize"),
  );
  expect(page.status).toBe(200);
  const csp = page.headers.get("content-security-policy") ?? "";
  expect(csp).toContain("form-action 'self' https://claude.ai;");
  expect(csp).not.toContain("*");
});

it("adds a separately described template scope without expanding old grants on refresh", async () => {
  const { OAuthServer, MCP_SCOPE_LABELS } = await import("../src/lib/oauth");
  const { MemoryOAuthStore } = await import("../src/lib/oauth-store");
  const { staff } = await import("./helpers");
  const oauth = new OAuthServer(
    new MemoryOAuthStore(),
    "https://app.example.test",
    ["https://claude.ai/api/mcp/auth_callback"],
  );
  const client = await oauth.register({
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  const params = {
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update("a".repeat(43))
      .digest("base64url"),
    resource: oauth.resource,
    scope: "proposals:read proposals:draft",
  };
  const redirect = new URL(
    await oauth.authorize(params, {
      ...staff,
      workspace_id: "00000000-0000-4000-8000-000000000001",
    }),
  );
  const first = await oauth.exchange({
    ...params,
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    code_verifier: "a".repeat(43),
  });
  const next = await oauth.exchange({
    grant_type: "refresh_token",
    client_id: client.client_id,
    refresh_token: first.refresh_token,
    resource: oauth.resource,
  });
  expect((await oauth.authenticate(next.access_token)).scopes).toEqual([
    "proposals:read",
    "proposals:draft",
  ]);
  expect(MCP_SCOPE_LABELS["templates:edit"]).toBe(
    "Create and edit templates and saved blocks; nothing is sent",
  );
  expect(
    (
      await oauth.validateAuthorization({
        ...params,
        scope: "proposals:read templates:edit",
      })
    ).scopes,
  ).toContain("templates:edit");
});
