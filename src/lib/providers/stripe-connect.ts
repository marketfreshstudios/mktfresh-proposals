import { randomBytes } from "node:crypto";
import { AppError, check, type Actor, type Client } from "../model";
import { sha256 } from "../content";
import { AppUrlSchema, appOrigin } from "../links";
import { LOCAL_WORKSPACE_ID } from "../workspace";
import { decryptSecret, encryptSecret } from "./secrets";
import {
  STRIPE_VERSION,
  StripeHttp,
  requireTestStripeKey,
} from "./stripe-http";
import { stripeCustomerMatchesByEmail } from "../client-billing";
import { syncStripeCatalog } from "../catalog";
import { workspaceEvent } from "../studio";
import type { Repository } from "../repository";
import type { StripeConnectionStatus } from "../stripe-connect-status";

export const stripeConnectCallback = "/api/connections/stripe/callback";
export const stripeConnectCookie = "yeswell_stripe_connect_state";
const stateAge = 600;
const leaseAge = 300000;
const accountId = /^acct_[a-zA-Z0-9]+$/;

type Config = {
  key: string;
  clientId: string;
  encryptionKey: string;
  redirectUri?: string;
  eventsConfigured: boolean;
};
type OAuthState = { id: string; hash: string; actor: string; expires: number };
type Account = { id: string; mode: "test" };
type Connection = {
  id: string;
  kind: "stripe_connect";
  account_hash: string;
  ciphertext: string;
  name?: string;
  connectedAt: string;
  actorName?: string;
  state: "connected" | "disconnected" | "disconnecting";
  products?: { count: number; at: string };
  customers?: { checked: number; linked: number; review: number };
  setupError?: boolean;
  lease?: { id: string; expires: number };
};
const stableId = (label: string) =>
  sha256(label)
    .slice(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
export function stripeAccountHash(id: string) {
  check(accountId.test(id), "Invalid Stripe account", 400);
  return sha256("stripe-connect:test:" + id);
}

export function stripeConnectConfig(): Config | undefined {
  const key = process.env.STRIPE_CONNECT_SECRET_KEY;
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (
    process.env.BILLING_MODE !== "test" ||
    !key ||
    !/^sk_test_[a-zA-Z0-9]+$/.test(key) ||
    !clientId ||
    !/^ca_[a-zA-Z0-9]+$/.test(clientId) ||
    !encryptionKey ||
    Buffer.from(encryptionKey, "base64").length !== 32
  )
    return;
  return {
    key,
    clientId,
    encryptionKey,
    redirectUri: process.env.STRIPE_CONNECT_REDIRECT_URI,
    eventsConfigured:
      !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.startsWith("whsec_"),
  };
}

export class StripeConnect {
  private id: string;
  constructor(
    private repo: Repository,
    private config: Config,
    private fetcher: typeof fetch = fetch,
  ) {
    check(
      repo.workspaceId !== LOCAL_WORKSPACE_ID,
      "The platform workspace uses its own Stripe account.",
      409,
    );
    requireTestStripeKey(config.key);
    this.id = stableId(repo.workspaceId + ":stripe-connect");
  }
  private read() {
    return this.repo.providerCredential<Connection>(this.id);
  }
  private callbackUrl() {
    const url = new URL(
      this.config.redirectUri ?? appOrigin() + stripeConnectCallback,
    );
    check(
      AppUrlSchema.safeParse(url.origin).success &&
        url.pathname === stripeConnectCallback &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      "Configure the Stripe Connect callback URL.",
      503,
    );
    return url;
  }
  private stateId(actor: string) {
    return stableId(this.id + ":state:" + actor);
  }
  cookie(value: string, age: number) {
    return `${stripeConnectCookie}=${value}; HttpOnly; SameSite=Lax; Path=${stripeConnectCallback}; Max-Age=${age}${this.callbackUrl().protocol === "https:" ? "; Secure" : ""}`;
  }
  async authorize(actor: Actor, origin: string, mode: "test") {
    check(
      mode === "test",
      "Live Stripe Connect is available after go-live.",
      409,
    );
    const redirect = this.callbackUrl();
    check(
      redirect.origin === origin,
      "Open Yeswell on the configured Stripe Connect domain.",
      403,
    );
    const current = await this.read();
    check(
      !current || current.state === "disconnected",
      "Disconnect the current Stripe account before reconnecting.",
      409,
    );
    const state = randomBytes(32).toString("base64url");
    await this.repo.put("provider_credentials", {
      id: this.stateId(actor.actor),
      actor: actor.actor,
      hash: sha256(state),
      expires: Date.now() + stateAge * 1000,
    });
    const url = new URL("https://connect.stripe.com/oauth/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      scope: "read_write",
      redirect_uri: redirect.href,
      state,
    }).toString();
    return { url: url.href, cookie: this.cookie(state, stateAge) };
  }
  private async oauth(
    path: "token" | "deauthorize",
    params: Record<string, string>,
  ) {
    const message =
      path === "token"
        ? "Stripe could not authorize this test account. Try connecting again."
        : "Stripe could not confirm the disconnection. Try again.";
    const response = await this.fetcher(
      "https://connect.stripe.com/oauth/" + path,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(this.config.key + ":").toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      },
    ).catch(() => {
      throw new AppError(502, message);
    });
    const result = await response.json().catch(() => null);
    check(response.ok && result && !result.error, message, 502);
    return result;
  }
  async callback(actor: Actor, url: URL, cookieState: string) {
    const redirect = this.callbackUrl();
    check(
      url.origin === redirect.origin && url.pathname === redirect.pathname,
      "Invalid Stripe callback.",
      400,
    );
    const state = url.searchParams.get("state") ?? "";
    const record = await this.repo.providerCredential<OAuthState>(
      this.stateId(actor.actor),
    );
    check(
      /^[\w-]{43}$/.test(state) &&
        state === cookieState &&
        record?.actor === actor.actor &&
        record.expires > Date.now() &&
        record.hash === sha256(state),
      "Stripe connection request expired or did not match. Start again.",
      400,
    );
    check(
      await this.repo.replaceProviderCredential(record.id, record, null),
      "Stripe connection request was already used.",
      400,
    );
    const code = url.searchParams.get("code");
    check(
      code && code.length <= 4096 && !url.searchParams.has("error"),
      "Stripe connection was not authorized.",
      400,
    );
    const current = await this.read();
    check(
      !current || current.state === "disconnected",
      "This workspace already has a Stripe connection.",
      409,
    );
    const result = await this.oauth("token", {
      grant_type: "authorization_code",
      code,
    });
    const id = result.stripe_user_id;
    check(
      typeof id === "string" &&
        accountId.test(id) &&
        result.livemode === false &&
        result.scope === "read_write",
      "A Stripe test account with write access is required.",
      409,
    );
    const platform = await new StripeHttp(
      this.config.key,
      this.repo,
      this.fetcher,
    ).get<{ id: string }>("/v1/account");
    check(
      accountId.test(platform.id) && platform.id !== id,
      "Choose a Stripe account other than the Yeswell platform account.",
      409,
    );
    const hash = stripeAccountHash(id);
    check(
      !current || current.account_hash === hash,
      "Reconnect the same Stripe account to preserve billing links.",
      409,
    );
    const account: Account = { id, mode: "test" };
    const detail = await new StripeHttp(
      this.config.key,
      this.repo,
      this.fetcher,
      id,
    ).get<{
      id: string;
      business_profile?: { name?: string };
      settings?: { dashboard?: { display_name?: string } };
    }>("/v1/account");
    check(detail.id === id, "Stripe returned a different account.", 409);
    const row: Connection = {
      id: this.id,
      kind: "stripe_connect",
      account_hash: hash,
      ciphertext: encryptSecret(
        JSON.stringify(account),
        this.config.encryptionKey,
        this.id,
      ),
      name:
        detail.business_profile?.name ||
        detail.settings?.dashboard?.display_name,
      connectedAt: new Date().toISOString(),
      actorName: actor.staff_name,
      state: "connected",
    };
    check(
      await this.repo.replaceProviderCredential(this.id, current, row),
      "Stripe connection changed. Reload the page.",
      409,
    );
    await workspaceEvent(this.repo, actor, "stripe_connect_authorized", {
      provider: "stripe",
    });
  }
  private account(row: Connection): Account {
    try {
      const account = JSON.parse(
        decryptSecret(row.ciphertext, this.config.encryptionKey, this.id),
      ) as Account;
      check(
        account.mode === "test" &&
          stripeAccountHash(account.id) === row.account_hash,
        "Invalid Stripe account.",
      );
      return account;
    } catch {
      throw new AppError(503, "Stripe connection could not be verified.");
    }
  }
  async activeAccount() {
    const row = await this.read();
    return row?.state === "connected" ? this.account(row) : undefined;
  }
  transport(account: Account) {
    return new StripeHttp(
      this.config.key,
      this.repo,
      this.fetcher,
      account.id,
      async () => {
        check(
          (await this.activeAccount())?.id === account.id,
          "Connect this workspace’s Stripe account to continue.",
          409,
        );
      },
    );
  }
  async status(): Promise<StripeConnectionStatus> {
    const row = await this.read();
    if (!row || row.state === "disconnected")
      return {
        state: "not_connected",
        available: true,
        eventsConfigured: this.config.eventsConfigured,
      };
    if (row.state === "disconnecting")
      return {
        state: "disconnecting",
        available: true,
        eventsConfigured: this.config.eventsConfigured,
        setupRunning: !!row.lease && row.lease.expires > Date.now(),
      };
    const account = this.account(row);
    return {
      state: row.products && row.customers ? "connected" : "setting_up",
      available: true,
      eventsConfigured: this.config.eventsConfigured,
      setupRunning: !!row.lease && row.lease.expires > Date.now(),
      setupError: row.setupError,
      products: row.products,
      customers: row.customers,
      connectedAt: row.connectedAt,
      actorName: row.actorName,
      accountName: row.name,
      accountSuffix: account.id.slice(-4),
      dashboardUrl: this.transport(account).dashboardUrl,
    };
  }
  async runSetup(actor: Actor) {
    const current = await this.read();
    if (
      current?.state !== "connected" ||
      (current.products && current.customers) ||
      (current.lease && current.lease.expires > Date.now())
    )
      return;
    let claim: Connection = {
      ...current,
      setupError: false,
      lease: {
        id: randomBytes(12).toString("hex"),
        expires: Date.now() + leaseAge,
      },
    };
    if (!(await this.repo.replaceProviderCredential(this.id, current, claim)))
      return;
    const update = async (next: Connection) => {
      check(
        await this.repo.replaceProviderCredential(this.id, claim, next),
        "Stripe setup changed.",
        409,
      );
      claim = next;
    };
    try {
      const api = this.transport(this.account(claim));
      if (!claim.products) {
        const result = await syncStripeCatalog(this.repo, api);
        await update({
          ...claim,
          products: { count: result.imported, at: result.synced_at },
        });
        await workspaceEvent(this.repo, actor, "catalog_synced", {
          provider: "stripe",
          ...result,
        });
      }
      if (!claim.customers) {
        const clients = await this.repo.entities<Client>("clients");
        const eligible = clients.filter((client) => !client.stripe_customer_id);
        const duplicates = new Set<string>();
        const emails = new Set<string>();
        for (const client of clients) {
          const email = client.email.trim().toLowerCase();
          if (emails.has(email)) duplicates.add(email);
          emails.add(email);
        }
        const matchesByEmail = await stripeCustomerMatchesByEmail(
          new Set(eligible.map((client) => client.email.trim().toLowerCase())),
          api,
        );
        let linked = 0;
        let review = 0;
        for (let i = 0; i < eligible.length; i += 6) {
          await Promise.all(
            eligible.slice(i, i + 6).map(async (client) => {
              const email = client.email.trim().toLowerCase();
              if (duplicates.has(email)) {
                review++;
                return;
              }
              const matches = matchesByEmail.get(email) ?? [];
              if (matches.length > 1) {
                review++;
                return;
              }
              if (matches.length === 1) {
                try {
                  await this.repo.linkClientStripe(
                    client.id,
                    null,
                    client.email,
                    matches[0].id,
                    actor,
                  );
                  linked++;
                } catch (error) {
                  if (
                    !(error instanceof AppError) ||
                    ![404, 409].includes(error.status)
                  )
                    throw error;
                  review++;
                }
              }
            }),
          );
        }
        await update({
          ...claim,
          customers: { checked: eligible.length, linked, review },
        });
      }
      const { lease: _, ...finished } = claim;
      await update(finished);
    } catch {
      const { lease: _, ...failed } = claim;
      await this.repo.replaceProviderCredential(this.id, claim, {
        ...failed,
        setupError: true,
      });
    }
  }
  async disconnect(actor: Actor) {
    const current = await this.read();
    check(
      current?.state === "connected" || current?.state === "disconnecting",
      "No Stripe connection to disconnect.",
      409,
    );
    check(
      !current.lease || current.lease.expires <= Date.now(),
      "Wait for Stripe setup to finish before disconnecting.",
      409,
    );
    const account = this.account(current);
    const pending: Connection = {
      ...current,
      state: "disconnecting",
      lease: {
        id: randomBytes(12).toString("hex"),
        expires: Date.now() + 30000,
      },
    };
    check(
      await this.repo.replaceProviderCredential(this.id, current, pending),
      "Stripe connection changed. Reload the page.",
      409,
    );
    try {
      const result = await this.oauth("deauthorize", {
        client_id: this.config.clientId,
        stripe_user_id: account.id,
      });
      check(
        result.stripe_user_id === account.id,
        "Stripe returned a different account.",
        409,
      );
    } catch (err) {
      const { lease: _, ...retry } = pending;
      if (await this.repo.replaceProviderCredential(this.id, pending, retry))
        throw err;
      check(
        (await this.read())?.state === "disconnected",
        "Stripe connection changed. Reload the page.",
        409,
      );
      return;
    }
    const { lease: _, ...finished } = pending;
    if (
      await this.repo.replaceProviderCredential(this.id, pending, {
        ...finished,
        state: "disconnected",
      })
    )
      await workspaceEvent(this.repo, actor, "stripe_connect_disconnected", {
        provider: "stripe",
      });
  }
  async revoked(id: string, created?: number) {
    const row = await this.read();
    if (
      !row ||
      row.state === "disconnected" ||
      stripeAccountHash(id) !== row.account_hash ||
      (created && created < Math.floor(Date.parse(row.connectedAt) / 1000))
    )
      return;
    const { lease: _, ...rest } = row;
    if (
      await this.repo.replaceProviderCredential(this.id, row, {
        ...rest,
        state: "disconnected",
      })
    )
      await workspaceEvent(
        this.repo,
        { actor: "system", ip: "", user_agent: "" },
        "stripe_connect_revoked",
        { provider: "stripe" },
      );
  }
}
