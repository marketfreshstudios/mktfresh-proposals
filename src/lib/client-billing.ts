import type { Client, Item } from "./model";
import type { StripeTransport, StripePage } from "./catalog";
import type { Repository } from "./repository";
import { check } from "./model";
import { itemDisplayName } from "./catalogue-display";
export type ClientBilling = {
  available: boolean;
  subscriber: boolean;
  items: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
    qty: number;
    interval_count: number;
  }[];
  card: string | null;
  next_invoice: string | null;
  stripe_url: string | null;
  qbo_url: string | null;
  notice?: string;
};
export async function clientBilling(
  repo: Repository,
  client: Client,
  api?: StripeTransport,
): Promise<ClientBilling> {
  const proposals = await repo.list();
  const ids = [
    ...new Set(
      [
        client.stripe_customer_id,
        ...proposals
          .filter((p) => p.client.id === client.id)
          .flatMap((p) =>
            p.billing_links
              .filter((l) => l.provider === "stripe")
              .map((l) => l.external_customer_id),
          ),
      ].filter((v): v is string => !!v && !v.startsWith("mock_")),
    ),
  ];
  const result: ClientBilling = {
    available: !!api,
    subscriber: false,
    items: [],
    card: null,
    next_invoice: null,
    stripe_url: null,
    qbo_url: client.qbo_customer_id
      ? `https://app.sandbox.qbo.intuit.com/app/customerdetail?nameId=${encodeURIComponent(client.qbo_customer_id)}`
      : null,
  };
  if (!api)
    return {
      ...result,
      notice:
        "Stripe is not connected. Current subscription and card details are unavailable.",
    };
  check(ids.length <= 1, "Multiple Stripe customer records need review", 409);
  if (!ids.length)
    return {
      ...result,
      notice:
        "No verified Stripe customer is linked. Billing will be checked after signature.",
    };
  const id = ids[0];
  check(/^cus_[A-Za-z0-9]+$/.test(id), "Invalid Stripe customer ID");
  const customer = await api.get<{
    livemode: boolean;
    email?: string | null;
    name?: string | null;
    deleted?: boolean;
    invoice_settings?: {
      default_payment_method: {
        card?: {
          brand: string;
          last4: string;
          exp_year: number;
          exp_month: number;
        };
      } | null;
    };
  }>(`/v1/customers/${id}`, {
    "expand[]": "invoice_settings.default_payment_method",
  });
  check(
    customer.livemode === false && !customer.deleted,
    "Test-mode customer required",
  );
  check(
    customer.email?.toLowerCase() === client.email.toLowerCase(),
    "Linked Stripe customer email does not match this client; verify the customer ID",
    409,
  );
  result.stripe_url = `https://dashboard.stripe.com/test/customers/${id}`;
  const catalog = await repo.entities<Item>("pricing_items");
  type Subscription = {
    id: string;
    livemode: boolean;
    status: string;
    current_period_end?: number;
    default_payment_method?: {
      card?: {
        brand: string;
        last4: string;
        exp_year: number;
        exp_month: number;
      };
    } | null;
    items: { has_more?: boolean; data: SubscriptionItem[] };
  };
  type SubscriptionItem = {
    id: string;
    quantity: number;
    price: {
      unit_amount: number | null;
      currency: string;
      lookup_key: string | null;
      nickname: string | null;
      product: string | { name: string };
      recurring: { interval: string; interval_count: number };
    };
  };
  let cursor = "";
  const cards = [];
  do {
    const page = await api.get<StripePage<Subscription>>("/v1/subscriptions", {
      customer: id,
      status: "all",
      limit: "100",
      "expand[]": "data.default_payment_method",
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const sub of page.data) {
      check(sub.livemode === false, "Test-mode subscription required");
      if (
        !["active", "trialing", "past_due", "unpaid", "paused"].includes(
          sub.status,
        )
      )
        continue;
      result.subscriber = true;
      if (sub.default_payment_method?.card)
        cards.push(sub.default_payment_method.card);
      if (sub.current_period_end) {
        const date = new Date(sub.current_period_end * 1000).toISOString();
        if (!result.next_invoice || date < result.next_invoice)
          result.next_invoice = date;
      }
      let entries = sub.items.data;
      let itemCursor = entries.at(-1)?.id;
      if (sub.items.has_more)
        for (;;) {
          const rest = await api.get<StripePage<SubscriptionItem>>(
            "/v1/subscription_items",
            {
              subscription: sub.id,
              limit: "100",
              ...(itemCursor ? { starting_after: itemCursor } : {}),
            },
          );
          entries = entries.concat(rest.data);
          if (!rest.has_more) break;
          check(rest.data.length, "Invalid subscription pagination");
          itemCursor = rest.data.at(-1)!.id;
        }
      for (const entry of entries) {
        const price = entry.price,
          known = catalog.find(
            (i) =>
              i.stripe_lookup_key === price.lookup_key ||
              i.sublines?.some((s) => s.stripe_lookup_key === price.lookup_key),
          );
        result.items.push({
          id: entry.id,
          name: known
            ? itemDisplayName(known)
            : price.nickname ||
              (typeof price.product === "object"
                ? price.product.name
                : price.lookup_key) ||
              "Subscription item",
          amount: price.unit_amount ?? 0,
          currency: price.currency.toUpperCase(),
          interval: price.recurring.interval,
          interval_count: price.recurring.interval_count,
          qty: entry.quantity ?? 1,
        });
      }
    }
    if (!page.has_more) break;
    check(page.data.length, "Invalid subscription pagination");
    cursor = page.data.at(-1)!.id;
  } while (true);
  const card =
    cards[0] ?? customer.invoice_settings?.default_payment_method?.card;
  if (card) result.card = `${card.brand} ending ${card.last4}`;
  return result;
}
