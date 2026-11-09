import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { AppError, check } from "../model";
import { sha256 } from "../content";
import { AppUrlSchema, appOrigin } from "../links";
import type { Repository } from "../repository";
import { decryptSecret, encryptSecret } from "./secrets";

export const QBO_CALLBACK = "/api/connections/qbo/callback";
export const QBO_STATE_COOKIE = "yeswell_qbo_state";
const TOKEN_ENDPOINT =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_ENDPOINT =
  "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const API = "https://sandbox-quickbooks.api.intuit.com/v3/company";
const STATE_TTL = 600;
const LEASE_MS = 90000;

export type QboConfig = {
  clientId: string;
  clientSecret: string;
  environment: string;
  encryptionKey: string;
  redirectUri?: string;
  // Supplied by the runtime only for local development.
  realm?: string;
  refreshToken?: string;
};
type ConnectionRow = {
  id: string;
  realm?: string;
  company?: string;
  ciphertext?: string;
  status?: "connected" | "reconnect" | "disconnected";
  last_sync?: string;
  lease?: { id: string; until: number };
};
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
type OAuthState = { id: string; actor: string; hash: string; until: number };
export type QboConnectionStatus = {
  state: "not_connected" | "connected" | "reconnect";
  available: boolean;
  environment: "sandbox";
  company?: string;
  realm?: string;
  last_sync?: string;
};

export const qboUuid = (key: string) =>
  sha256(key)
    .slice(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

export class QboReconnect extends AppError {
  constructor() {
    super(409, "Reconnect QuickBooks in Studio, then retry billing.");
  }
}

export class QboConnection {
  constructor(
    private repo: Repository,
    private config: QboConfig,
    private fetcher: typeof fetch,
  ) {
    check(
      config.environment === "sandbox",
      "Only QuickBooks sandbox is permitted",
      503,
    );
    check(
      !config.realm || /^\d+$/.test(config.realm),
      "QuickBooks sandbox realm required",
      503,
    );
  }

  private get id() {
    return this.repo.workspaceId;
  }

  private read() {
    return this.repo.providerCredential<ConnectionRow>(this.id);
  }

  private redirectUri() {
    const uri = this.config.redirectUri ?? appOrigin() + QBO_CALLBACK;
    const parsed = new URL(AppUrlSchema.parse(uri));
    check(
      parsed.pathname === QBO_CALLBACK && !parsed.search && !parsed.hash,
      "QuickBooks callback URL is not configured correctly",
      503,
    );
    return parsed;
  }

  private headers(contentType: string) {
    check(
      this.config.clientId &&
        this.config.clientSecret &&
        Buffer.from(this.config.encryptionKey, "base64").length === 32,
      "QuickBooks sandbox OAuth is not configured",
      503,
    );
    return {
      Authorization:
        "Basic " +
        Buffer.from(
          this.config.clientId + ":" + this.config.clientSecret,
        ).toString("base64"),
      "Content-Type": contentType,
      Accept: "application/json",
    };
  }

  async status(): Promise<QboConnectionStatus> {
    const row = await this.read();
    const legacyLocal =
      row?.status === undefined &&
      !!(this.config.realm && this.config.refreshToken);
    return {
      state:
        row?.status === "connected" || legacyLocal
          ? "connected"
          : row?.status === "reconnect" || !!(row?.ciphertext && !row.realm)
            ? "reconnect"
            : "not_connected",
      available: true,
      environment: "sandbox",
      company:
        row?.company ?? (legacyLocal ? "Local QuickBooks sandbox" : undefined),
      realm: row?.realm ?? (legacyLocal ? this.config.realm : undefined),
      last_sync: row?.last_sync,
    };
  }

  private stateId(actor: string) {
    return qboUuid(this.id + ":qbo-state:" + actor);
  }

  async authorize(actor: string, origin: string) {
    this.headers("application/x-www-form-urlencoded");
    const redirect = this.redirectUri();
    check(
      redirect.origin === origin,
      "Open Yeswell on the configured QuickBooks callback domain",
      400,
    );
    const state = randomBytes(32).toString("base64url");
    const id = this.stateId(actor);
    await this.repo.put("provider_credentials", {
      id,
      actor,
      hash: sha256(state),
      until: Date.now() + STATE_TTL * 1000,
    });
    const url = new URL("https://appcenter.intuit.com/connect/oauth2");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      scope: "com.intuit.quickbooks.accounting",
      response_type: "code",
      redirect_uri: redirect.href,
      state,
    }).toString();
    return {
      url: url.href,
      cookie: `${QBO_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=${QBO_CALLBACK}; Max-Age=${STATE_TTL}${redirect.protocol === "https:" ? "; Secure" : ""}`,
    };
  }

  async callback(actor: string, url: URL, cookieState: string) {
    const redirect = this.redirectUri();
    check(
      url.origin === redirect.origin && url.pathname === redirect.pathname,
      "Invalid QuickBooks callback",
      400,
    );
    const state = url.searchParams.get("state") ?? "";
    const record = await this.repo.providerCredential<OAuthState>(
      this.stateId(actor),
    );
    check(
      /^[\w-]{43}$/.test(state) &&
        state === cookieState &&
        record?.actor === actor &&
        record.hash === sha256(state) &&
        record.until > Date.now(),
      "QuickBooks connection request expired or did not match. Start again.",
      400,
    );
    check(
      await this.repo.replaceProviderCredential(record.id, record, null),
      "QuickBooks connection request was already used. Start again.",
      400,
    );
    const code = url.searchParams.get("code"),
      realm = url.searchParams.get("realmId");
    check(
      !url.searchParams.has("error") &&
        code &&
        code.length <= 4096 &&
        realm &&
        /^\d{1,30}$/.test(realm),
      "QuickBooks connection was not authorized. Start again.",
      400,
    );
    await this.exclusive(async (locked) => {
      check(
        locked.status !== "connected" || locked.realm === realm,
        "Disconnect the current QuickBooks company before connecting another.",
        409,
      );
      const tokens = await this.exchange({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect.href,
      });
      const info = await this.request<{
        CompanyInfo?: { CompanyName?: string; LegalName?: string };
      }>({ realm, accessToken: tokens.access_token }, `companyinfo/${realm}`);
      const company =
        info.CompanyInfo?.CompanyName || info.CompanyInfo?.LegalName;
      check(company, "QuickBooks did not return a sandbox company", 502);
      await this.finish(locked, this.connected(realm, company, tokens));
    });
  }

  private async exchange(params: Record<string, string>): Promise<Tokens> {
    const response = await this.fetcher(TOKEN_ENDPOINT, {
      method: "POST",
      headers: this.headers("application/x-www-form-urlencoded"),
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(25000),
      redirect: "error",
    }).catch(() => {
      throw new AppError(502, "QuickBooks sign-in is temporarily unavailable");
    });
    const result = (await response.json().catch(() => null)) ?? {};
    if (
      !response.ok &&
      params.grant_type === "refresh_token" &&
      result.error === "invalid_grant"
    )
      throw new QboReconnect();
    check(
      response.ok &&
        typeof result.access_token === "string" &&
        !!result.access_token &&
        typeof result.refresh_token === "string" &&
        !!result.refresh_token &&
        Number.isFinite(result.expires_in) &&
        result.expires_in > 0,
      "QuickBooks did not authorize the connection. Try connecting again.",
      502,
    );
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: Date.now() + result.expires_in * 1000,
    };
  }

  private connected(
    realm: string,
    company: string,
    tokens: Tokens,
  ): ConnectionRow {
    return {
      id: this.id,
      realm,
      company,
      status: "connected",
      last_sync: new Date().toISOString(),
      ciphertext: encryptSecret(
        JSON.stringify(tokens),
        this.config.encryptionKey,
        this.id,
      ),
    };
  }

  private tokens(row: ConnectionRow | null): Tokens | undefined {
    if (row?.ciphertext && (row.realm || this.config.realm)) {
      try {
        return JSON.parse(
          decryptSecret(row.ciphertext, this.config.encryptionKey, this.id),
        );
      } catch {
        throw new QboReconnect();
      }
    }
  }

  private async exclusive<T>(run: (locked: ConnectionRow) => Promise<T>) {
    const until = Date.now() + 28000;
    do {
      const row = await this.read();
      if (!row?.lease || row.lease.until <= Date.now()) {
        const locked = {
          ...row,
          id: this.id,
          lease: { id: randomUUID(), until: Date.now() + LEASE_MS },
        };
        if (await this.repo.replaceProviderCredential(this.id, row, locked)) {
          try {
            return await run(locked);
          } finally {
            const current = await this.read();
            if (current?.lease?.id === locked.lease.id) {
              const { lease: _, ...rest } = current;
              await this.repo.replaceProviderCredential(
                this.id,
                current,
                row ? rest : null,
              );
            }
          }
        }
      }
      await pause(150);
    } while (Date.now() < until);
    throw new AppError(503, "QuickBooks is connecting. Try again shortly.");
  }

  private async finish(locked: ConnectionRow, next: ConnectionRow | null) {
    check(
      await this.repo.replaceProviderCredential(this.id, locked, next),
      "QuickBooks connection changed. Try again.",
      409,
    );
  }

  private active(row: ConnectionRow | null) {
    if (row?.status === "reconnect" || row?.status === "disconnected")
      throw new QboReconnect();
    const realm = row?.realm ?? this.config.realm;
    if (!realm) throw new QboReconnect();
    return { realm, tokens: this.tokens(row) };
  }

  async access() {
    const current = await this.read();
    const first = this.active(current);
    if (
      !current?.lease &&
      first.tokens &&
      first.tokens.expires_at > Date.now() + 60000
    )
      return { realm: first.realm, accessToken: first.tokens.access_token };
    return this.exclusive(async (locked) => {
      const { realm, tokens } = this.active(locked);
      if (tokens && tokens.expires_at > Date.now() + 60000)
        return { realm, accessToken: tokens.access_token };
      const refresh = tokens?.refresh_token ?? this.config.refreshToken;
      if (!refresh) throw new QboReconnect();
      try {
        const next = await this.exchange({
          grant_type: "refresh_token",
          refresh_token: refresh,
        });
        await this.finish(
          locked,
          this.connected(
            realm,
            locked.company ?? "Local QuickBooks sandbox",
            next,
          ),
        );
        return { realm, accessToken: next.access_token };
      } catch (error) {
        if (error instanceof QboReconnect) {
          const { lease: _, ciphertext: _secret, ...rest } = locked;
          await this.finish(locked, { ...rest, status: "reconnect" });
        }
        throw error;
      }
    });
  }

  async disconnect() {
    await this.exclusive(async (locked) => {
      const token =
        this.tokens(locked)?.refresh_token ?? this.config.refreshToken;
      if (token) {
        const response = await this.fetcher(REVOKE_ENDPOINT, {
          method: "POST",
          headers: this.headers("application/json"),
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(25000),
          redirect: "error",
        }).catch(() => {
          throw new AppError(
            502,
            "QuickBooks could not disconnect. Try again.",
          );
        });
        check(response.ok, "QuickBooks could not disconnect. Try again.", 502);
      }
      await this.finish(
        locked,
        this.config.refreshToken
          ? { id: this.id, status: "disconnected" }
          : null,
      );
    });
  }

  async request<T>(
    connection: { realm: string; accessToken: string },
    path: string,
    body?: unknown,
    key?: string,
  ): Promise<T> {
    const url = `${API}/${connection.realm}/${path}${path.includes("?") ? "&" : "?"}minorversion=75${key ? "&requestid=" + sha256(key).slice(0, 40) : ""}`;
    const response = await this.fetcher(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + connection.accessToken,
        "Content-Type":
          body === null ? "application/octet-stream" : "application/json",
        Accept: "application/json",
      },
      ...(body === undefined || body === null
        ? {}
        : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25000),
      redirect: "error",
    }).catch(() => {
      throw new AppError(
        502,
        "QuickBooks is unavailable. Try billing again shortly.",
      );
    });
    if (response.status === 401 || response.status === 403) {
      const row = await this.read();
      if (
        !row?.lease &&
        row?.status === "connected" &&
        row.realm === connection.realm &&
        this.tokens(row)?.access_token === connection.accessToken
      ) {
        const { ciphertext: _, ...rest } = row;
        await this.repo.replaceProviderCredential(this.id, row, {
          ...rest,
          status: "reconnect",
        });
      }
      throw new QboReconnect();
    }
    if (response.status === 429 || response.status >= 500)
      throw new AppError(
        502,
        "QuickBooks is unavailable. Try billing again shortly.",
      );
    const data = await response.json().catch(() => null);
    if (
      data?.Fault?.Error?.some(
        (fault: { code?: string }) => fault.code === "600",
      )
    )
      throw new AppError(
        502,
        "QuickBooks already received the request. Retry to check the invoice.",
      );
    check(
      response.ok && data && !data.Fault,
      "QuickBooks rejected the request. Check the customer, items, and invoice settings.",
      422,
    );
    // Connection freshness is informational and cannot invalidate a provider write.
    try {
      const current = await this.read();
      if (
        !current?.lease &&
        current?.status === "connected" &&
        current.realm === connection.realm &&
        (!current.last_sync ||
          Date.now() - Date.parse(current.last_sync) > 60000)
      )
        await this.repo.replaceProviderCredential(this.id, current, {
          ...current,
          last_sync: new Date().toISOString(),
        });
    } catch {}
    return data as T;
  }
}
