"use client";
import {
  publicCompletion,
  cardLabel,
  stripeBillingStatus,
} from "../lib/billing-confirmation";
import { readableDate } from "../lib/validity";
import type { BillingLink } from "../lib/model";
import type { BillingLine } from "../lib/model";
import type { BillingGroup } from "../lib/billing-display";
import { recurringAmount } from "../lib/billing-display";
import { formatMoney } from "../lib/money";
export function BillingItems({
  lines,
  currency,
  cents,
}: {
  lines: Pick<BillingLine, "id" | "name" | "amount" | "qty" | "interval">[];
  currency: string;
  cents?: "auto" | "always";
}) {
  return (
    <ul className="flow-billing-items">
      {lines.map((l) => (
        <li key={l.id}>
          <span>{l.name}</span>
          <strong>
            {formatMoney(l.amount * l.qty, currency, cents)}
            {l.interval === "month"
              ? "/month"
              : l.interval === "year"
                ? "/year"
                : ""}
          </strong>
        </li>
      ))}
    </ul>
  );
}
export function BillingRecurringTotal({
  lines,
  currency,
  cents,
  added = false,
  setup = false,
}: {
  lines: BillingLine[];
  currency: string;
  cents?: "auto" | "always";
  added?: boolean;
  setup?: boolean;
}) {
  return (
    <dl className="flow-billing-totals">
      {(["month", "year"] as const)
        .filter((interval) => lines.some((l) => l.interval === interval))
        .map((interval) => (
          <div key={interval}>
            <dt>
              {interval === "month"
                ? added
                  ? "Monthly amount added"
                  : setup
                    ? "Monthly subscription rate"
                    : "Monthly total today"
                : added
                  ? "Yearly amount added"
                  : setup
                    ? "Yearly subscription rate"
                    : "Yearly total"}
            </dt>
            <dd>
              {formatMoney(recurringAmount(lines, interval), currency, cents)}/
              {interval === "month" ? "month" : "year"}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function checkoutAmount(
  lines: BillingLine[],
  currency: string,
  cents?: "auto" | "always",
) {
  return (["month", "year"] as const)
    .filter((interval) => lines.some((l) => l.interval === interval))
    .map(
      (interval) =>
        `${formatMoney(recurringAmount(lines, interval), currency, cents)}/${interval === "month" ? "month" : "year"}`,
    )
    .join(" + ");
}

export function BillingConfirmationCard({
  confirmations,
  timezone,
  cents,
}: {
  confirmations: ReturnType<typeof publicCompletion>[];
  timezone: string;
  cents?: "auto" | "always";
}) {
  return (
    <section
      className="flow-billing-confirmation stack"
      aria-label="Confirmed billing setup"
    >
      <h2>Billing setup complete</h2>
      {confirmations.map((c, index) => (
        <div className="stack" key={index}>
          <BillingItems lines={c.items} currency={c.currency} cents={cents} />
          {c.card && <p>{cardLabel(c.card)}</p>}
          {c.next_billing_at && (
            <p>
              Next billing date: {readableDate(c.next_billing_at, timezone)}
            </p>
          )}
          {c.collection_method === "send_invoice" && (
            <p>Your card is saved. Your first invoice will be emailed.</p>
          )}
        </div>
      ))}
    </section>
  );
}
export function StripeBillingDetails({ link }: { link: BillingLink }) {
  const status = stripeBillingStatus(link);
  return (
    <div className="stack stripe-billing-details">
      {status.labels.slice(1).map((label) => (
        <span className="pill success" key={label}>
          {label}
        </span>
      ))}
      {status.subscriptions.map((s) => (
        <a
          key={s.id}
          href={`https://dashboard.stripe.com/test/subscriptions/${encodeURIComponent(s.id)}`}
          target="_blank"
          rel="noreferrer"
        >
          {s.id}
          <span className="sr-only">
            {" "}
            · Open subscription in Stripe test dashboard
          </span>
        </a>
      ))}
    </div>
  );
}

export function checkoutActionLabel(
  session: BillingGroup & { lines: BillingLine[] },
  currency: string,
  cents?: "auto" | "always",
  collection?: string,
) {
  return session.mode === "setup"
    ? `Continue to secure card setup${(session.collection_method ?? collection) === "send_invoice" ? " — no charge today" : ""}`
    : `Continue to secure checkout — ${checkoutAmount(session.lines, currency, cents)}`;
}
