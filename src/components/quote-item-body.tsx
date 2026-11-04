"use client";
import { sublineLabel } from "../lib/subline-label";
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
    <div className="quote-item-body" data-included={active}>
      <div className="flow-line-title">
        <strong>{item.name}</strong>
        {item.sublines.length === 1 && (
          <strong className="amount">
            {formatMoney(
              item.sublines[0].amount * item.sublines[0].qty,
              currency,
              cents,
            )}
            {intervalSuffix(item.sublines[0].interval)}
          </strong>
        )}
      </div>
      {item.description && (
        <p className="quote-description">{item.description}</p>
      )}
      {item.sublines.length > 1 &&
        item.sublines.map((s) => (
          <div className="flow-subline" key={s.id}>
            <span>
              {sublineLabel(s)}
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
    </div>
  );
}
