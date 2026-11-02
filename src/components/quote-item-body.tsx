"use client";
import type { QuoteItem } from "../lib/model";
import { formatMoney, intervalSuffix, type CentsMode } from "../lib/money";
/** Shared row content keeps authoring and client reading geometry identical. */
export function QuoteItemBody({
  item,
  active,
  currency,
  cents = "auto",
}: {
  item: QuoteItem;
  active: boolean;
  currency: string;
  cents?: CentsMode;
}) {
  return (
    <div>
      <div className="flow-line-title">
        <strong>{item.name}</strong>
      </div>
      {item.description && <p>{item.description}</p>}
      {item.sublines.map((s) => (
        <div className="flow-subline" key={s.id}>
          <span>
            {s.label ||
              (s.interval === "one_time"
                ? "One-time"
                : s.interval === "month"
                  ? "Monthly"
                  : "Yearly")}
            {s.qty !== 1 && ` × ${s.qty}`}
          </span>
          <strong>
            {formatMoney(s.amount * s.qty, currency, cents)}
            {intervalSuffix(s.interval)}
          </strong>
        </div>
      ))}
      {item.schedule && (
        <p className="flow-terms">
          {formatMoney(
            item.sublines.find((s) => s.interval !== "one_time")?.amount ?? 0,
            currency,
            cents,
          )}
          /{item.sublines.some((s) => s.interval === "year") ? "year" : "month"}{" "}
          for {item.schedule.after_paid_invoices} paid invoices, then{" "}
          {formatMoney(item.schedule.then.amount, currency, cents)}/
          {item.sublines.some((s) => s.interval === "year") ? "year" : "month"}.
        </p>
      )}
      {typeof item.plan_terms?.client_copy === "string" &&
        item.plan_terms.client_copy && (
          <p className="flow-terms">{item.plan_terms.client_copy}</p>
        )}
      {item.min_term_months && (
        <p className="flow-terms">
          {item.min_term_months}-month minimum commitment.
        </p>
      )}
      <small>
        {item.optional ? (active ? "Included" : "Not included") : "Required"}
      </small>
    </div>
  );
}
