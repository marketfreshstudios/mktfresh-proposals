import type { Quote, QuoteItem } from "./model";
import { orderedItems, selected } from "./quote-model";
import { formatMoney, intervalSuffix } from "./money";
import { sublineLabel } from "./subline-label";
import { escape } from "./presentation";

/** Resolve once against the whole quote, before any page split. */
export function quoteTableColumns(quote: Quote) {
  const description = quote.some((item) => item.description.trim().length > 0);
  return [
    { key: "item", label: "Item", width: description ? 24 : 53 },
    ...(description
      ? [{ key: "description", label: "Description", width: 29 }]
      : []),
    { key: "qty", label: "Qty", width: 7 },
    { key: "price", label: "Price", width: 20 },
    { key: "total", label: "Total", width: 20 },
  ];
}
/** One item remains one row. Unlike intervals are never added together. */
export function quoteTableGroups(
  quote: Quote,
  currency: string,
  cents: "auto" | "always" = "auto",
) {
  const items = orderedItems(quote),
    money = (n: number) => formatMoney(n, currency, cents);
  return Array.from(new Set(items.map((i) => i.choice_group_id ?? i.id))).map(
    (id) => ({
      id,
      choice: !!items.find((i) => i.id === id || i.choice_group_id === id)
        ?.choice_group_id,
      rows: items
        .filter((i) => (i.choice_group_id ?? i.id) === id)
        .map((item) => ({
          item,
          entries: item.sublines.map((s) => ({
            label: sublineLabel(s),
            qty: String(s.qty),
            price: money(s.amount) + intervalSuffix(s.interval),
            total: money(s.amount * s.qty) + intervalSuffix(s.interval),
          })),
          terms: [
            ...(item.schedule
              ? [
                  `${money(item.sublines.find((s) => s.interval !== "one_time")?.amount ?? 0)}/${item.sublines.some((s) => s.interval === "year") ? "year" : "month"} for ${item.schedule.after_paid_invoices} paid invoices, then ${money(item.schedule.then.amount)}/${item.sublines.some((s) => s.interval === "year") ? "year" : "month"}.`,
                ]
              : []),
            ...(typeof item.plan_terms?.client_copy === "string" &&
            item.plan_terms.client_copy
              ? [item.plan_terms.client_copy]
              : []),
            ...(item.min_term_months
              ? [`${item.min_term_months}-month minimum commitment.`]
              : []),
          ],
        })),
    }),
  );
}
export function quoteTableControl(i: QuoteItem) {
  const active = selected(i);
  return i.optional
    ? `<span class="print-selection${i.choice_group_id ? " print-radio" : ""}" role="img" aria-label="${active ? "included" : "not included"}" data-checked="${active}">${active ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="3"/></svg>' : ""}</span>`
    : '<span class="quote-required" role="img" aria-label="Required" title="Required"></span>';
}
export function quoteTableHtml(
  quote: Quote,
  currency: string,
  cents: "auto" | "always" = "auto",
) {
  const columns = quoteTableColumns(quote),
    description = columns.some((c) => c.key === "description");
  const details = (
    r: ReturnType<typeof quoteTableGroups>[number]["rows"][number],
  ) =>
    `${r.item.description.trim() ? `<p>${escape(r.item.description)}</p>` : ""}${r.entries.length > 1 ? r.entries.map((e) => `<div class="quote-table-entry">${escape(e.label)}</div>`).join("") : ""}${r.terms.map((t) => `<p class="flow-terms">${escape(t)}</p>`).join("")}`;
  return `<table class="quote-table" role="table" aria-label="Your investment" data-description-column="${description}"><colgroup>${columns.map((c) => `<col class="quote-col-${c.key}" style="width:${c.width}%">`).join("")}</colgroup><thead role="rowgroup"><tr role="row">${columns.map((c) => `<th role="columnheader" scope="col">${c.label}</th>`).join("")}</tr></thead>${quoteTableGroups(
    quote,
    currency,
    cents,
  )
    .map(
      (g) =>
        `<tbody role="rowgroup"${g.choice ? ` data-quote-choice-group="${escape(g.id)}"` : ""}>${g.rows.map((r, n) => `<tr role="row" class="print-pricing-card quote-table-row" data-print-unit="${escape(r.item.id)}"><th role="rowheader" scope="row">${g.choice && n === 0 ? '<span class="quote-table-choice">Choose one</span>' : ""}<span class="quote-table-item"><span class="quote-control-slot">${quoteTableControl(r.item)}</span><strong>${escape(r.item.name)}</strong></span>${!description ? `<div class="quote-table-details">${details(r)}</div>` : ""}</th>${description ? `<td role="cell" class="quote-table-description">${details(r)}</td>` : ""}${(["qty", "price", "total"] as const).map((k) => `<td role="cell" class="quote-table-numeric">${r.entries.map((e) => `<div class="quote-table-entry"><span class="quote-table-mobile-label" aria-hidden="true">${columns.find((c) => c.key === k)!.label} </span>${escape(e[k])}</div>`).join("")}</td>`).join("")}</tr>`).join("")}</tbody>`,
    )
    .join("")}</table>`;
}
/** Deliberately opt-in: legacy Cards CSS/HTML remains byte-for-byte unchanged. */
export const quoteTableCss = `
.proposal-typography.proposal-typography .quote-table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;margin:8px 0;font:inherit;line-height:1.5;color:inherit}
.proposal-typography.proposal-typography .print-pricing-table>.quote-table:first-child{margin-top:0}
.quote-table-mobile-label{display:none}.quote-table-details{font-weight:400;margin-top:4px}.quote-table-details:empty{display:none}
.proposal-typography.proposal-typography .quote-table th,.proposal-typography.proposal-typography .quote-table td{padding:12px 6px;border:0;border-bottom:1px solid #ECE8E1;text-align:left;vertical-align:top;overflow-wrap:anywhere;font:inherit;line-height:1.5;background:transparent;text-transform:none;letter-spacing:normal}
.proposal-typography.proposal-typography .quote-table thead th,.proposal-typography.proposal-typography .quote-table .quote-table-repeat th{font-size:12px;font-weight:600;background:#F6F4EF;color:#5F5B53;padding:8px 6px}
.proposal-typography.proposal-typography .quote-table p{font:inherit;color:inherit;margin:0 0 4px}.quote-table .flow-terms{font-size:.85em!important;color:#5F5B53!important}
.quote-table-item{display:flex;align-items:flex-start;gap:8px}.quote-table-item strong{font-weight:600}.quote-table .quote-control-slot{position:relative;display:inline-flex;flex:none;width:20px;height:20px;margin-top:2px}
.quote-table .quote-control-slot input{position:relative;appearance:none;width:20px;height:20px;min-height:20px;border:2px solid #8A857B;border-radius:6px;background:white;margin:0;padding:0;flex:none}
.quote-table .quote-control-slot input:checked{background:#365c4a;border-color:#365c4a;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m5 12 4 4L19 6' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E");background-size:16px;background-position:center}
.quote-table .quote-control-slot input[type=radio]{border-radius:50%}.quote-table .quote-control-slot input[type=radio]:checked{background:white;background-image:radial-gradient(circle,#365c4a 0 5px,transparent 5.5px)}
.quote-table .quote-table-hit{display:inline-flex;position:absolute;left:-12px;top:-12px;width:44px;height:44px;align-items:center;justify-content:center;cursor:pointer}.quote-table input:focus-visible{outline:2px solid #13303A;outline-offset:4px}
.quote-table .quote-table-numeric{font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal!important}.quote-table-entry{min-height:1.5em}.quote-table-choice{display:block;font-size:11px;font-weight:600;color:#365c4a;margin-bottom:8px}.quote-table tr{break-inside:avoid}.quote-table tbody{break-inside:auto}.quote-table .quote-table-gap td{padding:0!important;border:0!important;line-height:0!important}
@media screen and (max-width:699px){
.client-flow .flow-document .quote-table{display:block;position:relative}
.client-flow .flow-document .quote-table colgroup{display:none}
.client-flow .flow-document .quote-table thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.client-flow .flow-document .quote-table tbody{display:block}
.client-flow .flow-document .quote-table tr{display:grid;grid-template-columns:minmax(0,.65fr) repeat(2,minmax(0,1fr));column-gap:8px;padding:16px 0;border-bottom:1px solid #ECE8E1}
.client-flow .flow-document.proposal-typography.proposal-typography .quote-table :is(th,td,p,strong,.quote-table-details){word-break:normal;overflow-wrap:break-word;hyphens:none}
.client-flow .flow-document.proposal-typography.proposal-typography .quote-table :is(th,td){border:0;padding:0!important;min-width:0}
.client-flow .flow-document .quote-table th[scope=row],.client-flow .flow-document .quote-table .quote-table-description{grid-column:1/-1}
.client-flow .flow-document .quote-table .quote-table-description{margin-top:8px}
.client-flow .flow-document .quote-table .quote-table-numeric{position:relative;margin-top:10px}
.client-flow .flow-document .quote-table .quote-table-numeric+.quote-table-numeric .quote-table-entry::before{content:"·";position:absolute;left:-7px;color:#5F5B53}
.client-flow .flow-document .quote-table .quote-table-item{align-items:baseline}.client-flow .flow-document .quote-table .quote-table-item strong{min-width:0}
.client-flow .flow-document .quote-table .quote-table-mobile-label{display:inline;font-size:12px;color:#5F5B53}
.client-flow .flow-document .quote-table .quote-table-hit{align-items:center}
}
`;
