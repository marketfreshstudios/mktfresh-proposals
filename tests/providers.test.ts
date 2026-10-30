import { quoteSublines, cloneQuote } from "../src/lib/quote-model";
import { expect, it, vi } from "vitest";
import { randomBytes, createHmac } from "node:crypto";
import { StripeProvider } from "../src/lib/providers/stripe";
import {
  StripeHttp,
  requireTestStripeKey,
} from "../src/lib/providers/stripe-http";
import { QboProvider } from "../src/lib/providers/qbo";
import {
  verifyStripeWebhook,
  receiveStripeWebhook,
} from "../src/lib/providers/webhook";
import { encryptSecret, decryptSecret } from "../src/lib/providers/secrets";
import { type StripeTransport } from "../src/lib/catalog";
import { type BillingLine, BillingLineSchema } from "../src/lib/model";
import { setup, staff, signature, clientActor } from "./helpers";
import { bill } from "../src/lib/billing";
function transport(existing = false, multi = false) {
  const calls: { path: string; params: any; key: string }[] = [];
  const sub = {
    id: "sub_existing",
    status: "active",
    customer: "cus_test",
    schedule: null,
    default_payment_method: "pm_test",
    currency: "usd",
    latest_invoice: null,
    current_period_start: 100,
    current_period_end: 200,
    description: "Original description",
    collection_method: "send_invoice",
    metadata: multi
      ? { plan: "multi", plan_items: "hosted-standard-100,hosting-upgrade-60" }
      : { plan: "old-plan" },
    items: {
      data: [
        {
          id: "si_old",
          quantity: 1,
          price: {
            id: "price_old",
            unit_amount: 10000,
            lookup_key: multi ? null : "old-plan",
            recurring: { interval: "month" },
            currency: "usd",
          },
        },
      ],
    },
  };
  const api: StripeTransport = {
    async get<T>(path: string, params: Record<string, string>) {
      let result: any;
      if (path === "/v1/prices")
        result = {
          data: [
            {
              id: "price_lookup",
              unit_amount: 2500,
              lookup_key: params["lookup_keys[]"],
              recurring: { interval: "month" },
              product: { id: "prod_lookup", active: true, name: "Plan" },
              metadata: {},
            },
          ],
          has_more: false,
        };
      else if (path.startsWith("/v1/products/"))
        result = {
          id: "prod_family",
          active: true,
          metadata: { custom_family: "true" },
        };
      else if (path === "/v1/customers" || path === "/v1/customers/search")
        result = {
          data: [
            { id: "cus_test", email: "jane@example.test", name: "Acme & Sons" },
          ],
          has_more: false,
        };
      else if (path === "/v1/customers/cus_test")
        result = {
          id: "cus_test",
          email: "jane@example.test",
          name: "Acme & Sons",
          invoice_settings: {
            default_payment_method: existing ? "pm_test" : null,
          },
        };
      else if (path === "/v1/payment_methods/pm_test")
        result = {
          customer: "cus_test",
          type: "card",
          card: { exp_year: 2099, exp_month: 1 },
        };
      else if (path === "/v1/subscriptions")
        result = {
          data: existing ? [structuredClone(sub)] : [],
          has_more: false,
        };
      else if (path === "/v1/subscriptions/sub_existing") result = sub;
      else throw new Error("Unexpected GET " + path);
      return result as T;
    },
    async post<T>(path: string, params: Record<string, unknown>, key: string) {
      calls.push({ path, params, key });
      if (path === "/v1/subscription_items")
        sub.items.data.push({
          id: "si_new",
          quantity: Number(params.quantity),
          price: {
            id: "price_new",
            unit_amount: 2500,
            lookup_key: "new",
            recurring: { interval: "month" },
            currency: "usd",
          },
        });
      return (
        path === "/v1/checkout/sessions"
          ? { id: "cs_test", url: "https://checkout.stripe.com/test" }
          : { id: "object_test" }
      ) as T;
    },
  };
  return { api, calls };
}
it("refuses live Stripe keys and non-sandbox QBO before any request", async () => {
  const { repo } = await setup();
  const fetcher = vi.fn();
  expect(
    () => new StripeHttp("rk_live_example", repo, fetcher as never),
  ).toThrow("test-mode");
  expect(() => requireTestStripeKey("sk_test_example")).not.toThrow();
  expect(
    () =>
      new QboProvider(
        repo,
        {
          environment: "production",
          realm: "123",
          clientId: "id",
          clientSecret: "secret",
          encryptionKey: "",
        },
        fetcher as never,
      ),
  ).toThrow("sandbox");
  expect(fetcher).not.toHaveBeenCalled();
});
it("D2 adds individual items with no proration or replacement array; D3 uses customer Checkout", async () => {
  for (const existing of [true, false]) {
    const { repo, service, draft } = await setup();
    let p = await service.send(draft.id, staff);
    p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
      token: p.token!,
      password: "",
    });
    const { api, calls } = transport(existing);
    const result = await bill(p, "stripe", new StripeProvider(api, repo));
    expect(result.status).toBe("succeeded");
    if (existing) {
      expect(
        calls.find((c) => c.path === "/v1/subscription_items")?.params,
      ).toMatchObject({
        proration_behavior: "none",
        subscription: "sub_existing",
      });
      const update = calls.find(
        (c) => c.path === "/v1/subscriptions/sub_existing",
      )!.params;
      expect(Object.keys(update)).toEqual(["metadata"]);
      expect(Object.keys(update.metadata).sort()).toEqual([
        "plan",
        "plan_items",
      ]);
      expect(update).not.toHaveProperty("description");
      expect(update).not.toHaveProperty("collection_method");
      expect(update.metadata.plan_items).toBe("old-plan,hosting-essentials-25");
      expect(calls.some((c) => c.path.includes("checkout"))).toBe(false);
      expect(result.metadata!.requires_checkout).toBe(false);
    } else
      expect(
        calls.find((c) => c.path === "/v1/checkout/sessions")?.params,
      ).toMatchObject({
        customer: "cus_test",
        mode: "subscription",
        success_url: `http://127.0.0.1:3100/p/${p.token}?billing=returned`,
        cancel_url: `http://127.0.0.1:3100/p/${p.token}?billing=pending`,
      });
  }
});
it("custom retainer bills entered 2000/month inline on existing family, without creating products or prices", async () => {
  const { repo, draft } = await setup();
  const family = "00000000-0000-4000-8000-000000000090";
  await repo.put("custom_families", {
    id: family,
    stripe_product_id: "prod_family",
    active: true,
  });
  const line = BillingLineSchema.parse({
    ...quoteSublines(draft.quote)[1],
    pricing_item_id: null,
    custom_family_id: family,
    stripe_lookup_key: null,
    amount: 200000,
    list_amount: null,
    description: "Bespoke scope",
  });
  const { api, calls } = transport(false);
  await new StripeProvider(api, repo).createObject(
    {
      id: "cus_test",
      email: draft.client.email,
      company: draft.client.company,
    },
    [line],
    "custom-retainer",
    { currency: "usd", proposal_id: draft.id, proposal_title: draft.title },
  );
  const session = calls.find((c) => c.path === "/v1/checkout/sessions")!;
  expect(session.params.line_items[0].price_data).toMatchObject({
    product: "prod_family",
    unit_amount: 200000,
    recurring: { interval: "month" },
  });
  expect(
    calls.some((c) => ["/v1/products", "/v1/prices"].includes(c.path)),
  ).toBe(false);
});
it("pins Stripe version and persists action results beyond retry", async () => {
  const { repo } = await setup();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "result", livemode: false }), {
      status: 200,
    }),
  );
  const api = new StripeHttp("rk_test_fake", repo, fetcher);
  await api.post("/v1/customers", { name: "Client" }, "customer");
  await api.post("/v1/customers", { name: "Client" }, "customer");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].headers["Stripe-Version"]).toBe("2024-06-20");
  await expect(
    api.post("/v1/customers", { name: "Different" }, "customer"),
  ).rejects.toThrow("changed");
});
it("encrypts OAuth state with workspace binding and creates only an unsent QBO invoice", async () => {
  const { repo, draft } = await setup(),
    key = randomBytes(32).toString("base64");
  const encrypted = encryptSecret("private", key, repo.workspaceId);
  expect(encrypted).not.toContain("private");
  expect(decryptSecret(encrypted, key, repo.workspaceId)).toBe("private");
  expect(() => decryptSecret(encrypted, key, "other")).toThrow();
  const calls: { url: string; init: any }[] = [];
  const fetcher = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify(
        String(url).includes("tokens/bearer")
          ? {
              access_token: "access",
              refresh_token: "rotated",
              expires_in: 3600,
            }
          : { Invoice: { Id: "invoice", EmailStatus: "NotSet" } },
      ),
      { status: 200 },
    );
  });
  const qbo = new QboProvider(
    repo,
    {
      environment: "sandbox",
      realm: "123",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      encryptionKey: key,
    },
    fetcher,
  );
  await qbo.createObject(
    { id: "customer", email: "", company: "" },
    [quoteSublines(draft.quote)[0]],
    "invoice",
    { proposal_id: draft.id },
  );
  const invoice = JSON.parse(calls[1].init.body);
  expect(invoice.EmailStatus).toBe("NotSet");
  expect(invoice.BillingLine).toHaveLength(1);
  expect(calls[1].url).toContain("sandbox-quickbooks");
  expect(
    JSON.stringify(await repo.entities("provider_credentials")),
  ).not.toContain("rotated");
});
it("rejects forged/stale/live webhook payloads and queues each verified receipt once", async () => {
  const secret = "whsec_test",
    now = Date.now(),
    t = Math.floor(now / 1000);
  const payload = {
    id: "evt_test",
    livemode: false,
    api_version: "2024-06-20",
    type: "checkout.session.completed",
    data: { object: { metadata: { proposal_id: "" }, customer: "cus_test" } },
  };
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  p.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      attempts: 1,
      external_customer_id: "cus_test",
    },
  ];
  const old = p.revision;
  p.revision++;
  await repo.save(p, old);
  payload.data.object.metadata.proposal_id = p.id;
  const raw = JSON.stringify(payload),
    header = `t=${t},v1=${createHmac("sha256", secret)
      .update(t + "." + raw)
      .digest("hex")}`;
  expect(() => verifyStripeWebhook(raw, header, secret, now + 600000)).toThrow(
    "timestamp",
  );
  expect(() => verifyStripeWebhook(raw + " ", header, secret, now)).toThrow(
    "signature",
  );
  const provider = new StripeProvider(transport().api, repo);
  await receiveStripeWebhook(repo, provider, raw, header, secret);
  await receiveStripeWebhook(repo, provider, raw, header, secret);
  expect(
    (await repo.get(p.id))!.jobs.filter((j) => j.kind === "stripe_webhook"),
  ).toHaveLength(1);
});
it("scheduled plans preserve the phase anchor, count paid invoices and explicitly send the first invoice", async () => {
  const { repo, draft } = await setup();
  const settings = (await repo.entities<any>("workspace_settings"))[0];
  await repo.put("workspace_settings", {
    ...settings,
    collection_method: "send_invoice",
  });
  const line = BillingLineSchema.parse({
    ...quoteSublines(draft.quote)[1],
    schedule: {
      after_paid_invoices: 3,
      then: { amount: 2500, lookup_key: "next-plan" },
    },
    plan_terms: { term_months: 18, payoff_months: 3 },
  });
  const base = transport(false);
  const start = Date.UTC(2026, 0, 31) / 1000,
    end = Date.UTC(2026, 1, 28) / 1000;
  const sub = {
    id: "sub_own",
    customer: "cus_test",
    schedule: null,
    latest_invoice: "in_first",
    current_period_start: start,
    current_period_end: end,
    items: { data: [{ price: { id: "price_initial" }, quantity: 1 }] },
  };
  const api: StripeTransport = {
    async get<T>(path: string, params: Record<string, string>) {
      if (path === "/v1/invoices")
        return {
          data: [{ id: "in_first", status: "paid", amount_paid: 2500 }],
          has_more: false,
        } as T;
      return base.api.get<T>(path, params);
    },
    async post<T>(path: string, params: Record<string, unknown>, key: string) {
      await base.api.post(path, params, key);
      return (
        path === "/v1/subscriptions"
          ? sub
          : path === "/v1/subscription_schedules"
            ? { id: "sched_own", current_phase: { start_date: start } }
            : { id: "ok" }
      ) as T;
    },
  };
  await new StripeProvider(api, repo).finishSetup(
    "cus_test",
    [line],
    "pm_test",
    "setup",
    { currency: "usd", proposal_id: draft.id, proposal_title: draft.title },
  );
  expect(
    base.calls.find((c) => c.path === "/v1/subscriptions")?.params,
  ).toMatchObject({
    collection_method: "send_invoice",
    description: draft.title,
    metadata: { term_months: "18", payoff_months: "3" },
  });
  expect(base.calls.map((c) => c.path)).toContain(
    "/v1/invoices/in_first/finalize",
  );
  expect(base.calls.map((c) => c.path)).toContain("/v1/invoices/in_first/send");
  const phases = base.calls.find(
    (c) => c.path === "/v1/subscription_schedules/sched_own",
  )!.params.phases;
  expect(phases[0].start_date).toBe(start);
  expect(phases[0].end_date).toBe(Date.UTC(2026, 3, 30) / 1000);
  expect(phases[1].metadata.plan).toBe("next-plan");
});

it("D2 preserves existing multi plan keys without a multi sentinel or JSON", async () => {
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const { api, calls } = transport(true, true);
  const result = await bill(p, "stripe", new StripeProvider(api, repo));
  expect(result.status).toBe("succeeded");
  const update = calls.find(
    (c) => c.path === "/v1/subscriptions/sub_existing",
  )!.params;
  expect(update).toEqual({
    metadata: {
      plan: "multi",
      plan_items:
        "hosted-standard-100,hosting-upgrade-60,hosting-essentials-25",
    },
  });
});
