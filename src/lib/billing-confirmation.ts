import type { BillingLink } from "./model";
import { formatMoney } from "./money";
import { readableDate } from "./validity";
export type BillingCompletion = {
  session_id: string;
  mode: "setup" | "subscription";
  collection_method: "send_invoice" | "charge_automatically";
  completed_at: string;
  currency: string;
  items: {
    id: string;
    name: string;
    amount: number;
    qty: number;
    interval: "month" | "year";
  }[];
  card: { brand: string; last4: string } | null;
  subscriptions: {
    id: string;
    status: string;
    next_billing_at: string | null;
  }[];
};
export const completedCheckouts = (link: BillingLink) =>
  (link.metadata?.completed_checkout ?? []) as BillingCompletion[];
export function publicCompletion(c: BillingCompletion) {
  return {
    checkout_session_id: c.session_id,
    mode: c.mode,
    collection_method: c.collection_method,
    completed_at: c.completed_at,
    currency: c.currency,
    items: c.items,
    card: c.card,
    next_billing_at:
      c.subscriptions
        .map((s) => s.next_billing_at)
        .filter((s): s is string => !!s)
        .sort()[0] ?? null,
  };
}
export function cardLabel(card: { brand: string; last4: string }) {
  const name =
    (
      {
        visa: "Visa",
        mastercard: "Mastercard",
        amex: "American Express",
      } as Record<string, string>
    )[card.brand] ?? card.brand.replace(/^./, (c) => c.toUpperCase());
  return `${name} ending ${card.last4}`;
}
export function billingCompletionText(
  c: BillingCompletion,
  timezone = "UTC",
  cents: "auto" | "always" = "auto",
) {
  const details = publicCompletion(c);
  return [
    "Billing setup completed",
    ...c.items.map(
      (i) =>
        `${i.name} · ${formatMoney(i.amount * i.qty, c.currency, cents)}/${i.interval === "month" ? "month" : "year"}`,
    ),
    c.card ? `Card: ${cardLabel(c.card)}` : "",
    details.next_billing_at
      ? `Next billing date: ${readableDate(details.next_billing_at, timezone)}`
      : "",
    c.collection_method === "send_invoice"
      ? "Your card is saved. No charge was taken during card setup. Your first invoice will be emailed."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function stripeBillingStatus(link: BillingLink) {
  const completed = completedCheckouts(link);
  const subscriptions = [
    ...completed.flatMap((c) => c.subscriptions),
    ...((link.metadata?.added_existing ?? []) as { id: string }[]).map((s) => ({
      id: s.id,
      status: "active",
    })),
  ].filter((s) => /^sub_[\w]+$/.test(s.id));
  const labels = [
    link.metadata?.requires_checkout ? "Waiting for checkout" : "",
    completed.some((c) => c.card) ? "Card saved" : "",
    subscriptions.some((s) => ["active", "trialing"].includes(s.status))
      ? "Subscription active"
      : "",
  ].filter(Boolean);
  return {
    labels,
    subscriptions: [...new Map(subscriptions.map((s) => [s.id, s])).values()],
  };
}
