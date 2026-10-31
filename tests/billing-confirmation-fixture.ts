import { createHmac } from "node:crypto";
import { setup, staff, signature, clientActor } from "./helpers";
import { quoteSublines } from "../src/lib/quote-model";
import { StripeProvider } from "../src/lib/providers/stripe";
import { MockBillingProvider } from "../src/lib/billing";
import { MockMailer, Worker } from "../src/lib/jobs";
import type { StripeTransport } from "../src/lib/catalog";
export async function billingFixture(
  mode: "setup" | "subscription" = "setup",
  interval: "month" | "year" = "month",
) {
  const base = await setup();
  base.settings.collection_method =
    mode === "setup" ? "send_invoice" : "charge_automatically";
  await base.repo.put("workspace_settings", base.settings);
  if (interval === "year") {
    for (const item of base.draft.quote.filter((i) =>
      i.sublines.some((s) => s.interval === "month"),
    )) {
      const catalogue = (await base.repo.entities<any>("pricing_items")).find(
        (i) => i.id === item.pricing_item_id,
      );
      if (catalogue)
        await base.repo.put("pricing_items", {
          ...catalogue,
          interval: "year",
          name: "Annual licence",
        });
    }
    await base.service.edit(
      base.draft.id,
      {
        revision: base.draft.revision,
        quote: base.draft.quote.map((i) =>
          i.sublines.some((s) => s.interval === "month")
            ? {
                ...i,
                name: "Annual licence",
                sublines: i.sublines.map((s) => ({
                  ...s,
                  interval: s.interval === "month" ? "year" : s.interval,
                })),
              }
            : i,
        ),
      },
      staff,
    );
  }
  let p = await base.service.send(base.draft.id, staff);
  p = await base.service.sign(
    p.id,
    signature(p.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  const lines = quoteSublines(p.versions.at(-1)!.quote, true).filter(
    (l) => l.interval !== "one_time",
  );
  const id = `cs_fixture_${mode}`;
  p.jobs = [];
  p.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      attempts: 1,
      external_customer_id: "cus_fixture",
      external_object_id: id,
      metadata: {
        requires_checkout: true,
        checkout: [
          {
            id,
            url: "https://checkout.stripe.com/c/pay/fixture",
            mode,
            collection_method: base.settings.collection_method,
            line_ids: lines.map((l) => l.id),
            items: lines.map((l) => ({ line_id: l.id, name: l.name })),
            amount_due_today:
              mode === "setup"
                ? 0
                : lines.reduce((v, l) => v + l.amount * l.qty, 0),
          },
        ],
      },
    },
  ];
  await base.repo.save(p, p.revision);
  const next =
    (interval === "year"
      ? Date.UTC(2027, 9, 31, 17)
      : Date.UTC(2026, 10, 30, 17)) / 1000;
  const method = {
    id: "pm_fixture",
    livemode: false,
    customer: "cus_fixture",
    type: "card",
    card: { brand: "visa", last4: "4242" },
  };
  const session: any = {
    id,
    livemode: false,
    mode,
    status: "complete",
    payment_status: mode === "setup" ? "no_payment_required" : "paid",
    customer: "cus_fixture",
    metadata: { proposal_id: p.id, workspace_id: base.repo.workspaceId },
    setup_intent: "seti_fixture",
    subscription: "sub_fixture",
  };
  const calls: {
    path: string;
    params: Record<string, unknown>;
    key?: string;
  }[] = [];
  const subscriptions = new Map<string, any>();
  const sub = (id: string) => ({
    id,
    livemode: false,
    status: "active",
    customer: "cus_fixture",
    collection_method: base.settings.collection_method,
    default_payment_method: method,
    current_period_end: next,
    latest_invoice: "in_fixture",
    schedule: null,
  });
  subscriptions.set("sub_fixture", sub("sub_fixture"));
  let permissionError = false;
  const api: StripeTransport = {
    async get<T>(path: string, params: Record<string, string>) {
      calls.push({ path, params });
      if (permissionError && path.startsWith("/v1/payment_methods/"))
        throw new Error("Permission denied: payment_methods_read");
      if (path === `/v1/checkout/sessions/${id}`)
        return structuredClone(session) as T;
      if (path === "/v1/setup_intents/seti_fixture")
        return {
          id: "seti_fixture",
          livemode: false,
          status: "succeeded",
          customer: "cus_fixture",
          payment_method: "pm_fixture",
        } as T;
      if (path === "/v1/payment_methods/pm_fixture") return method as T;
      if (path === "/v1/customers/cus_fixture")
        return {
          id: "cus_fixture",
          livemode: false,
          invoice_settings: { default_payment_method: method },
        } as T;
      if (path.startsWith("/v1/subscriptions/"))
        return structuredClone(subscriptions.get(path.split("/").at(-1)!)) as T;
      return { data: [], has_more: false } as T;
    },
    async post<T>(path: string, params: Record<string, unknown>, key: string) {
      calls.push({ path, params, key });
      if (path === "/v1/subscriptions") {
        const id = "sub_" + String(key).replace(/\W/g, "").slice(-40);
        const record = sub(id);
        subscriptions.set(id, record);
        return record as T;
      }
      return { id: "in_fixture" } as T;
    },
  };
  const provider = new StripeProvider(api, base.repo);
  // Price resolution belongs to catalogue tests; use the signed fixture prices here.
  (provider as any).item = async (l: any) => ({
    price: "price_fixture",
    quantity: l.qty,
  });
  const storage = { put: async () => {}, get: async () => new Uint8Array() };
  const mailer = new MockMailer();
  const worker = new Worker(base.repo, storage, mailer, {
    stripe: provider,
    qbo: new MockBillingProvider("qbo"),
  });
  const event = (
    eventId = "evt_fixture",
    type = "checkout.session.completed",
  ) => ({
    id: eventId,
    api_version: "2024-06-20",
    livemode: false,
    type,
    data: {
      object: {
        id,
        customer: "cus_fixture",
        metadata: { proposal_id: p.id, workspace_id: base.repo.workspaceId },
      },
    },
  });
  const signedRequest = (
    eventId = "evt_fixture",
    type = "checkout.session.completed",
  ) => {
    const raw = JSON.stringify(event(eventId, type)),
      t = Math.floor(Date.now() / 1000),
      secret = "whsec_fixture";
    return {
      raw,
      secret,
      header: `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`,
    };
  };
  return {
    ...base,
    p,
    lines,
    id,
    provider,
    worker,
    mailer,
    storage,
    session,
    method,
    subscriptions,
    calls,
    event,
    signedRequest,
    denyPaymentMethods: (v: boolean) => {
      permissionError = v;
    },
  };
}
