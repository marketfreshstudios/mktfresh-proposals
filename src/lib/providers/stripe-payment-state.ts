import { check } from "../model";
import type { StripeTransport } from "../catalog";

export type BankPaymentState = "processing" | "failed" | "paid";
// Always inspect current Stripe state, never trust the arrival order of webhook snapshots.
export async function bankPaymentState(
  api: StripeTransport,
  subscriptions: any[],
  customer: string,
): Promise<BankPaymentState> {
  const states = await Promise.all(
    subscriptions.map(async (sub) => {
      if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status))
        return "failed";
      const id =
        typeof sub.latest_invoice === "string"
          ? sub.latest_invoice
          : sub.latest_invoice?.id;
      if (!id) return "processing";
      const invoice = await api.get<any>(`/v1/invoices/${id}`, {
        "expand[]": "payment_intent",
      });
      check(
        invoice.id === id &&
          invoice.livemode === false &&
          invoice.customer === customer &&
          (typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id) === sub.id,
        "Test invoice subscription/customer mismatch",
      );
      if (invoice.status === "paid" && invoice.paid === true) return "paid";
      let intent = invoice.payment_intent;
      if (typeof intent === "string")
        intent = await api.get<any>(`/v1/payment_intents/${intent}`, {});
      if (intent)
        check(
          intent.livemode === false && intent.customer === customer,
          "Test debit customer mismatch",
        );
      if (
        ["void", "uncollectible"].includes(invoice.status) ||
        (intent &&
          (intent.status === "canceled" ||
            (intent.status === "requires_payment_method" &&
              intent.last_payment_error)))
      )
        return "failed";
      return "processing";
    }),
  );
  return states.includes("failed")
    ? "failed"
    : states.every((s) => s === "paid")
      ? "paid"
      : "processing";
}
