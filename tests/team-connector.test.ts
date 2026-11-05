import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { OAuthServer } from "../src/lib/oauth";
import { MemoryOAuthStore } from "../src/lib/oauth-store";
import { AppError } from "../src/lib/model";
import { staff } from "./helpers";
it("deactivated membership refuses both existing MCP access and connector refresh tokens", async () => {
  let active = true;
  const server = new OAuthServer(
    new MemoryOAuthStore(),
    "https://app.example.test",
    ["https://claude.ai/api/mcp/auth_callback"],
    undefined,
    async () => {
      if (!active) throw new AppError(401, "Staff access revoked");
    },
  );
  const c = await server.register({
      client_name: "Assistant",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    }),
    verifier = "v".repeat(43),
    params = {
      client_id: c.client_id,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      resource: server.resource,
      scope: "proposals:read proposals:draft",
    };
  const url = await server.authorize(params, {
      ...staff,
      workspace_id: "00000000-0000-4000-8000-000000000001",
    }),
    pair = await server.exchange({
      ...params,
      grant_type: "authorization_code",
      code: new URL(url).searchParams.get("code")!,
      code_verifier: verifier,
    });
  expect((await server.authenticate(pair.access_token)).scopes).toContain(
    "proposals:draft",
  );
  active = false;
  await expect(server.authenticate(pair.access_token)).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    server.exchange({
      grant_type: "refresh_token",
      client_id: c.client_id,
      resource: server.resource,
      refresh_token: pair.refresh_token,
    }),
  ).rejects.toMatchObject({ status: 401 });
});
