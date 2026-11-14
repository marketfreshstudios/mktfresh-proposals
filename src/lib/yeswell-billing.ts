import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, check } from "./model";
import { supabase } from "./repository";
import { requireTestStripeKey } from "./providers/stripe-http";
import { verifyStripeWebhook } from "./providers/webhook";
import { workspaceOrigin } from "./links";
import { ResendMailer } from "./jobs";
import { yeswellFrom } from "./email-identity";
import {
  CATALOG,
  PLANS,
  type BillingInterval,
  type PriceKind,
} from "./yeswell-plans";
export { PLANS };

// Yeswell's own plans, billed on the operator's Stripe account in test mode.
// These are the approved launch prices (cents); Stripe does all the totals.
export const STRIPE_BILLING_VERSION = "2025-09-30.clover";
type Kind = PriceKind;
type Interval = BillingInterval;
export const lookupKey = (kind: Kind, interval: Interval) =>
  `yeswell_${kind}_${interval}ly`;
export const catalogCents = (kind: Kind, interval: Interval) =>
  CATALOG[kind][interval];

export const SelectionSchema = z
  .object({
    plan: z.enum(["studio", "agency"]),
    interval: z.enum(["month", "year"]),
    people: z.number().int().min(1).max(100),
    domain: z.boolean(),
  })
  .strict();
export type Selection = z.infer<typeof SelectionSchema>;

/** The Stripe line items for a selection (prices referenced by lookup key). */
export function selectionItems(s: Selection) {
  const items: { kind: Kind; quantity: number }[] = [
    { kind: s.plan, quantity: 1 },
  ];
  const extra = s.people - PLANS[s.plan].included;
  if (extra > 0) items.push({ kind: "seat", quantity: extra });
  if (s.plan === "studio" && s.domain)
    items.push({ kind: "domain", quantity: 1 });
  return items;
}

export type StripeApi = {
  get<T>(path: string, params?: URLSearchParams): Promise<T>;
  post<T>(
    path: string,
    params: Record<string, unknown>,
    key?: string,
  ): Promise<T>;
};
function form(value: unknown, path: string, out: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value))
    value.forEach((v, i) => form(v, `${path}[${i}]`, out));
  else if (typeof value === "object")
    Object.entries(value).forEach(([k, v]) =>
      form(v, path ? `${path}[${k}]` : k, out),
    );
  else out.append(path, String(value));
}
export function yeswellStripe(fetcher: typeof fetch = fetch): StripeApi {
  const key = process.env.YESWELL_STRIPE_SECRET_KEY ?? "";
  if (!key) throw new AppError(503, "Billing isn't set up yet.");
  requireTestStripeKey(key);
  async function request<T>(
    path: string,
    method: string,
    body?: URLSearchParams,
    idem?: string,
  ) {
    check(
      /^\/v1\/[a-z_]+(?:\/[A-Za-z0-9_]+)*(?:\?.*)?$/.test(path),
      "Invalid Stripe path",
    );
    const response = await fetcher("https://api.stripe.com" + path, {
      method,
      headers: {
        Authorization: "Bearer " + key,
        "Stripe-Version": STRIPE_BILLING_VERSION,
        ...(idem ? { "Idempotency-Key": idem } : {}),
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const data = await response.json();
    check(
      response.ok,
      `Stripe request failed (${response.status}; ${data.error?.code ?? "provider_error"})`,
      502,
    );
    check(data.livemode !== true, "Live Stripe response refused", 503);
    return data as T;
  }
  return {
    get: (path, params) => request(path + (params ? "?" + params : ""), "GET"),
    post: (path, params, idem) => {
      const body = new URLSearchParams();
      form(params, "", body);
      return request(path, "POST", body, idem);
    },
  };
}

type Price = {
  id: string;
  lookup_key: string | null;
  unit_amount: number | null;
};
const priceCache = new Map<string, string>();
/** Price ids by lookup key, creating any that don't exist yet (test mode). */
export async function ensurePrices(
  stripe: StripeApi,
  keys: { kind: Kind; interval: Interval }[],
) {
  const wanted = keys
    .map((k) => lookupKey(k.kind, k.interval))
    .filter((k) => !priceCache.has(k));
  if (wanted.length) {
    const params = new URLSearchParams({ active: "true", limit: "20" });
    for (const k of wanted) params.append("lookup_keys[]", k);
    const found = await stripe.get<{ data: Price[] }>("/v1/prices", params);
    for (const p of found.data)
      if (p.lookup_key) priceCache.set(p.lookup_key, p.id);
    for (const k of keys) {
      const key = lookupKey(k.kind, k.interval);
      if (priceCache.has(key)) continue;
      const created = await stripe.post<Price>(
        "/v1/prices",
        {
          currency: "usd",
          unit_amount: catalogCents(k.kind, k.interval),
          recurring: { interval: k.interval },
          lookup_key: key,
          product_data: { name: CATALOG[k.kind].name },
        },
        `yeswell-price-${key}-v1`,
      );
      priceCache.set(key, created.id);
    }
  }
  return new Map(
    keys.map((k) => [
      lookupKey(k.kind, k.interval),
      priceCache.get(lookupKey(k.kind, k.interval))!,
    ]),
  );
}
export function forgetPrices() {
  priceCache.clear();
}

async function stripeItems(stripe: StripeApi, s: Selection) {
  const items = selectionItems(s);
  const prices = await ensurePrices(
    stripe,
    items.map((i) => ({ kind: i.kind, interval: s.interval })),
  );
  return items.map((i) => ({
    price: prices.get(lookupKey(i.kind, s.interval))!,
    quantity: i.quantity,
  }));
}

/** Stripe's own total for a selection, so the app never adds prices itself. */
export async function previewSelection(stripe: StripeApi, s: Selection) {
  const preview = await stripe.post<{
    total: number;
    currency: string;
    lines: { data: { description: string | null; amount: number }[] };
  }>("/v1/invoices/create_preview", {
    customer_details: { address: { country: "US" } },
    subscription_details: { items: await stripeItems(stripe, s) },
  });
  return {
    total_cents: preview.total,
    currency: preview.currency,
    interval: s.interval,
    lines: preview.lines.data.map((l) => ({
      description: l.description ?? "",
      cents: l.amount,
    })),
  };
}

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_status: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription: Record<string, unknown> | null;
  launch_price: boolean;
};
export type BillingStore = {
  workspace(id: string): Promise<WorkspaceRow>;
  setCustomer(id: string, customer: string): Promise<void>;
  launchSpotsLeft(): Promise<number>;
  sync(
    id: string,
    customer: string,
    sub: string,
    status: string,
    details: unknown,
  ): Promise<string>;
  claimEvent(id: string): Promise<boolean>;
  workspaceForCustomer(customer: string): Promise<string | null>;
  owners(id: string): Promise<{ email: string; name: string }[]>;
};
export function databaseBillingStore(): BillingStore {
  const db = supabase();
  const fail = () => new AppError(503, "Billing storage is unavailable.");
  return {
    async workspace(id) {
      const { data, error } = await db
        .from("workspaces")
        .select(
          "id,name,slug,plan_status,trial_ends_at,stripe_customer_id,stripe_subscription_id,subscription,launch_price",
        )
        .eq("id", id)
        .single();
      if (error) throw fail();
      return data as WorkspaceRow;
    },
    async setCustomer(id, customer) {
      const { error } = await db
        .from("workspaces")
        .update({ stripe_customer_id: customer })
        .eq("id", id)
        .is("stripe_customer_id", null);
      if (error) throw fail();
    },
    async launchSpotsLeft() {
      const { data, error } = await db.rpc("launch_spots_left");
      if (error) throw fail();
      return Number(data);
    },
    async sync(id, customer, sub, status, details) {
      const { data, error } = await db.rpc("sync_workspace_subscription", {
        target_workspace: id,
        customer,
        subscription_id: sub,
        stripe_status: status,
        details,
      });
      if (error) throw fail();
      return String(data);
    },
    async claimEvent(id) {
      const { data, error } = await db.rpc("claim_yeswell_billing_event", {
        event_id: id,
      });
      if (error) throw fail();
      return data === true;
    },
    async workspaceForCustomer(customer) {
      const { data, error } = await db
        .from("workspaces")
        .select("id")
        .eq("stripe_customer_id", customer)
        .maybeSingle();
      if (error) throw fail();
      return data?.id ?? null;
    },
    async owners(id) {
      const { data } = await db
        .from("staff_users")
        .select("user_id,display_name")
        .eq("workspace_id", id)
        .eq("role", "owner")
        .eq("status", "active");
      const out: { email: string; name: string }[] = [];
      for (const o of data ?? []) {
        const user = await db.auth.admin.getUserById(o.user_id);
        if (user.data.user?.email)
          out.push({ email: user.data.user.email, name: o.display_name });
      }
      return out;
    },
  };
}

const MIN_TRIAL_LEAD = 2 * 86400000; // Stripe needs trial_end at least 48h out.
export async function startCheckout(
  stripe: StripeApi,
  store: BillingStore,
  workspaceId: string,
  owner: { email: string },
  s: Selection,
  now = Date.now(),
) {
  const w = await store.workspace(workspaceId);
  check(
    !w.stripe_subscription_id || ["canceled"].includes(w.plan_status),
    "You already have a plan. Use Manage billing to change it.",
    409,
  );
  let customer = w.stripe_customer_id;
  if (!customer) {
    const created = await stripe.post<{ id: string }>(
      "/v1/customers",
      { email: owner.email, name: w.name, metadata: { workspace_id: w.id } },
      `yeswell-customer-${w.id}`,
    );
    await store.setCustomer(w.id, created.id);
    customer = (await store.workspace(w.id)).stripe_customer_id;
    check(customer, "Billing storage is unavailable.", 503);
  }
  const origin = workspaceOrigin(w.slug);
  // Subscribing during the trial keeps the rest of the trial free.
  const trialEnd =
    w.plan_status === "trial" && w.trial_ends_at
      ? Date.parse(w.trial_ends_at)
      : NaN;
  const session = await stripe.post<{ id: string; url: string }>(
    "/v1/checkout/sessions",
    {
      mode: "subscription",
      customer,
      client_reference_id: w.id,
      line_items: await stripeItems(stripe, s),
      success_url: `${origin}/billing?checkout=done`,
      cancel_url: `${origin}/billing`,
      branding_settings: { display_name: "Yeswell" },
      subscription_data: {
        metadata: { workspace_id: w.id },
        ...(trialEnd - now > MIN_TRIAL_LEAD
          ? { trial_end: Math.floor(trialEnd / 1000) }
          : {}),
      },
    },
    `yeswell-checkout-${w.id}-${randomUUID()}`,
  );
  check(
    /^https:\/\/checkout\.stripe\.com\//.test(session.url),
    "Stripe returned an unexpected checkout address.",
    502,
  );
  return { url: session.url };
}

export async function openPortal(
  stripe: StripeApi,
  store: BillingStore,
  workspaceId: string,
) {
  const w = await store.workspace(workspaceId);
  check(w.stripe_customer_id, "Choose a plan first.", 409);
  const portal = await stripe.post<{ url: string }>(
    "/v1/billing_portal/sessions",
    {
      customer: w.stripe_customer_id,
      return_url: `${workspaceOrigin(w.slug)}/billing`,
    },
  );
  check(
    /^https:\/\/billing\.stripe\.com\//.test(portal.url),
    "Stripe returned an unexpected billing address.",
    502,
  );
  return { url: portal.url };
}

type Subscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
  items: {
    data: {
      price: { lookup_key: string | null; id: string };
      quantity: number;
      current_period_end?: number;
    }[];
  };
};
/** What the app shows about a subscription, read from its items. */
export function subscriptionDetails(sub: Subscription) {
  let plan: "studio" | "agency" | null = null,
    interval: Interval | null = null,
    seats = 0,
    domain = false,
    period: number | null = null;
  for (const item of sub.items.data) {
    const m = /^yeswell_(studio|agency|seat|domain)_(month|year)ly$/.exec(
      item.price.lookup_key ?? "",
    );
    if (!m) continue;
    interval = m[2] as Interval;
    if (m[1] === "studio" || m[1] === "agency") plan = m[1];
    if (m[1] === "seat") seats = item.quantity;
    if (m[1] === "domain") domain = true;
    period ??= item.current_period_end ?? null;
  }
  return {
    plan,
    interval,
    extra_people: seats,
    people: plan ? PLANS[plan].included + seats : null,
    domain: plan === "agency" || domain,
    current_period_end: period ? new Date(period * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    status: sub.status,
  };
}

async function syncSubscription(
  stripe: StripeApi,
  store: BillingStore,
  id: string,
) {
  const sub = await stripe.get<Subscription>(`/v1/subscriptions/${id}`);
  const workspace =
    sub.metadata?.workspace_id ??
    (await store.workspaceForCustomer(sub.customer));
  if (!workspace) return null;
  const status = await store.sync(
    workspace,
    sub.customer,
    sub.id,
    sub.status,
    subscriptionDetails(sub),
  );
  return { workspace, status, sub };
}

/** Handles a verified Yeswell billing webhook. */
export async function handleBillingWebhook(
  raw: string,
  signature: string,
  deps: {
    stripe: StripeApi;
    store: BillingStore;
    mail: (
      to: string,
      subject: string,
      text: string,
      html: string,
      key: string,
    ) => Promise<void>;
  },
  now = Date.now(),
) {
  const event = verifyStripeWebhook(
    raw,
    signature,
    process.env.YESWELL_STRIPE_WEBHOOK_SECRET ?? "",
    now,
  ) as {
    id: string;
    type: string;
    data: { object: Record<string, any> };
  };
  check(/^evt_[A-Za-z0-9]+$/.test(event.id ?? ""), "Invalid event", 400);
  const object = event.data.object;
  const subscriptionId =
    event.type === "checkout.session.completed"
      ? object.subscription
      : event.type.startsWith("customer.subscription.")
        ? object.id
        : event.type.startsWith("invoice.")
          ? (object.parent?.subscription_details?.subscription ??
            object.subscription)
          : null;
  if (
    typeof subscriptionId !== "string" ||
    !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)
  )
    return { received: true, ignored: true };
  const synced = await syncSubscription(
    deps.stripe,
    deps.store,
    subscriptionId,
  );
  if (!synced) return { received: true, ignored: true };
  if (
    event.type === "invoice.payment_failed" &&
    (await deps.store.claimEvent(event.id))
  ) {
    const w = await deps.store.workspace(synced.workspace);
    const url = `${workspaceOrigin(w.slug)}/billing`;
    for (const owner of await deps.store.owners(synced.workspace)) {
      const first = owner.name.split(" ")[0];
      const text = `Hi ${first},\n\nWe couldn't charge the card on file for ${w.name}'s Yeswell plan. Update your card within 7 days to keep creating and sending proposals. Your proposals and client links keep working.\n\nUpdate your card: ${url}`;
      const html = `<!doctype html><html><body style="margin:0;background:#f2efe8;font-family:Helvetica,Arial,sans-serif;color:#13303a"><div style="max-width:520px;margin:0 auto;padding:32px 20px"><div style="background:#faf8f4;border:1px solid #e2ddd3;border-radius:14px;padding:28px 24px"><p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(first)},</p><p style="margin:0 0 16px;font-size:16px;line-height:24px">We couldn't charge the card on file for ${escapeHtml(w.name)}'s Yeswell plan. Update your card within 7 days to keep creating and sending proposals. Your proposals and client links keep working.</p><a href="${escapeHtml(url)}" style="display:inline-block;background:#bf5f2e;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px">Update card</a></div></div></body></html>`;
      await deps
        .mail(
          owner.email,
          "Your Yeswell payment didn't go through",
          text,
          html,
          `yeswell-payment-failed:${event.id}:${owner.email}`,
        )
        .catch(() => console.error("Unable to send a payment-failed email"));
    }
  }
  return { received: true, workspace_status: synced.status };
}
const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function billingMailer() {
  const mailer = new ResendMailer();
  return async (
    to: string,
    subject: string,
    text: string,
    html: string,
    key: string,
  ) => {
    const from = yeswellFrom();
    if (!from) return;
    await mailer.send({ from, to, subject, text, html }, key);
  };
}

/** What the billing page needs. Card details come live from Stripe. */
export async function billingOverview(
  stripe: StripeApi | null,
  store: BillingStore,
  workspaceId: string,
) {
  const w = await store.workspace(workspaceId);
  let card: { brand: string; last4: string } | null = null;
  if (stripe && w.stripe_subscription_id && w.plan_status !== "canceled") {
    const sub = await stripe
      .get<{
        default_payment_method: {
          card?: { brand: string; last4: string };
        } | null;
      }>(
        `/v1/subscriptions/${w.stripe_subscription_id}`,
        new URLSearchParams({ "expand[]": "default_payment_method" }),
      )
      .catch(() => null);
    const c = sub?.default_payment_method?.card;
    if (c) card = { brand: c.brand, last4: c.last4 };
  }
  return {
    subscribed: !!w.stripe_subscription_id && w.plan_status !== "canceled",
    // Workspaces that were active before self-serve billing aren't charged.
    not_billed: w.plan_status === "active" && !w.stripe_subscription_id,
    subscription: w.subscription,
    launch_price: w.launch_price,
    launch_spots_left: await store.launchSpotsLeft(),
    card,
    billing_ready: !!stripe,
  };
}
