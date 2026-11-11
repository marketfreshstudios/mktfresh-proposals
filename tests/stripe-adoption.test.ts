import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import type { StripeTransport } from "../src/lib/catalog";
import type { Item, Proposal } from "../src/lib/model";
import { inView } from "../src/lib/proposal-state";
import { catalogQuoteItem } from "../src/lib/quote-model";
import { MemoryRepository, mutate } from "../src/lib/repository";
import { StripeProvider } from "../src/lib/providers/stripe";
import {
  executeStripeWebhook,
  receiveStripeWebhook,
} from "../src/lib/providers/webhook";
import {
  linkStripeSubscription,
  stripeSubscriptionOptions,
} from "../src/lib/stripe-adoption";
import {
  adoptedStripeSubscription,
  needsStripeLink,
  stripeLink,
} from "../src/lib/stripe-subscription-link";
import { clientActor, setup, staff } from "./helpers";

const customer = "cus_TestClient";
const id = "sub_TestExternal";
const scheduleId = "sub_sched_TestSchedule";
const account = "acct_TestConnected";
const standard = "oiot-monthly-175";
const pro = "oiot-pro-monthly-239";
const plans = {
  [standard]: [17500, "hosted-standard-100", 10000],
  [pro]: [23900, "hosted-pro-164", 16400],
} as const;

async function fixture(plan: keyof typeof plans = standard) {
  const f = await setup();
  const [amount, nextKey, nextAmount] = plans[plan];
  const item = (await f.repo.entities<Item>("pricing_items")).find(
    (item) => item.stripe_lookup_key === plan,
  )!;
  const quote = [
    catalogQuoteItem(
      {
        ...item,
        amount,
        schedule: {
          after_paid_invoices: 30,
          then: { amount: nextAmount, lookup_key: nextKey },
        },
      },
      0,
      crypto.randomUUID(),
      [crypto.randomUUID()],
    ),
  ];
  await f.repo.put("clients", {
    ...f.draft.client,
    stripe_customer_id: customer,
  });
  const proposal = await mutate(f.repo, f.draft.id, (p) => {
    p.status = "completed";
    p.client_signed_at = "2026-10-10T12:00:00.000Z";
    p.quote = quote;
    p.versions = [{ quote }] as Proposal["versions"];
  });
  const price = (key: string, amount: number, name = key) => ({
    id: key === plan ? "price_TestOriginal" : "price_TestTarget",
    lookup_key: key,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval: "month", interval_count: 1 },
    product: { name, active: true },
    metadata: {},
  });
  const start = price(
    plan,
    amount,
    plan === pro ? "Own It Over Time — Pro" : "Own It Over Time — Standard",
  );
  const end = price(
    nextKey,
    nextAmount,
    plan === pro ? "Hosting & Care Pro" : "Hosting & Care Standard",
  );
  const sub = {
    id,
    customer,
    livemode: false,
    status: "active",
    current_period_start: 1791585600,
    current_period_end: 1794264000,
    schedule: null as string | null,
    metadata: {} as Record<string, string>,
    latest_invoice: "in_1",
    items: {
      data: [{ id: "si_Test", price: start, quantity: 1 }],
      has_more: false,
    },
  };
  const phases = [
    {
      start_date: 1791585600,
      end_date: 1794264000,
      items: [{ price: start, quantity: 1 }],
    },
    {
      start_date: 1794264000,
      end_date: 1796856000,
      items: [{ price: end, quantity: 1 }],
    },
  ];
  const calls: {
    path: string;
    params: Record<string, unknown>;
    key?: string;
  }[] = [];
  let allowWrites = false;
  let paid = 12;
  const api: StripeTransport = {
    accountId: account,
    async get<T>(path: string, params: Record<string, string>) {
      calls.push({ path, params });
      const list = (data: unknown[]) => ({ data, has_more: false });
      let value: unknown;
      if (path === `/v1/customers/${customer}`)
        value = { id: customer, email: proposal.client.email, livemode: false };
      else if (path === "/v1/subscriptions")
        value = list([
          sub,
          { ...sub, id: "sub_TestCanceled", status: "canceled" },
        ]);
      else if (path === `/v1/subscriptions/${id}`) value = sub;
      else if (path === "/v1/prices")
        value = list(
          [end].filter((p) => params["lookup_keys[]"] === p.lookup_key),
        );
      else if (path === `/v1/subscription_schedules/${scheduleId}`)
        value = {
          id: scheduleId,
          customer,
          subscription: id,
          livemode: false,
          phases,
        };
      else if (path === "/v1/invoices")
        value = list([
          ...Array.from({ length: paid }, (_, i) => ({
            id: `in_${i}`,
            amount_paid: amount,
            status: "paid",
          })),
          { id: "in_Free", amount_paid: 0, status: "paid" },
          { id: "in_Open", amount_paid: 0, status: "open" },
        ]);
      else throw new Error(`Unexpected GET: ${path}`);
      return value as T;
    },
    async post<T>(path: string, params: Record<string, unknown>, key: string) {
      calls.push({ path, params, key });
      if (!allowWrites) throw new Error("Adoption must never write to Stripe");
      if (path === "/v1/subscription_schedules") {
        sub.schedule = scheduleId;
        return { id: scheduleId } as T;
      }
      if (path === `/v1/subscription_schedules/${scheduleId}`) return {} as T;
      throw new Error(`Unexpected POST: ${path}`);
    },
  };
  const adopt = (p = proposal) =>
    linkStripeSubscription(
      f.repo,
      p,
      staff,
      { revision: p.revision, subscription_id: id },
      api,
    );
  return {
    ...f,
    proposal,
    api,
    sub,
    phases,
    calls,
    adopt,
    setPaid: (value: number) => {
      paid = value;
    },
    allowWrites: () => {
      allowWrites = true;
    },
  };
}

function invoice(kind = "invoice.paid", eventId = "evt_InvoiceFixture") {
  return {
    id: eventId,
    type: kind,
    livemode: false,
    account,
    api_version: "2024-06-20",
    data: { object: { subscription: id } },
  };
}
function receipt(value: ReturnType<typeof invoice>) {
  const secret = "whsec_fixture";
  const raw = JSON.stringify(value);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return [raw, `t=${timestamp},v1=${digest}`, secret] as const;
}

it("lists only the client's test subscriptions and adopts read-only, preserving the proposal and showing actual Stripe amounts", async () => {
  const f = await fixture();
  f.sub.metadata.after_paid_invoices = "35";
  expect(needsStripeLink(f.proposal)).toBe(true);
  expect(inView(f.proposal, "billing-issues")).toBe(true);
  const options = await stripeSubscriptionOptions(
    f.repo,
    f.proposal,
    staff,
    f.api,
  );
  expect(options.choices.map((s) => s.id)).toEqual([id]);
  expect(
    f.calls.find((c) => c.path === "/v1/subscriptions")?.params.customer,
  ).toBe(customer);
  const linked = await f.adopt();
  expect(linked.quote).toEqual(f.proposal.quote);
  expect(linked.versions).toEqual(f.proposal.versions);
  expect(linked.events.at(-1)).toMatchObject({
    type: "stripe_subscription_linked",
    actor: staff.actor,
  });
  expect(adoptedStripeSubscription(stripeLink(linked))).toMatchObject({
    id,
    customerId: customer,
    accountId: account,
    paidInvoices: 12,
    prices: [{ amount: 17500 }],
    stepDown: { after: 35, price: { amount: 10000 }, automatic: false },
  });
  expect(await f.repo.byAdoptedStripeSubscription(id)).toMatchObject({
    id: linked.id,
  });
  expect(inView(linked, "billing-issues")).toBe(false);
  expect(f.calls.every((call) => !call.key)).toBe(true);
});

it("refuses another client, workspace, live subscription, open Checkout and stale revision", async () => {
  const f = await fixture();
  await expect(
    stripeSubscriptionOptions(f.repo, f.proposal, clientActor, f.api),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    stripeSubscriptionOptions(
      f.repo,
      f.proposal,
      { ...staff, workspace_id: crypto.randomUUID() },
      f.api,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const another = new MemoryRepository(crypto.randomUUID());
  expect(await another.byAdoptedStripeSubscription(id)).toBeNull();
  f.sub.customer = "cus_AnotherClient";
  await expect(f.adopt()).rejects.toMatchObject({ status: 409 });
  f.sub.customer = customer;
  f.sub.livemode = true;
  await expect(f.adopt()).rejects.toMatchObject({ status: 409 });
  f.sub.livemode = false;
  const open = {
    ...f.proposal,
    billing_links: [
      {
        provider: "stripe",
        status: "succeeded",
        attempts: 1,
        metadata: { requires_checkout: true },
      },
    ],
  } satisfies Proposal;
  await expect(f.adopt(open)).rejects.toThrow("Checkout is open");
  await expect(
    linkStripeSubscription(
      f.repo,
      f.proposal,
      staff,
      { revision: f.proposal.revision - 1, subscription_id: id },
      f.api,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.calls.every((call) => !call.key)).toBe(true);
});

it("shows the actual schedule and never rewrites it even after the paid threshold", async () => {
  const f = await fixture();
  f.sub.schedule = scheduleId;
  f.setPaid(35);
  const p = await f.adopt();
  expect(adoptedStripeSubscription(stripeLink(p))).toMatchObject({
    schedule: {
      id: scheduleId,
      phases: [
        { prices: [{ amount: 17500 }] },
        { prices: [{ amount: 10000 }] },
      ],
    },
  });
  const provider = new StripeProvider(f.api, f.repo);
  const event = invoice();
  await receiveStripeWebhook(f.repo, provider, ...receipt(event), account);
  const queued = (await f.repo.get(p.id))!;
  await executeStripeWebhook(f.repo, provider, queued, queued.jobs.at(-1)!);
  expect(f.calls.filter((call) => call.key)).toEqual([]);
  expect((await f.repo.get(p.id))?.events.at(-1)?.type).toBe(
    "billing_invoice_updated",
  );
});

it("ignores an unrelated invoice and steps down the locally linked Pro subscription only after enough paid invoices, without metadata", async () => {
  const f = await fixture(pro);
  const provider = new StripeProvider(f.api, f.repo);
  const event = invoice();
  await expect(
    receiveStripeWebhook(f.repo, provider, ...receipt(event), account),
  ).resolves.toMatchObject({ ignored: true });
  const p = await f.adopt();
  const handle = async (value: ReturnType<typeof invoice>) => {
    await expect(
      receiveStripeWebhook(f.repo, provider, ...receipt(value), account),
    ).resolves.toMatchObject({ proposal_id: p.id });
    const queued = (await f.repo.get(p.id))!;
    await executeStripeWebhook(f.repo, provider, queued, queued.jobs.at(-1)!);
  };
  f.allowWrites();
  f.setPaid(29);
  await handle(event);
  f.setPaid(30);
  await handle(invoice("invoice.payment_failed", "evt_Failed"));
  expect(f.calls.filter((call) => call.key)).toEqual([]);
  await handle(invoice("invoice.paid", "evt_Paid30"));
  await handle(invoice("invoice.paid", "evt_Paid31"));
  const writes = f.calls.filter((call) => call.key);
  expect(writes.map((call) => call.path)).toEqual([
    "/v1/subscription_schedules",
    `/v1/subscription_schedules/${scheduleId}`,
  ]);
  expect(JSON.stringify(writes)).not.toContain("metadata");
  expect(writes[1].params.phases).toMatchObject([
    { items: [{ price: "price_TestOriginal" }] },
    { items: [{ price: "price_TestTarget" }] },
  ]);
});

it("adds a workspace-scoped lookup and uniqueness guard without granting access", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create table public.proposals (id text primary key, workspace_id text, state jsonb);
      alter table public.proposals enable row level security;
      create role anon; create role authenticated;
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/20261111063827_linked_stripe_subscription_lookup.sql",
        "utf8",
      ),
    );
    const doc = (subscription: string) => ({
      billing_links: [
        { provider: "qbo" },
        {
          provider: "stripe",
          metadata: { adopted_subscription: { id: subscription } },
        },
      ],
    });
    const add = (row: string, workspace: string, state: unknown) =>
      db.query(
        "insert into proposals(id, workspace_id, state) values ($1, $2, $3) returning adopted_stripe_subscription_id",
        [row, workspace, JSON.stringify(state)],
      );
    expect((await add("a", "one", doc(id))).rows).toEqual([
      { adopted_stripe_subscription_id: id },
    ]);
    await expect(add("b", "one", doc(id))).rejects.toThrow(
      "proposals_adopted_stripe_subscription",
    );
    await add("b", "two", doc(id));
    expect((await add("old", "one", {})).rows).toEqual([
      { adopted_stripe_subscription_id: null },
    ]);
    expect(
      (
        await db.query(
          "select has_table_privilege('anon', 'public.proposals', 'select') as anon, has_table_privilege('authenticated', 'public.proposals', 'select') as staff",
        )
      ).rows,
    ).toEqual([{ anon: false, staff: false }]);
  } finally {
    await db.close();
  }
});
