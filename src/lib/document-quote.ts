import type { Quote } from "./model";
import { orderedItems, selected, quoteSublines } from "./quote-model";
import { formatMoney, intervalSuffix } from "./money";
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Non-executable print projection of the shared client/editor quote row. */
export function documentQuote(
  quote: Quote,
  currency: string,
  cents: "auto" | "always" = "auto",
) {
  const items = orderedItems(quote),
    units = Array.from(new Set(items.map((i) => i.choice_group_id ?? i.id))),
    fmt = (n: number) => formatMoney(n, currency, cents);
  const row = (i: (typeof items)[number]) =>
    `<div class="flow-quote-line print-pricing-card${selected(i) ? " selected" : ""}"><span aria-hidden="true" class="print-selection"></span><div><div class="flow-line-title"><strong>${esc(i.name)}</strong></div>${i.description ? `<p>${esc(i.description)}</p>` : ""}${i.sublines.map((s) => `<div class="flow-subline"><span>${esc(s.label || (s.interval === "one_time" ? "One-time" : s.interval === "month" ? "Monthly" : "Yearly"))}${s.qty !== 1 ? ` × ${s.qty}` : ""}</span><strong>${fmt(s.amount * s.qty)}${intervalSuffix(s.interval)}</strong></div>`).join("")}${i.schedule ? `<p class="flow-terms">${fmt(i.sublines.find((s) => s.interval !== "one_time")?.amount ?? 0)}/${i.sublines.some((s) => s.interval === "year") ? "year" : "month"} for ${i.schedule.after_paid_invoices} paid invoices, then ${fmt(i.schedule.then.amount)}/${i.sublines.some((s) => s.interval === "year") ? "year" : "month"}.</p>` : ""}${typeof i.plan_terms?.client_copy === "string" && i.plan_terms.client_copy ? `<p class="flow-terms">${esc(i.plan_terms.client_copy)}</p>` : ""}${i.min_term_months ? `<p class="flow-terms">${i.min_term_months}-month minimum commitment.</p>` : ""}<small>${i.optional ? (selected(i) ? "Included" : "Not included") : "Required"}</small></div></div>`;
  const rendered = units.map((id) => {
    const group = items.filter((i) => (i.choice_group_id ?? i.id) === id);
    return group[0].choice_group_id
      ? `<section class="flow-choice-group print-choice-group" data-print-unit="${esc(group[0].id)}"><h3>Choose one</h3>${group.map(row).join("")}</section>`
      : `<section class="print-pricing-unit" data-print-unit="${esc(group[0].id)}">${row(group[0])}</section>`;
  });
  const heading =
    "<h2>Your investment</h2><p>Optional items are your choice. Totals update as you go.</p>";
  return `<section class="print-pricing-table"><section class="print-pricing-intro">${heading}${rendered[0] ?? ""}</section>${rendered.slice(1).join("")}<p class="print-quote-totals" data-print-unit="quote-totals">${esc(quoteTotalText(quote, currency, cents))}</p></section>`;
}
export function quoteTotalText(
  quote: Quote,
  currency: string,
  cents: "auto" | "always" = "auto",
) {
  const lines = quoteSublines(quote),
    sum = (interval: string) =>
      lines
        .filter((l) => l.interval === interval && (!l.optional || l.selected))
        .reduce((n, l) => n + l.amount * l.qty, 0),
    fmt = (n: number) => formatMoney(n, currency, cents);
  return `One-time: ${fmt(sum("one_time"))} · Monthly: ${fmt(sum("month"))}/mo${lines.some((l) => l.interval === "year") ? ` · Yearly: ${fmt(sum("year"))}/yr` : ""}`;
}
export const documentQuoteCss = `.proposal-typography.proposal-typography .flow-quote-line{display:grid;grid-template-columns:20px minmax(0,1fr);align-items:start;gap:12px;padding:12px 12px 12px 52px;margin:8px 0;border:1px solid #d4d8de;border-radius:8px;min-height:64px;font:inherit;box-sizing:border-box}.proposal-typography.proposal-typography .flow-line-title{font:inherit}.proposal-typography.proposal-typography .flow-subline{display:flex;justify-content:space-between;gap:24px;margin:8px 0;font:inherit}.proposal-typography.proposal-typography .flow-quote-line small{font-size:12px;line-height:1.5}.proposal-typography.proposal-typography .flow-choice-group{padding:12px;border:2px solid #8baba0;border-radius:8px;margin:8px 0}.proposal-typography.proposal-typography .flow-choice-group>h3{padding-left:44px}.print-pricing-unit{margin:0!important}.print-selection{width:18px;height:18px;margin:3px 0;border:1px solid #7e8690;border-radius:3px}.print-pricing-card,.print-choice-group{break-inside:avoid}`;
