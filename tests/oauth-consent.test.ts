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
