import { bankPayments, completedCheckouts } from "./billing-confirmation";
import type { BillingLink, Proposal } from "./model";
import { quoteSublines } from "./quote-model";

export type StripeLinkedPrice = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  interval: string;
  intervalCount: number;
  quantity: number;
  lookupKey: string | null;
};
export type StripeSubscriptionChoice = {
  id: string;
  status: string;
  prices: StripeLinkedPrice[];
  nextBillingAt: string | null;
};
export type AdoptedStripeSubscription = StripeSubscriptionChoice & {
  customerId: string;
  accountId: string | null;
  linkedAt: string;
  linkedBy: string;
  paidInvoices?: number;
  schedule?: {
    id: string;
    phases: {
      startsAt: string | null;
      endsAt: string | null;
      prices: StripeLinkedPrice[];
    }[];
  };
  stepDown?: { after: number; price: StripeLinkedPrice; automatic: boolean };
};
export type StripeSubscriptionOptions = {
  choices: StripeSubscriptionChoice[];
  notice?: string;
  clientId: string;
};

export const stripeLink = (p: Proposal) =>
  p.billing_links.find((link) => link.provider === "stripe");
export const adoptedStripeSubscription = (link?: BillingLink) =>
  link?.metadata?.adopted_subscription as AdoptedStripeSubscription | undefined;

export function recordedStripeSubscriptions(link?: BillingLink) {
  if (!link) return [];
  return [
    link.external_object_id,
    ...completedCheckouts(link).flatMap((checkout) =>
      checkout.subscriptions.map((s) => s.id),
    ),
    ...Object.values(bankPayments(link)).flatMap(
      (payment) => payment.subscription_ids,
    ),
    ...((link.metadata?.added_existing ?? []) as { id: string }[]).map(
      (s) => s.id,
    ),
  ].filter((id): id is string => !!id && /^sub_[A-Za-z0-9]+$/.test(id));
}

// Existing-subscription item additions are associations, but not creations.
export function ownsCreatedStripeSubscription(link: BillingLink, id: string) {
  if (adoptedStripeSubscription(link)) return false;
  const added = (link.metadata?.added_existing ?? []) as { id: string }[];
  return (
    !added.some((s) => s.id === id) &&
    recordedStripeSubscriptions(link).includes(id)
  );
}

export function needsStripeLink(p: Proposal) {
  return (
    p.source === "native" &&
    !p.archived_at &&
    (p.status === "signed_by_client" || p.status === "completed") &&
    quoteSublines(p.versions.at(-1)?.quote ?? p.quote, true).some(
      (line) => line.interval !== "one_time" && line.amount > 0 && line.qty > 0,
    ) &&
    !recordedStripeSubscriptions(stripeLink(p)).length
  );
}

export function stripeLinkBlocker(p: Proposal) {
  const link = stripeLink(p);
  if (
    link?.metadata?.requires_checkout ||
    (Array.isArray(link?.metadata?.checkout) && link.metadata.checkout.length)
  )
    return "An existing Stripe Checkout is open. Finish that billing setup before linking a subscription.";
  if (
    p.jobs.some(
      (job) =>
        job.kind === "billing" &&
        ["pending", "running"].includes(job.status) &&
        job.payload.provider !== "qbo",
    )
  )
    return "Automatic billing is in progress. Wait for it to finish before linking a subscription.";
}
