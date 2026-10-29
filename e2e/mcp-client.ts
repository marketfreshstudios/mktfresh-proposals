import { createHash } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
export async function connectAssistant(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const registration = await request.post("/oauth/register", {
    data: {
      client_name: "E2E assistant",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);
  const client = await registration.json();
  const verifier = "e".repeat(43),
    params = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      resource: "http://127.0.0.1:3100/mcp",
      scope: "proposals:read proposals:draft",
      state: "e2e",
    });
  const consent = await request.get("/oauth/authorize?" + params, { headers });
  expect(consent.ok(), await consent.text()).toBe(true);
  const html = await consent.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)![1];
  const approved = await request.post("/oauth/authorize", {
    headers,
    form: { ...Object.fromEntries(params), csrf, decision: "allow" },
    maxRedirects: 0,
  });
  expect(approved.status(), await approved.text()).toBe(303);
  const code = new URL(approved.headers().location).searchParams.get("code")!;
  const exchange = await request.post("/oauth/token", {
    form: {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: client.redirect_uris[0],
      resource: "http://127.0.0.1:3100/mcp",
    },
  });
  expect(exchange.ok(), await exchange.text()).toBe(true);
  const tokens = await exchange.json();
  return async (name: string, args: unknown) => {
    const response = await request.post("/mcp", {
      headers: {
        Authorization: "Bearer " + tokens.access_token,
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const body = await response.json();
    expect(body.result.isError, JSON.stringify(body)).not.toBe(true);
    return JSON.parse(body.result.content[0].text);
  };
}
