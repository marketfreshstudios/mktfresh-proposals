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
  payment_method_type?: "us_bank_account";
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
    ...(c.payment_method_type
      ? { payment_method_type: c.payment_method_type }
      : {}),
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
        `${i.name} | ${formatMoney(i.amount * i.qty, c.currency, cents)}/${i.interval === "month" ? "month" : "year"}`,
    ),
    c.card ? `Card: ${cardLabel(c.card)}` : "",
    details.next_billing_at
      ? `Next billing date: ${readableDate(details.next_billing_at, timezone)}`
      : "",
    c.collection_method === "send_invoice"
      ? c.payment_method_type === "us_bank_account"
        ? "Your bank payment is confirmed. Future invoices will be emailed."
        : "Your card is saved. No charge was taken during card setup. Your first invoice will be emailed."
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
  const banks = bankPayments(link);
  const labels = [
    Object.values(banks).some((p) => p.state === "processing")
      ? "Bank payment processing"
      : "",
    Object.values(banks).some((p) => p.state === "failed")
      ? "Bank payment failed"
      : "",
    link.metadata?.requires_checkout ? "Waiting for checkout" : "",
    completed.some((c) => c.card) ? "Card saved" : "",
    subscriptions.some(
      (s) =>
        ["active", "trialing"].includes(s.status) &&
        !Object.values(banks).some(
          (p) => p.subscription_ids.includes(s.id) && p.state !== "paid",
        ),
    )
      ? "Subscription active"
      : "",
  ].filter(Boolean);
  return {
    labels,
    subscriptions: [...new Map(subscriptions.map((s) => [s.id, s])).values()],
  };
}

export type BankPayment = {
  state: "processing" | "failed" | "paid";
  subscription_ids: string[];
};
export const bankPayments = (link: BillingLink) =>
  (link.metadata?.bank_payments ?? {}) as Record<string, BankPayment>;
export function publicBankState(link: BillingLink) {
  const states = Object.values(bankPayments(link)).map((s) => s.state);
  return states.includes("failed")
    ? ("failed" as const)
    : states.includes("processing")
      ? ("processing" as const)
      : undefined;
}
