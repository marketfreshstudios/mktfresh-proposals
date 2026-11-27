import { expect, it, vi } from "vitest";
import { MemoryRepository } from "../src/lib/repository";
import {
  StripeConnect,
  stripeAccountHash,
  stripeConnectCallback,
} from "../src/lib/providers/stripe-connect";
import { syncStripeCatalog } from "../src/lib/catalog";
import { staff } from "./helpers";

const workspace = "00000000-0000-4000-8000-000000000097";
const origin = "https://yeswell.example.test";
const redirectUri = origin + stripeConnectCallback;
const merchant = "acct_LiveMerchant";
const live = {
  key: "rk_live_fixture",
  clientId: "ca_live_fixture",
  encryptionKey: Buffer.alloc(32, 9).toString("base64"),
  redirectUri,
  eventsConfigured: true,
  live: true,
};

function stripe(tokenLivemode: boolean) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const account = new Headers(init?.headers).get("Stripe-Account");
    if (url.pathname === "/oauth/token")
      return Response.json({
        stripe_user_id: merchant,
        scope: "read_write",
        livemode: tokenLivemode,
      });
    if (url.pathname === "/v1/account")
      return Response.json({
        id: account ?? "acct_Platform",
        livemode: tokenLivemode,
        business_profile: { name: "Harbor Studio" },
      });
    throw new Error("unexpected " + url.pathname);
  }) as unknown as typeof fetch;
}

async function connect(repo: MemoryRepository, fetcher: typeof fetch) {
  const connection = new StripeConnect(repo, live, fetcher);
  const started = await connection.authorize(staff, origin);
  const state = new URL(started.url).searchParams.get("state")!;
  await connection.callback(
    staff,
    new URL(
      redirectUri + "?" + new URLSearchParams({ state, code: "fixture-code" }),
    ),
    state,
  );
  return connection;
}

it("connects an agency's live Stripe account in live mode, replacing a leftover test connection", async () => {
  const repo = new MemoryRepository(workspace);
  // A test-mode connection from before go-live.
  const testConnection = new StripeConnect(
    repo,
    { ...live, key: "sk_test_fixture", live: false },
    stripe(false),
  );
  const started = await testConnection.authorize(staff, origin);
  const state = new URL(started.url).searchParams.get("state")!;
  await testConnection.callback(
    staff,
    new URL(redirectUri + "?" + new URLSearchParams({ state, code: "c" })),
    state,
  );
  expect((await testConnection.activeAccount())?.mode).toBe("test");

  const liveConnection = new StripeConnect(repo, live, stripe(true));
  // The test connection doesn't count in live mode.
  expect(await liveConnection.activeAccount()).toBeUndefined();
  await connect(repo, stripe(true));
  const account = await liveConnection.activeAccount();
  expect(account).toEqual({ id: merchant, mode: "live" });
  expect(liveConnection.transport(account!).livemode).toBe(true);
  const row = await repo.providerCredential<{
    account_hash: string;
    mode: string;
  }>(
    (
      await repo.entities<{ id: string; kind?: string }>("provider_credentials")
    ).find((r) => r.kind === "stripe_connect")!.id,
  );
  expect(row?.mode).toBe("live");
  expect(row?.account_hash).toBe(stripeAccountHash(merchant, "live"));
  expect(row?.account_hash).not.toBe(stripeAccountHash(merchant, "test"));
});

it("refuses a test account while live, and a test key for live Connect", async () => {
  await expect(
    connect(new MemoryRepository(workspace), stripe(false)),
  ).rejects.toThrow("live Stripe account");
  expect(
    () =>
      new StripeConnect(new MemoryRepository(workspace), {
        ...live,
        key: "sk_test_fixture",
      }),
  ).toThrow("live-mode key required");
});

it("keeps Yeswell's own plan prices out of a catalog sync on the same account", async () => {
  const repo = new MemoryRepository();
  const price = (lookup_key: string, name: string) => ({
    id: "price_" + lookup_key,
    lookup_key,
    unit_amount: 3900,
    nickname: null,
    recurring: { interval: "month" },
    product: { id: "prod_" + lookup_key, name, active: true, metadata: {} },
    metadata: {},
  });
  const result = await syncStripeCatalog(repo, {
    get: async () => ({
      has_more: false,
      data: [
        price("yeswell_studio_monthly", "Yeswell Studio"),
        price("care-lite-49", "Website Care — Lite"),
      ],
    }),
  } as never);
  expect(result.imported).toBe(1);
  expect(
    (await repo.entities<{ sku: string }>("pricing_items")).map((i) => i.sku),
  ).toEqual(["care-lite-49"]);
});
