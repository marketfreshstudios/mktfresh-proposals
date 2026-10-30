"use client";
import type { BillingLine } from "../lib/model";
import { recurringAmount } from "../lib/billing-display";
import { formatMoney } from "../lib/money";
export function BillingItems({
  lines,
  currency,
  cents,
}: {
  lines: BillingLine[];
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
