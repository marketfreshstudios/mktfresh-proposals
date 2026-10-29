import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { check, type Actor } from "./model";
import { sha256 } from "./content";
import { LOCAL_WORKSPACE_ID } from "./workspace";
import type { OAuthStore, OAuthRecord } from "./oauth-store";
const token = () => randomBytes(32).toString("base64url");
export const MCP_SCOPES = ["proposals:read", "proposals:draft"];
export class OAuthServer {
  constructor(
    public store: OAuthStore,
    public issuer: string,
    private redirects: string[],
    private clock = () => Date.now(),
  ) {
    const u = new URL(issuer);
    check(
      u.protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(u.hostname),
      "OAuth issuer must use HTTPS",
    );
  }
  get resource() {
    return this.issuer + "/mcp";
  }
  metadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: this.issuer + "/oauth/authorize",
      token_endpoint: this.issuer + "/oauth/token",
      registration_endpoint: this.issuer + "/oauth/register",
      revocation_endpoint: this.issuer + "/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: MCP_SCOPES,
      authorization_response_iss_parameter_supported: true,
    };
  }
  async register(raw: unknown) {
    const input = z
      .object({
        client_name: z.string().min(1).max(100).default("AI assistant"),
        redirect_uris: z.array(z.url()).min(1).max(5),
        token_endpoint_auth_method: z.literal("none").default("none"),
        grant_types: z
          .array(z.enum(["authorization_code", "refresh_token"]))
          .optional(),
        response_types: z.array(z.literal("code")).optional(),
      })
      .parse(raw);
    check(
      input.redirect_uris.every((uri) => this.redirects.includes(uri)),
      "Redirect URI is not allowlisted",
    );
    const client_id = token();
    await this.store.put({
      id: randomUUID(),
      workspace_id: LOCAL_WORKSPACE_ID,
      kind: "client",
      hash: sha256(client_id),
      data: { ...input, client_id },
    });
    return {
      ...input,
      client_id,
      client_id_issued_at: Math.floor(this.clock() / 1000),
    };
  }
  async validateAuthorization(params: Record<string, string>) {
    const client = await this.store.find(sha256(params.client_id ?? ""));
    check(client?.kind === "client", "Unknown OAuth client");
    check(
      client.data.redirect_uris.includes(params.redirect_uri),
      "Redirect URI mismatch",
    );
    check(
      params.response_type === "code" &&
        params.code_challenge_method === "S256" &&
        /^[\w-]{43}$/.test(params.code_challenge ?? ""),
      "PKCE S256 is required",
    );
    check(params.resource === this.resource, "Resource audience mismatch");
    const scopes = (params.scope ?? "proposals:read proposals:draft")
      .split(" ")
      .filter(Boolean);
    check(
      scopes.length && scopes.every((s) => MCP_SCOPES.includes(s)),
      "Invalid scope",
    );
    return { client, scopes };
  }
  async authorize(params: Record<string, string>, actor: Actor) {
    check(
      actor.actor.startsWith("staff:") && actor.workspace_id,
      "Staff login required",
      401,
    );
    const { client, scopes } = await this.validateAuthorization(params);
    const code = token();
    await this.store.put({
      id: randomUUID(),
      workspace_id: actor.workspace_id,
      kind: "code",
      hash: sha256(code),
      data: {
        client_id: params.client_id,
        connector_name: client.data.client_name,
        redirect_uri: params.redirect_uri,
        challenge: params.code_challenge,
        resource: this.resource,
        scopes,
        user_id: actor.actor.slice(6),
        expires_at: this.clock() + 300000,
        used: false,
      },
    });
    const target = new URL(params.redirect_uri);
    target.searchParams.set("code", code);
    target.searchParams.set("iss", this.issuer);
    if (params.state) target.searchParams.set("state", params.state);
    return target.toString();
  }
  private async issue(grant: OAuthRecord) {
    const access = token(),
      refresh = token();
    await this.store.put({
      id: randomUUID(),
      workspace_id: grant.workspace_id,
      kind: "token",
      hash: sha256(access),
      data: {
        grant_id: grant.id,
        client_id: grant.data.client_id,
        resource: this.resource,
        refresh_hash: sha256(refresh),
        expires_at: this.clock() + 3600000,
        refresh_expires_at: this.clock() + 30 * 86400000,
        used: false,
      },
    });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope: grant.data.scopes.join(" "),
    };
  }
  async exchange(params: Record<string, string>) {
    check(params.resource === this.resource, "Resource audience mismatch");
    if (params.grant_type === "authorization_code") {
      const code = await this.store.find(sha256(params.code ?? ""));
      check(
        code?.kind === "code" &&
          code.data.expires_at > this.clock() &&
          !code.data.used,
        "Invalid or expired authorization code",
      );
      check(
        code.data.client_id === params.client_id &&
          code.data.redirect_uri === params.redirect_uri,
        "OAuth client or redirect mismatch",
      );
      check(
        /^[\w.~-]{43,128}$/.test(params.code_verifier ?? ""),
        "Invalid PKCE verifier",
      );
      check(
        createHash("sha256")
          .update(params.code_verifier)
          .digest("base64url") === code.data.challenge,
        "PKCE verification failed",
      );
      check(
        await this.store.consume(code.id),
        "Authorization code already used",
      );
      const grant: OAuthRecord = {
        id: randomUUID(),
        workspace_id: code.workspace_id,
        kind: "grant",
        hash: sha256(token()),
        data: {
          client_id: params.client_id,
          connector_name: code.data.connector_name,
          user_id: code.data.user_id,
          scopes: code.data.scopes,
          revoked: false,
          created_at: new Date(this.clock()).toISOString(),
          last_used: null,
        },
      };
      await this.store.put(grant);
      return this.issue(grant);
    }
    check(params.grant_type === "refresh_token", "Unsupported grant type");
    const old = await this.store.find(sha256(params.refresh_token ?? ""), true);
    check(
      old?.kind === "token" && old.data.client_id === params.client_id,
      "Invalid refresh token",
    );
    const grant = await this.store.get(old.data.grant_id);
    check(grant?.kind === "grant" && !grant.data.revoked, "Connector revoked");
    if (old.data.used || !(await this.store.consume(old.id))) {
      grant.data.revoked = true;
      await this.store.put(grant);
      throw new Error("Refresh token reuse detected; reconnect assistant");
    }
    check(old.data.refresh_expires_at > this.clock(), "Refresh token expired");
    return this.issue(grant);
  }
  async authenticate(access: string) {
    const record = await this.store.find(sha256(access));
    check(
      record?.kind === "token" &&
        !record.data.used &&
        record.data.expires_at > this.clock() &&
        record.data.resource === this.resource,
      "Invalid connector token",
      401,
    );
    const grant = await this.store.get(record.data.grant_id);
    check(
      grant?.kind === "grant" && !grant.data.revoked,
      "Connector revoked",
      401,
    );
    await this.store.touch(grant.id, new Date(this.clock()).toISOString());
    return {
      actor: {
        actor: "ai:" + grant.data.connector_name,
        workspace_id: grant.workspace_id,
        ip: "",
        user_agent: "MCP",
      },
      scopes: grant.data.scopes as string[],
      user_id: grant.data.user_id as string,
    };
  }
  async revoke(id: string, workspace: string) {
    const grant = await this.store.get(id);
    check(
      grant?.kind === "grant" && grant.workspace_id === workspace,
      "Connector not found",
      404,
    );
    grant.data.revoked = true;
    await this.store.put(grant);
  }
}
