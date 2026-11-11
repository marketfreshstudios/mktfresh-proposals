"use client";
import type { Quote, QuoteItem } from "../lib/model";
import { quoteTableGroups, quoteTableColumns } from "../lib/quote-table";
import { choiceRequired } from "../lib/quote-options";
import { selected } from "../lib/quote-model";
export function QuoteTable({
  quote,
  currency,
  cents,
  onToggle,
  disabled = false,
  defaults = false,
  clientReading = false,
}: {
  quote: Quote;
  currency: string;
  cents?: "auto" | "always";
  onToggle?: (id: string, value: boolean) => void;
  disabled?: boolean;
  defaults?: boolean;
  clientReading?: boolean;
}) {
  const columns = quoteTableColumns(quote),
    description = columns.some((c) => c.key === "description");
  const details = (
    r: ReturnType<typeof quoteTableGroups>[number]["rows"][number],
  ) => (
    <>
      {r.item.description.trim() && <p>{r.item.description}</p>}
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
    </>
  );
  const control = (item: QuoteItem) =>
    item.optional ? (
      <label className="quote-table-hit">
        <input
          type={item.choice_group_id ? "radio" : "checkbox"}
          name={`${defaults ? "document-" : ""}${item.choice_group_id ?? item.id}`}
          aria-label={`${defaults ? "Default selection for " : ""}${item.name}${clientReading ? " | " : " · "}${selected(item) ? "included" : "not included"}`}
          checked={selected(item)}
          aria-description={
            !defaults && item.choice_group_id && !choiceRequired(item)
              ? "Activate the selected option again to clear it."
              : undefined
          }
          onClick={(event) => {
            if (
              !defaults &&
              selected(item) &&
              item.choice_group_id &&
              !choiceRequired(item)
            ) {
              event.preventDefault();
              onToggle?.(item.id, false);
            }
          }}
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
    <table
      className="quote-table"
      role="table"
      aria-label="Your investment"
      data-description-column={description}
    >
      <colgroup>
        {columns.map((c) => (
          <col
            key={c.key}
            className={`quote-col-${c.key}`}
            style={{ width: `${c.width}%` }}
          />
        ))}
      </colgroup>
      <thead role="rowgroup">
        <tr role="row">
          {columns.map((c) => (
            <th key={c.key} scope="col" role="columnheader">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      {quoteTableGroups(quote, currency, cents).map((g) => (
        <tbody
          role="rowgroup"
          key={g.id}
          data-quote-choice-group={g.choice ? g.id : undefined}
        >
          {g.rows.map((r, n) => (
            <tr
              key={r.item.id}
              role="row"
              className="print-pricing-card quote-table-row"
              data-print-unit={r.item.id}
              data-client-question-id={clientReading ? r.item.id : undefined}
            >
              <th scope="row" role="rowheader">
                {g.choice && n === 0 && (
                  <span className="quote-table-choice">
                    {choiceRequired(r.item) ? "Choose one" : "Choose up to one"}
                  </span>
                )}
                <span className="quote-table-item">
                  <span className="quote-control-slot">{control(r.item)}</span>
                  <strong>{r.item.name}</strong>
                </span>
                {!description && (
                  <div className="quote-table-details">{details(r)}</div>
                )}
              </th>
              {description && (
                <td role="cell" className="quote-table-description">
                  {details(r)}
                </td>
              )}
              {(["qty", "price", "total"] as const).map((k) => (
                <td key={k} role="cell" className="quote-table-numeric">
                  {r.entries.map((e, n) => (
                    <div key={n} className="quote-table-entry">
                      <span
                        className="quote-table-mobile-label"
                        aria-hidden="true"
                      >
                        {columns.find((c) => c.key === k)!.label}{" "}
                      </span>
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
