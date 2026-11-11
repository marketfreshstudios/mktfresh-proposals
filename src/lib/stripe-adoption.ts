import {
  resolveLookup,
  type StripePage,
  type StripeTransport,
} from "./catalog";
import {
  AppError,
  check,
  type Actor,
  type Client,
  type Proposal,
} from "./model";
import { oiotCarePlans } from "../../seed/oiot-plan";
import { quoteSublines } from "./quote-model";
import { mutate, type Repository } from "./repository";
import { event } from "./service";
import {
  adoptedStripeSubscription,
  needsStripeLink,
  recordedStripeSubscriptions,
  stripeLink,
  stripeLinkBlocker,
  type AdoptedStripeSubscription,
  type StripeLinkedPrice,
  type StripeSubscriptionChoice,
  type StripeSubscriptionOptions,
} from "./stripe-subscription-link";

type StripeRead = Pick<StripeTransport, "get" | "accountId">;
type Price = {
  id: string;
  unit_amount: number | null;
  currency?: string;
  lookup_key: string | null;
  nickname: string | null;
  product: string | { name?: string };
  recurring?: { interval: string; interval_count?: number } | null;
};
type Entry = { id: string; price: Price; quantity?: number };
export type AdoptionSubscription = {
  id: string;
  customer: string;
  livemode: boolean;
  status: string;
  current_period_end?: number;
  schedule?: string | null;
  metadata?: Record<string, string>;
  items: StripePage<Entry>;
};
type StripeSchedule = {
  id: string;
  livemode: boolean;
  customer: string;
  subscription: string | null;
  phases: {
    start_date: number;
    end_date: number;
    items: { price: string | Price; quantity?: number }[];
  }[];
};
const customerId = /^cus_[A-Za-z0-9]+$/;
export const subscriptionId = /^sub_[A-Za-z0-9]+$/;
const usableStatuses = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
]);
const date = (value?: number) =>
  value ? new Date(value * 1000).toISOString() : null;

async function all<T extends { id: string }>(
  api: StripeRead,
  path: string,
  params: Record<string, string>,
) {
  const result: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.get<StripePage<T>>(path, {
      ...params,
      limit: "100",
      ...(cursor ? { starting_after: cursor } : {}),
    });
    result.push(...page.data);
    if (!page.has_more) return result;
    const next = page.data.at(-1)?.id;
    check(next && next !== cursor, "Stripe returned an invalid list.", 502);
    cursor = next;
  } while (true);
}
function stripePrice(price: Price, quantity = 1): StripeLinkedPrice {
  return {
    id: price.id,
    name:
      (typeof price.product === "object" ? price.product.name : "") ||
      price.nickname ||
      price.lookup_key ||
      "Stripe price",
    amount: price.unit_amount,
    currency: price.currency ?? "",
    interval: price.recurring?.interval ?? "",
    intervalCount: price.recurring?.interval_count ?? 1,
    quantity,
    lookupKey: price.lookup_key,
  };
}
async function choice(
  api: StripeRead,
  sub: AdoptionSubscription,
): Promise<StripeSubscriptionChoice> {
  let items = sub.items.data;
  if (sub.items.has_more)
    items = await all<Entry>(api, "/v1/subscription_items", {
      subscription: sub.id,
      "expand[]": "data.price.product",
    });
  return {
    id: sub.id,
    status: sub.status,
    nextBillingAt: date(sub.current_period_end),
    prices: items.map(({ price, quantity }) => stripePrice(price, quantity)),
  };
}
function requireStaff(repo: Repository, actor: Actor) {
  check(
    actor.actor.startsWith("staff:") &&
      (!actor.workspace_id || actor.workspace_id === repo.workspaceId),
    "Staff access required.",
    403,
  );
}
async function currentClient(repo: Repository, p: Proposal) {
  const client = (await repo.entities<Client>("clients")).find(
    (c) => c.id === p.client.id,
  );
  check(client && !client.archived_at, "This client is unavailable.", 409);
  const billed = stripeLink(p)?.external_customer_id;
  check(
    !billed ||
      !client.stripe_customer_id ||
      billed === client.stripe_customer_id,
    "The Stripe customer on this proposal differs from the client record. Review the customer before linking.",
    409,
  );
  return { client, id: client.stripe_customer_id ?? billed };
}
async function verifyCustomer(api: StripeRead, id: string, client: Client) {
  check(customerId.test(id), "Invalid Stripe customer.", 409);
  const found = await api.get<{
    id: string;
    email?: string;
    livemode: boolean;
    deleted?: boolean;
  }>(`/v1/customers/${id}`, {});
  check(
    found.id === id &&
      found.livemode === false &&
      !found.deleted &&
      found.email?.toLowerCase() === client.email.toLowerCase(),
    "The connected Stripe customer does not match this client. Review the customer link.",
    409,
  );
}
export async function stripeSubscriptionOptions(
  repo: Repository,
  p: Proposal,
  actor: Actor,
  api?: StripeRead,
): Promise<StripeSubscriptionOptions> {
  requireStaff(repo, actor);
  check(
    needsStripeLink(p),
    "This proposal does not need a Stripe subscription link.",
    409,
  );
  const result = {
    clientId: p.client.id,
    choices: [] as StripeSubscriptionChoice[],
  };
  const blocked = stripeLinkBlocker(p);
  if (blocked) return { ...result, notice: blocked };
  if (!api)
    return {
      ...result,
      notice: "Connect Stripe in Studio to find this client’s subscriptions.",
    };
  const { client, id } = await currentClient(repo, p);
  if (!id)
    return {
      ...result,
      notice:
        "Link this client to their Stripe customer on the client record first.",
    };
  await verifyCustomer(api, id, client);
  const subscriptions = await all<AdoptionSubscription>(
    api,
    "/v1/subscriptions",
    {
      customer: id,
      status: "all",
      "expand[]": "data.items.data.price",
    },
  );
  for (const sub of subscriptions)
    check(
      sub.livemode === false &&
        sub.customer === id &&
        subscriptionId.test(sub.id),
      "Stripe returned a subscription for another customer or mode.",
      502,
    );
  const selectable = subscriptions.filter((sub) =>
    usableStatuses.has(sub.status),
  );
  return {
    ...result,
    choices: await Promise.all(selectable.map((sub) => choice(api, sub))),
    ...(selectable.length
      ? {}
      : {
          notice:
            "This Stripe customer has no subscriptions available to link.",
        }),
  };
}

function acceptedPlan(p: Proposal, prices: StripeLinkedPrice[]) {
  const recurring = quoteSublines(
    p.versions.at(-1)?.quote ?? p.quote,
    true,
  ).filter((line) => line.interval !== "one_time");
  const matches = recurring.filter(
    (line) =>
      line.schedule &&
      line.stripe_lookup_key &&
      prices.some((price) => price.lookupKey === line.stripe_lookup_key),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
const priceMatches = (
  price: StripeLinkedPrice,
  line: ReturnType<typeof acceptedPlan>,
) =>
  !!line &&
  price.lookupKey === line.stripe_lookup_key &&
  price.amount === line.amount &&
  price.interval === line.interval &&
  price.intervalCount === 1 &&
  price.quantity === line.qty;
function threshold(value?: string) {
  return value && /^\d{1,5}$/.test(value) && Number(value) > 0
    ? Number(value)
    : undefined;
}
export async function readStripeAdoption(
  api: StripeRead,
  p: Proposal,
  sub: AdoptionSubscription,
  identity: Pick<AdoptedStripeSubscription, "linkedAt" | "linkedBy">,
): Promise<AdoptedStripeSubscription> {
  check(
    sub.livemode === false &&
      subscriptionId.test(sub.id) &&
      customerId.test(sub.customer),
    "Stripe test subscription required.",
    409,
  );
  const details = await choice(api, sub);
  const result: AdoptedStripeSubscription = {
    ...identity,
    ...details,
    customerId: sub.customer,
    accountId: api.accountId ?? null,
  };
  const line = acceptedPlan(p, details.prices);
  if (sub.schedule) {
    check(
      /^sub_sched_[A-Za-z0-9]+$/.test(sub.schedule),
      "Invalid Stripe schedule.",
      502,
    );
    const schedule = await api.get<StripeSchedule>(
      `/v1/subscription_schedules/${sub.schedule}`,
      { "expand[]": "phases.items.price" },
    );
    check(
      schedule.id === sub.schedule &&
        schedule.livemode === false &&
        schedule.customer === sub.customer &&
        schedule.subscription === sub.id,
      "Stripe schedule does not match this subscription.",
      502,
    );
    const cache = new Map<string, Promise<Price>>();
    result.schedule = {
      id: schedule.id,
      phases: await Promise.all(
        schedule.phases.map(async (phase) => ({
          startsAt: date(phase.start_date),
          endsAt: date(phase.end_date),
          prices: await Promise.all(
            phase.items.map(async (item) => {
              if (typeof item.price !== "string")
                return stripePrice(item.price, item.quantity);
              check(
                /^price_[A-Za-z0-9]+$/.test(item.price),
                "Invalid Stripe price.",
                502,
              );
              if (!cache.has(item.price))
                cache.set(
                  item.price,
                  api.get<Price>(`/v1/prices/${item.price}`, {
                    "expand[]": "product",
                  }),
                );
              return stripePrice(await cache.get(item.price)!, item.quantity);
            }),
          ),
        })),
      ),
    };
  }
  const plan = oiotCarePlans.find((plan) =>
    details.prices.some((price) => price.lookupKey === plan.lookup),
  );
  if (plan || line?.schedule) {
    const paid = await all<{ id: string; status: string; amount_paid: number }>(
      api,
      "/v1/invoices",
      { subscription: sub.id, status: "paid" },
    );
    result.paidInvoices = new Set(
      paid
        .filter(
          (invoice) => invoice.status === "paid" && invoice.amount_paid > 0,
        )
        .map((invoice) => invoice.id),
    ).size;
    const after =
      threshold(
        sub.metadata?.after_paid_invoices ??
          sub.metadata?.step_down_after_paid_invoices,
      ) ?? line?.schedule?.after_paid_invoices;
    const lookup = line?.schedule?.then.lookup_key ?? plan?.stepDownLookup;
    if (!result.schedule && after && lookup) {
      let target: Price | undefined;
      try {
        target = await resolveLookup(api, lookup);
      } catch (error) {
        // An unavailable lookup key cannot prevent recording the subscription.
        if (!(error instanceof AppError) || error.status !== 400) throw error;
      }
      if (target) {
        const price = stripePrice(target, line?.qty);
        result.stepDown = {
          after,
          price,
          automatic:
            !!p.client_signed_at &&
            !!p.versions.at(-1) &&
            after === line?.schedule?.after_paid_invoices &&
            price.amount === line.schedule.then.amount &&
            price.interval === line.interval &&
            price.intervalCount === 1 &&
            details.prices.length === 1 &&
            details.prices[0].currency.toLowerCase() ===
              p.currency.toLowerCase() &&
            price.currency.toLowerCase() === p.currency.toLowerCase() &&
            priceMatches(details.prices[0], line),
        };
      }
    }
  }
  return result;
}

export function acceptedAdoptedStepDown(
  p: Proposal,
  linked: AdoptedStripeSubscription,
) {
  if (
    !p.client_signed_at ||
    linked.schedule ||
    !linked.stepDown?.automatic ||
    !["active", "trialing"].includes(linked.status)
  )
    return undefined;
  if ((linked.paidInvoices ?? 0) < linked.stepDown.after) return undefined;
  // Use the existing threshold-only schedule writer, without writing ownership metadata.
  const line = acceptedPlan(p, linked.prices);
  return (
    line && {
      ...line,
      plan_terms: { ...line.plan_terms, oiot_paid_step_down: true },
    }
  );
}

export async function linkStripeSubscription(
  repo: Repository,
  p: Proposal,
  actor: Actor,
  input: { revision: number; subscription_id: string },
  api?: StripeRead,
) {
  requireStaff(repo, actor);
  check(api, "Connect Stripe before linking a subscription.", 503);
  check(
    subscriptionId.test(input.subscription_id),
    "Invalid Stripe subscription.",
  );
  check(
    needsStripeLink(p) && p.revision === input.revision,
    "This proposal changed. Refresh before linking.",
    409,
  );
  const blocked = stripeLinkBlocker(p);
  check(!blocked, blocked ?? "", 409);
  const { client, id } = await currentClient(repo, p);
  check(id, "Link this client’s Stripe customer first.", 409);
  await verifyCustomer(api, id, client);
  const sub = await api.get<AdoptionSubscription>(
    `/v1/subscriptions/${input.subscription_id}`,
    { "expand[]": "items.data.price.product" },
  );
  check(
    sub.id === input.subscription_id &&
      sub.customer === id &&
      sub.livemode === false &&
      usableStatuses.has(sub.status),
    "This subscription is not available for this client.",
    409,
  );
  const previous = await repo.byAdoptedStripeSubscription(sub.id);
  const origin = sub.metadata?.proposal_id;
  const createdFor =
    origin && /^[a-f0-9-]{36}$/i.test(origin) ? await repo.get(origin) : null;
  check(
    !previous &&
      (!createdFor ||
        !recordedStripeSubscriptions(stripeLink(createdFor)).includes(sub.id)),
    "This subscription is already linked to a proposal.",
    409,
  );
  const snapshot = await readStripeAdoption(api, p, sub, {
    linkedAt: new Date().toISOString(),
    linkedBy: actor.actor,
  });
  const latest = await currentClient(repo, p);
  check(
    latest.id === id && latest.client.email === client.email,
    "The Stripe customer changed. Reload and try again.",
    409,
  );
  return mutate(repo, p.id, (current) => {
    check(
      current.revision === input.revision && needsStripeLink(current),
      "This proposal changed. Refresh before linking.",
      409,
    );
    const reason = stripeLinkBlocker(current);
    check(!reason, reason ?? "", 409);
    current.billing_links = current.billing_links
      .filter((link) => link.provider !== "stripe")
      .concat({
        provider: "stripe",
        status: "succeeded",
        attempts: stripeLink(current)?.attempts ?? 0,
        external_customer_id: id,
        external_object_id: sub.id,
        metadata: { adopted_subscription: snapshot },
      });
    for (const job of current.jobs)
      if (
        job.kind === "billing" &&
        job.payload.provider === "stripe" &&
        job.status === "failed"
      ) {
        job.status = "done";
        delete job.last_error;
      }
    event(current, "stripe_subscription_linked", actor, {
      subscription_id: sub.id,
      customer_id: id,
    });
  });
}
