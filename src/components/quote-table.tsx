"use client";
import type { Quote, QuoteItem } from "../lib/model";
import { quoteTableGroups, quoteTableColumns } from "../lib/quote-table";
import { selected } from "../lib/quote-model";
export function QuoteTable({
  quote,
  currency,
  cents,
  onToggle,
  disabled = false,
  defaults = false,
}: {
  quote: Quote;
  currency: string;
  cents?: "auto" | "always";
  onToggle?: (id: string, value: boolean) => void;
  disabled?: boolean;
  defaults?: boolean;
}) {
  const control = (item: QuoteItem) =>
    item.optional ? (
      <label className="quote-table-hit">
        <input
          type={item.choice_group_id ? "radio" : "checkbox"}
          name={`${defaults ? "document-" : ""}${item.choice_group_id ?? item.id}`}
          aria-label={`${defaults ? "Default selection for " : ""}${item.name} · ${selected(item) ? "included" : "not included"}`}
          checked={selected(item)}
          disabled={disabled}
          onChange={(e) => onToggle?.(item.id, e.target.checked)}
        />
      </label>
    ) : (
      <span
        className="quote-required"
        role="img"
        aria-label="Required"
        title="Required"
      />
    );
  return (
    <table className="quote-table" aria-label="Your investment">
      <colgroup>
        {["item", "description", "qty", "price", "total"].map((c) => (
          <col key={c} className={`quote-col-${c}`} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {quoteTableColumns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      {quoteTableGroups(quote, currency, cents).map((g) => (
        <tbody key={g.id} data-quote-choice-group={g.choice ? g.id : undefined}>
          {g.rows.map((r, n) => (
            <tr
              key={r.item.id}
              className="print-pricing-card quote-table-row"
              data-print-unit={r.item.id}
            >
              <th scope="row">
                {g.choice && n === 0 && (
                  <span className="quote-table-choice">Choose one</span>
                )}
                <span className="quote-table-item">
                  <span className="quote-control-slot">{control(r.item)}</span>
                  <strong>{r.item.name}</strong>
                </span>
              </th>
              <td>
                {r.item.description && <p>{r.item.description}</p>}
                {r.entries.length > 1 &&
                  r.entries.map((e, n) => (
                    <div key={n} className="quote-table-entry">
                      {e.label}
                    </div>
                  ))}
                {r.terms.map((t, n) => (
                  <p key={n} className="flow-terms">
                    {t}
                  </p>
                ))}
              </td>
              {(["qty", "price", "total"] as const).map((k) => (
                <td key={k} className="quote-table-numeric">
                  {r.entries.map((e, n) => (
                    <div key={n} className="quote-table-entry">
                      {e[k]}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
