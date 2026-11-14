import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  forgetPrices,
  handleBillingWebhook,
  openPortal,
  previewSelection,
  selectionItems,
  startCheckout,
  subscriptionDetails,
  yeswellStripe,
  type BillingStore,
  type StripeApi,
} from "../src/lib/yeswell-billing";
import { postgresFixture } from "./postgres-fixture";

const env = { ...process.env };
beforeEach(() => {
  forgetPrices();
  process.env.APP_URL = "https://app.example.test";
  process.env.WORKSPACE_DOMAIN = "example.test";
  process.env.YESWELL_STRIPE_WEBHOOK_SECRET = "whsec_test";
});
afterEach(() => {
  process.env = { ...env };
});
const W = "00000000-0000-4000-8000-0000000000aa";

function fakeStripe(sub?: any) {
  const posts: { path: string; params: any; key?: string }[] = [];
  const gets: string[] = [];
  const api: StripeApi = {
    async get(path, params) {
      gets.push(path + (params ? "?" + params : ""));
      if (path === "/v1/prices")
        return {
          data: [
            { id: "price_studio_m", lookup_key: "yeswell_studio_monthly" },
          ],
        } as any;
      if (path.startsWith("/v1/subscriptions/")) return sub as any;
      throw new Error("unexpected " + path);
    },
    async post(path, params, key) {
      posts.push({ path, params, key });
      if (path === "/v1/prices")
        return { id: "price_" + params.lookup_key } as any;
      if (path === "/v1/customers") return { id: "cus_1" } as any;
      if (path === "/v1/checkout/sessions")
        return {
          id: "cs_1",
          url: "https://checkout.stripe.com/c/pay/cs_1",
        } as any;
      if (path === "/v1/billing_portal/sessions")
        return { url: "https://billing.stripe.com/p/session/1" } as any;
      if (path === "/v1/invoices/create_preview")
        return { total: 5400, currency: "usd", lines: { data: [] } } as any;
      throw new Error("unexpected " + path);
    },
  };
  return { api, posts, gets };
}
function fakeStore(over: Partial<any> = {}) {
  const row: any = {
    id: W,
    name: "North Star",
    slug: "northstar",
    plan_status: "trial",
    trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription: null,
    launch_price: false,
    ...over,
  };
  const synced: any[] = [];
  const claimed = new Set<string>();
  const store: BillingStore = {
    workspace: async () => ({ ...row }),
    setCustomer: async (_id, c) => {
      row.stripe_customer_id ??= c;
    },
    launchSpotsLeft: async () => 25,
    sync: async (...args) => (synced.push(args), "active"),
    claimEvent: async (id) =>
      claimed.has(id) ? false : (claimed.add(id), true),
    workspaceForCustomer: async () => W,
    owners: async () => [{ email: "dana@x.test", name: "Dana Ruiz" }],
  };
  return { store, row, synced };
}
function signed(event: object, secret = "whsec_test") {
  const raw = JSON.stringify({ livemode: false, ...event });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { raw, sig: `t=${t},v1=${v1}` };
}

describe("Yeswell billing", () => {
  it("turns a selection into plan, extra people and the domain add-on", () => {
    expect(
      selectionItems({
        plan: "studio",
        interval: "month",
        people: 2,
        domain: false,
      }),
    ).toEqual([{ kind: "studio", quantity: 1 }]);
    expect(
      selectionItems({
        plan: "studio",
        interval: "year",
        people: 4,
        domain: true,
      }),
    ).toEqual([
      { kind: "studio", quantity: 1 },
      { kind: "seat", quantity: 2 },
      { kind: "domain", quantity: 1 },
    ]);
    // Agency includes 5 people and the domain.
    expect(
      selectionItems({
        plan: "agency",
        interval: "month",
        people: 5,
        domain: true,
      }),
    ).toEqual([{ kind: "agency", quantity: 1 }]);
  });
  it("refuses live keys and works only when configured", () => {
    delete process.env.YESWELL_STRIPE_SECRET_KEY;
    expect(() => yeswellStripe()).toThrow("Billing isn't set up yet");
    process.env.YESWELL_STRIPE_SECRET_KEY = "sk_live_abc";
    expect(() => yeswellStripe()).toThrow("test-mode");
  });
  it("reuses existing prices, creates missing ones at the approved amounts, and asks Stripe for the total", async () => {
    const s = fakeStripe();
    const preview = await previewSelection(s.api, {
      plan: "studio",
      interval: "month",
      people: 3,
      domain: false,
    });
    expect(preview.total_cents).toBe(5400);
    expect(
      s.posts
        .filter((p) => p.path === "/v1/prices")
        .map((p) => [
          p.params.lookup_key,
          p.params.unit_amount,
          p.params.recurring.interval,
        ]),
    ).toEqual([["yeswell_seat_monthly", 1500, "month"]]);
    expect(s.posts.at(-1)!.params.subscription_details.items).toEqual([
      { price: "price_studio_m", quantity: 1 },
      { price: "price_yeswell_seat_monthly", quantity: 1 },
    ]);
  });
  it("starts Checkout for the workspace, branded Yeswell, keeping the rest of the trial free", async () => {
    const s = fakeStripe();
    const { store, row } = fakeStore();
    const { url } = await startCheckout(
      s.api,
      store,
      W,
      { email: "dana@x.test" },
      { plan: "agency", interval: "year", people: 6, domain: false },
    );
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_1");
    expect(row.stripe_customer_id).toBe("cus_1");
    const session = s.posts.find(
      (p) => p.path === "/v1/checkout/sessions",
    )!.params;
    expect(session).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      client_reference_id: W,
      success_url: "https://northstar.example.test/billing?checkout=done",
      cancel_url: "https://northstar.example.test/billing",
      branding_settings: { display_name: "Yeswell" },
      subscription_data: { metadata: { workspace_id: W } },
    });
    expect(session.subscription_data.trial_end).toBe(
      Math.floor(Date.parse(row.trial_ends_at) / 1000),
    );
    expect(session.line_items.map((i: any) => i.quantity)).toEqual([1, 1]);
    // Under 2 days left: charge now.
    const soon = fakeStore({
      trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
    });
    const s2 = fakeStripe();
    await startCheckout(
      s2.api,
      soon.store,
      W,
      { email: "d@x.test" },
      { plan: "studio", interval: "month", people: 2, domain: false },
    );
    expect(
      s2.posts.find((p) => p.path === "/v1/checkout/sessions")!.params
        .subscription_data.trial_end,
    ).toBeUndefined();
    // Already subscribed: use the portal instead.
    const subscribed = fakeStore({
      plan_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
    await expect(
      startCheckout(
        fakeStripe().api,
        subscribed.store,
        W,
        { email: "d@x.test" },
        { plan: "studio", interval: "month", people: 2, domain: false },
      ),
    ).rejects.toThrow("Manage billing");
    expect(
      (await openPortal(fakeStripe().api, subscribed.store, W)).url,
    ).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });
  it("reads plan, people, domain and period from the subscription items", () => {
    expect(
      subscriptionDetails({
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: "p1", lookup_key: "yeswell_studio_yearly" },
              quantity: 1,
              current_period_end: 1797206400,
            },
            {
              price: { id: "p2", lookup_key: "yeswell_seat_yearly" },
              quantity: 2,
            },
            {
              price: { id: "p3", lookup_key: "yeswell_domain_yearly" },
              quantity: 1,
            },
          ],
        },
      }),
    ).toMatchObject({
      plan: "studio",
      interval: "year",
      people: 4,
      extra_people: 2,
      domain: true,
      current_period_end: "2026-12-14T00:00:00.000Z",
    });
  });
  it("syncs from verified webhooks, refetching the subscription, and emails a failed payment once", async () => {
    const sub = {
      id: "sub_1",
      customer: "cus_1",
      status: "past_due",
      cancel_at_period_end: false,
      metadata: { workspace_id: W },
      items: {
        data: [
          {
            price: { id: "p", lookup_key: "yeswell_studio_monthly" },
            quantity: 1,
            current_period_end: 1797206400,
          },
        ],
      },
    };
    const s = fakeStripe(sub);
    const { store, synced } = fakeStore();
    const mail = vi.fn(async () => {});
    const failed = signed({
      id: "evt_1",
      type: "invoice.payment_failed",
      data: {
        object: { parent: { subscription_details: { subscription: "sub_1" } } },
      },
    });
    await handleBillingWebhook(failed.raw, failed.sig, {
      stripe: s.api,
      store,
      mail,
    });
    await handleBillingWebhook(failed.raw, failed.sig, {
      stripe: s.api,
      store,
      mail,
    });
    expect(synced[0]).toEqual([
      W,
      "cus_1",
      "sub_1",
      "past_due",
      expect.objectContaining({ plan: "studio" }),
    ]);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0]).toEqual(
      expect.arrayContaining([
        "dana@x.test",
        "Your Yeswell payment didn't go through",
      ]),
    );
    expect(String((mail.mock.calls[0] as unknown[])[2])).toContain(
      "https://northstar.example.test/billing",
    );
    const bad = signed(
      {
        id: "evt_2",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1" } },
      },
      "whsec_other",
    );
    await expect(
      handleBillingWebhook(bad.raw, bad.sig, { stripe: s.api, store, mail }),
    ).rejects.toThrow("signature");
    const other = signed({
      id: "evt_3",
      type: "charge.refunded",
      data: { object: { id: "ch_1" } },
    });
    expect(
      await handleBillingWebhook(other.raw, other.sig, {
        stripe: s.api,
        store,
        mail,
      }),
    ).toMatchObject({ ignored: true });
  });
});

describe("billing database", () => {
  it("maps Stripe statuses, guards the customer, and gives the first 25 paying studios the launch price", async () => {
    const db = await postgresFixture();
    const ws = async (n: number, customer: string | null = `cus_${n}`) => {
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      await db.query(
        "insert into public.workspaces(id,name,plan_status,trial_ends_at,stripe_customer_id) values ($1,$2,'trial',now()+interval '3 days',$3)",
        [id, "W" + n, customer],
      );
      return id;
    };
    const sync = async (
      id: string,
      customer: string,
      sub: string,
      status: string,
    ) =>
      (
        await db.query<{ s: string }>(
          "select public.sync_workspace_subscription($1,$2,$3,$4,'{}'::jsonb) s",
          [id, customer, sub, status],
        )
      ).rows[0].s;
    const row = async (id: string) =>
      (
        await db.query<any>(
          "select plan_status, past_due_since, launch_price, stripe_subscription_id from public.workspaces where id=$1",
          [id],
        )
      ).rows[0];
    const a = await ws(100);
    await expect(sync(a, "cus_other", "sub_a", "active")).rejects.toThrow(
      /does not belong/,
    );
    expect(await sync(a, "cus_100", "sub_a", "trialing")).toBe("active");
    expect(await row(a)).toMatchObject({
      plan_status: "active",
      launch_price: true,
      stripe_subscription_id: "sub_a",
    });
    expect(await sync(a, "cus_100", "sub_a", "past_due")).toBe("past_due");
    const since = (await row(a)).past_due_since;
    expect(since).not.toBeNull();
    expect(await sync(a, "cus_100", "sub_a", "unpaid")).toBe("past_due");
    expect((await row(a)).past_due_since).toEqual(since); // grace starts at the first failure
    expect(await sync(a, "cus_100", "sub_a", "active")).toBe("active");
    expect((await row(a)).past_due_since).toBeNull();
    expect(await sync(a, "cus_100", "sub_a", "canceled")).toBe("canceled");
    // Launch price stops after 25.
    for (let n = 1; n <= 25; n++)
      await sync(
        await ws(200 + n),
        `cus_${200 + n}`,
        `sub_${200 + n}`,
        "active",
      );
    expect(
      (await db.query<{ n: number }>("select public.launch_spots_left() n"))
        .rows[0].n,
    ).toBe(0);
    const late = await ws(300);
    await sync(late, "cus_300", "sub_300", "active");
    expect((await row(late)).launch_price).toBe(false);
    // Events are claimed once.
    const claim = async (id: string) =>
      (
        await db.query<{ c: boolean }>(
          "select public.claim_yeswell_billing_event($1) c",
          [id],
        )
      ).rows[0].c;
    expect(await claim("evt_1")).toBe(true);
    expect(await claim("evt_1")).toBe(false);
  });
});
