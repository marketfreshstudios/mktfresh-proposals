import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ClientSchema, type Client } from "../src/lib/model";
import { MemoryRepository } from "../src/lib/repository";
import {
  StripeConnect,
  stripeAccountHash,
  stripeConnectCallback,
} from "../src/lib/providers/stripe-connect";
import { StripeProvider } from "../src/lib/providers/stripe";
import { receiveStripeWebhook } from "../src/lib/providers/webhook";
import { decryptSecret } from "../src/lib/providers/secrets";
import { staff } from "./helpers";
import { postgresFixture } from "./postgres-fixture";

const workspace = "00000000-0000-4000-8000-000000000099";
const other = "00000000-0000-4000-8000-000000000098";
const origin = "https://yeswell.example.test";
const redirectUri = origin + stripeConnectCallback;
const merchant = "acct_TestMerchant";
const platform = "acct_TestPlatform";
const config = {
  key: "sk_test_fixture",
  clientId: "ca_fixture",
  encryptionKey: Buffer.alloc(32, 7).toString("base64"),
  redirectUri,
  eventsConfigured: true,
};

function fixture(options: { live?: boolean; account?: string } = {}) {
  const repo = new MemoryRepository(workspace);
  const requests: {
    path: string;
    account: string | null;
    form?: URLSearchParams;
  }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      const account = headers.get("Stripe-Account");
      const form =
        init?.body instanceof URLSearchParams ? init.body : undefined;
      requests.push({ path: url.pathname, account, form });
      if (url.hostname === "connect.stripe.com") {
        expect(account).toBeNull();
        expect(init?.redirect).toBe("error");
        if (url.pathname === "/oauth/token") {
          expect(form?.get("code")).toBe("fixture-code");
          return Response.json({
            stripe_user_id: options.account ?? merchant,
            scope: "read_write",
            livemode: options.live ?? false,
            access_token: "fixture-discarded-access",
            refresh_token: "fixture-discarded-refresh",
          });
        }
        expect(url.pathname).toBe("/oauth/deauthorize");
        expect(form?.get("client_id")).toBe(config.clientId);
        expect(form?.get("stripe_user_id")).toBe(merchant);
        return Response.json({ stripe_user_id: merchant });
      }
      expect(url.hostname).toBe("api.stripe.com");
      expect(headers.get("Stripe-Version")).toBe("2024-06-20");
      if (url.pathname === "/v1/account")
        return Response.json({
          id: account ?? platform,
          business_profile: { name: "Harbor Studio" },
        });
      expect(account).toBe(merchant);
      if (url.pathname === "/v1/prices") {
        expect(url.searchParams.get("active")).toBe("true");
        return Response.json({
          has_more: false,
          data: [
            {
              id: "price_fixture",
              lookup_key: "retainer",
              unit_amount: 45000,
              nickname: "Monthly",
              recurring: { interval: "month" },
              product: {
                id: "prod_fixture",
                name: "Retainer",
                active: true,
                metadata: {},
              },
              metadata: {},
            },
          ],
        });
      }
      if (url.pathname === "/v1/customers")
        return Response.json({
          has_more: false,
          data: [
            { id: "cus_jane", email: "Jane@Example.test", livemode: false },
            { id: "cus_two", email: "other@example.test", livemode: false },
            { id: "cus_three", email: "OTHER@example.test", livemode: false },
          ],
        });
      expect(url.pathname).toBe("/v1/checkout/sessions");
      return Response.json({ id: "cs_test_fixture", livemode: false });
    },
  );
  const connect = new StripeConnect(repo, config, fetcher);
  async function begin() {
    const started = await connect.authorize(staff, origin, "test");
    const url = new URL(started.url);
    const state = url.searchParams.get("state")!;
    const callback = new URL(
      redirectUri + "?" + new URLSearchParams({ state, code: "fixture-code" }),
    );
    expect(url.origin).toBe("https://connect.stripe.com");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("scope")).toBe("read_write");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(started.cookie).toContain("; HttpOnly; SameSite=Lax;");
    expect(started.cookie).toContain("; Secure");
    return { callback, state };
  }
  async function finish() {
    const { callback, state } = await begin();
    await connect.callback(staff, callback, state);
  }
  return { repo, fetcher, connect, requests, begin, finish };
}

it("binds OAuth to the exact origin, staff actor, cookie and one-time state", async () => {
  const { connect, requests, begin } = fixture();
  await expect(
    connect.authorize(staff, "https://other.example.test", "test"),
  ).rejects.toThrow("configured Stripe Connect domain");
  const { callback, state } = await begin();
  await expect(connect.callback(staff, callback, "wrong")).rejects.toThrow(
    "did not match",
  );
  await expect(
    connect.callback({ ...staff, actor: "staff:other" }, callback, state),
  ).rejects.toThrow("did not match");
  expect(requests).toEqual([]);
  await connect.callback(staff, callback, state);
  await expect(connect.callback(staff, callback, state)).rejects.toThrow(
    "did not match",
  );
  expect(requests.filter((r) => r.path === "/oauth/token")).toHaveLength(1);
  expect(() => new StripeConnect(new MemoryRepository(), config)).toThrow(
    "platform workspace",
  );
});

it("refuses live OAuth responses and connecting the platform account to itself", async () => {
  await expect(fixture({ live: true }).finish()).rejects.toThrow(
    "test account",
  );
  await expect(fixture({ account: platform }).finish()).rejects.toThrow(
    "other than the Yeswell platform account",
  );
  expect(
    () =>
      new StripeConnect(new MemoryRepository(workspace), {
        ...config,
        key: "unusable-fixture",
      }),
  ).toThrow("test-mode key");
});

it("stores only encrypted account identity and completes scoped catalog and unique customer setup once", async () => {
  const { repo, connect, requests, finish } = fixture();
  const clients = await Promise.all(
    ["jane@example.test", "other@example.test", "missing@example.test"].map(
      async (email) => {
        const client = ClientSchema.parse({
          id: crypto.randomUUID(),
          company: "Example",
          first_name: "Test",
          last_name: "Person",
          email,
        });
        await repo.put("clients", client);
        return client;
      },
    ),
  );
  await finish();
  const [row] = await repo.entities<{
    id: string;
    account_hash: string;
    ciphertext: string;
  }>("provider_credentials");
  expect(row.account_hash).toBe(stripeAccountHash(merchant));
  expect(JSON.stringify(row)).not.toMatch(
    /acct_TestMerchant|fixture-discarded/,
  );
  expect(
    JSON.parse(decryptSecret(row.ciphertext, config.encryptionKey, row.id)),
  ).toEqual({ id: merchant, mode: "test" });
  expect((await connect.status()).state).toBe("setting_up");
  await Promise.all([connect.runSetup(staff), connect.runSetup(staff)]);
  expect(await connect.status()).toMatchObject({
    state: "connected",
    eventsConfigured: true,
    products: { count: 1 },
    customers: { checked: 3, linked: 1, review: 1 },
  });
  expect(await repo.entities("pricing_items")).toMatchObject([
    { stripe_lookup_key: "retainer", amount: 45000 },
  ]);
  const saved = await repo.entities<Client>("clients");
  expect(saved.find((client) => client.id === clients[0].id)).toMatchObject({
    stripe_customer_id: "cus_jane",
  });
  expect(
    saved.find((client) => client.id === clients[1].id)?.stripe_customer_id,
  ).toBeNull();
  expect(
    requests
      .filter((r) => r.path === "/v1/prices" || r.path === "/v1/customers")
      .map((r) => r.account),
  ).toEqual([merchant, merchant]);
});

it("scopes writes and cached responses, revokes at Stripe and stops previously resolved transports", async () => {
  const { connect, requests, finish } = fixture();
  await finish();
  const api = connect.transport((await connect.activeAccount())!);
  expect(api.dashboardUrl).toBe(
    `https://dashboard.stripe.com/${merchant}/test`,
  );
  for (let n = 0; n < 2; n++)
    await api.post(
      "/v1/checkout/sessions",
      { mode: "subscription" },
      "checkout:fixture",
    );
  expect(
    requests.filter((r) => r.path === "/v1/checkout/sessions"),
  ).toHaveLength(1);
  await connect.disconnect(staff);
  expect(requests.filter((r) => r.path === "/oauth/deauthorize")).toHaveLength(
    1,
  );
  expect(await connect.activeAccount()).toBeUndefined();
  expect((await connect.status()).state).toBe("not_connected");
  await expect(
    api.post(
      "/v1/checkout/sessions",
      { mode: "subscription" },
      "checkout:fixture",
    ),
  ).rejects.toThrow("Connect this workspace");
});

it("keeps connected-account webhooks isolated and ignores unrelated transactions", async () => {
  const { connect, repo, finish, requests } = fixture();
  await finish();
  const provider = new StripeProvider(
    connect.transport((await connect.activeAccount())!),
    repo,
  );
  const raw = JSON.stringify({
    id: "evt_fixture",
    api_version: "2024-06-20",
    livemode: false,
    type: "invoice.paid",
    account: merchant,
    data: { object: { id: "in_unrelated", subscription: null } },
  });
  const secret = "whsec_fixture";
  const time = Math.floor(Date.now() / 1000);
  const sig = `t=${time},v1=${createHmac("sha256", secret)
    .update(time + "." + raw)
    .digest("hex")}`;
  await expect(
    receiveStripeWebhook(repo, provider, raw, sig, secret, platform),
  ).rejects.toThrow("account does not match");
  await expect(
    receiveStripeWebhook(repo, provider, raw, sig, secret),
  ).rejects.toThrow("account does not match");
  await expect(
    receiveStripeWebhook(repo, provider, raw, sig, secret, merchant),
  ).resolves.toEqual({ received: true, ignored: true });
  expect(requests).toHaveLength(3);
  await connect.revoked(merchant, time - 86400);
  expect(await connect.activeAccount()).toBeDefined();
  await connect.revoked(merchant, time);
  expect(await connect.activeAccount()).toBeUndefined();
});

it("enforces one workspace per Stripe account in service-only credential storage", async () => {
  const db = await postgresFixture();
  try {
    await db.exec(
      `insert into public.workspaces values ('${workspace}', 'One'), ('${other}', 'Two')`,
    );
    const put = (id: string, tenant: string) =>
      db.query(
        "insert into public.provider_credentials (id, workspace_id, data) values ($1, $2, $3)",
        [
          id,
          tenant,
          JSON.stringify({
            kind: "stripe_connect",
            account_hash: stripeAccountHash(merchant),
          }),
        ],
      );
    await put(workspace, workspace);
    await expect(put(other, other)).rejects.toMatchObject({ code: "23505" });
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await expect(
        db.query("select * from public.provider_credentials"),
      ).rejects.toMatchObject({ code: "42501" });
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
