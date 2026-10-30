import type { Client, Item } from "./model";
import type { StripeTransport, StripePage } from "./catalog";
import type { Repository } from "./repository";
import { check } from "./model";
import { itemDisplayName } from "./catalogue-display";
export type CustomerCandidate = {
  id: string;
  name: string;
  created: string | null;
  card: string | null;
  subscriptions: number;
  monthly_totals: { currency: string; amount: number }[];
};
export type ClientBilling = {
  candidates?: CustomerCandidate[];
  linked_id?: string | null;
  subscriptions?: number;
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
type BillingSummary = ClientBilling & {
  customer?: { id: string; name: string; created?: number };
};
async function billingSummary(
  repo: Repository,
  client: Client,
  api?: StripeTransport,
): Promise<BillingSummary> {
  const result: BillingSummary = {
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
  const id = client.stripe_customer_id;
  if (!id) return result;
  check(/^cus_[A-Za-z0-9]+$/.test(id), "Invalid Stripe customer ID");
  const customer = await api.get<{
    livemode: boolean;
    created?: number;
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
  result.customer = {
    id,
    name: customer.name || client.company,
    created: customer.created,
  };
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
      result.subscriptions = (result.subscriptions ?? 0) + 1;
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
        check(
          price.unit_amount !== null,
          "A variable-price subscription needs review in Stripe",
          409,
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
          amount: price.unit_amount,
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
  let card =
    cards[0] ?? customer.invoice_settings?.default_payment_method?.card;
  if (!card) {
    const methods = await api.get<
      StripePage<{
        livemode: boolean;
        card?: {
          brand: string;
          last4: string;
          exp_year: number;
          exp_month: number;
        };
      }>
    >("/v1/payment_methods", { customer: id, type: "card", limit: "1" });
    if (methods.data[0]?.card) {
      check(
        methods.data[0].livemode === false,
        "Test-mode payment method required",
      );
      card = methods.data[0].card;
    }
  }
  if (card) result.card = `${card.brand} ending ${card.last4}`;
  return result;
}

export async function stripeCustomerMatches(
  client: Client,
  api: StripeTransport,
) {
  const matches: { id: string; name?: string | null; created?: number }[] = [];
  let cursor = "";
  do {
    const page = await api.get<
      StripePage<{
        id: string;
        email: string | null;
        name?: string | null;
        created?: number;
        livemode: boolean;
        deleted?: boolean;
      }>
    >("/v1/customers", {
      // Stripe’s email filter is case-sensitive; local clients are normalized.
      // Scan test customers so differently cased duplicates cannot be missed.
      limit: "100",
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const c of page.data) {
      check(c.livemode === false && !c.deleted, "Test-mode customer required");
      if (c.email?.toLowerCase() === client.email.toLowerCase())
        matches.push(c);
    }
    if (!page.has_more) break;
    check(
      page.data.length && cursor !== page.data.at(-1)!.id,
      "Invalid customer pagination",
    );
    cursor = page.data.at(-1)!.id;
  } while (true);
  return matches;
}
export async function clientBilling(
  repo: Repository,
  client: Client,
  api?: StripeTransport,
): Promise<ClientBilling> {
  const { customer, ...result } = await billingSummary(repo, client, api);
  result.linked_id = client.stripe_customer_id;
  result.candidates = [];
  if (!api) return result;
  const matches = client.stripe_customer_id
    ? [
        customer ?? {
          id: client.stripe_customer_id,
          name: client.company,
          created: undefined,
        },
      ]
    : await stripeCustomerMatches(client, api);
  for (const c of matches) {
    const details =
      c.id === client.stripe_customer_id
        ? result
        : await billingSummary(
            repo,
            { ...client, stripe_customer_id: c.id },
            api,
          );
    const currencies = [
      ...new Set(
        details.items
          .filter((i) => i.interval === "month" && i.interval_count === 1)
          .map((i) => i.currency),
      ),
    ];
    result.candidates.push({
      id: c.id,
      name: c.name || client.company,
      created: c.created ? new Date(c.created * 1000).toISOString() : null,
      card: details.card,
      subscriptions: details.subscriptions ?? 0,
      monthly_totals: currencies.map((currency) => ({
        currency,
        amount: details.items
          .filter(
            (i) =>
              i.currency === currency &&
              i.interval === "month" &&
              i.interval_count === 1,
          )
          .reduce((v, i) => v + i.amount * i.qty, 0),
      })),
    });
  }
  if (!client.stripe_customer_id)
    result.notice =
      matches.length === 0
        ? "No Stripe customer yet; one is created at checkout"
        : matches.length === 1
          ? "Choose Link this customer to use this Stripe record."
          : "Choose which Stripe customer this client is";
  return result;
}
