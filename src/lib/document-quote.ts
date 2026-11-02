import type { Quote } from "./model";
import { orderedItems, selected, quoteSublines } from "./quote-model";
import { formatMoney, intervalSuffix } from "./money";
import icons from "../components/icons.json" with { type: "json" };
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
  const row = (i: (typeof items)[number]) => {
    const active = selected(i),
      status = i.optional ? (active ? "included" : "not included") : "Required";
    const control = i.optional
      ? `<span class="print-selection${i.choice_group_id ? " print-radio" : ""}" role="img" aria-label="${status}" data-checked="${active}">${active ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="3"/></svg>' : ""}</span>`
      : `<span class="quote-required" role="img" aria-label="Required" title="Required"><svg viewBox="${icons.lock.viewBox}" width="18" height="18" fill="currentColor"><path d="${icons.lock.path}"/></svg></span>`;
    const price = (s: (typeof i.sublines)[number]) =>
      `${fmt(s.amount * s.qty)}${intervalSuffix(s.interval)}`;
    return `<div class="flow-quote-line print-pricing-card${active ? " selected" : ""}">${control}<div class="quote-item-body"><div class="flow-line-title"><strong>${esc(i.name)}</strong>${i.sublines.length === 1 ? `<strong class="amount">${price(i.sublines[0])}</strong>` : ""}</div>${i.description ? `<p class="quote-description">${esc(i.description)}</p>` : ""}${i.sublines.length > 1 ? i.sublines.map((s) => `<div class="flow-subline"><span>${esc(s.label || (s.interval === "one_time" ? "Setup fee" : s.interval === "month" ? "Subscription" : "Annual subscription"))}${s.qty !== 1 ? ` × ${s.qty}` : ""}</span><strong>${price(s)}</strong></div>`).join("") : ""}${i.schedule ? `<p class="flow-terms">${fmt(i.sublines.find((s) => s.interval !== "one_time")?.amount ?? 0)}/${i.sublines.some((s) => s.interval === "year") ? "year" : "month"} for ${i.schedule.after_paid_invoices} paid invoices, then ${fmt(i.schedule.then.amount)}/${i.sublines.some((s) => s.interval === "year") ? "year" : "month"}.</p>` : ""}${typeof i.plan_terms?.client_copy === "string" && i.plan_terms.client_copy ? `<p class="flow-terms">${esc(i.plan_terms.client_copy)}</p>` : ""}${i.min_term_months ? `<p class="flow-terms">${i.min_term_months}-month minimum commitment.</p>` : ""}</div></div>`;
  };
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
export const documentQuoteCss = `.proposal-typography.proposal-typography .flow-quote-line{display:grid;grid-template-columns:20px minmax(0,1fr);align-items:start;gap:12px;padding:12px 12px 12px 52px;margin:0;border:1px solid #d4d8de;border-radius:8px;min-height:48px;font:inherit;box-sizing:border-box;background:white}.proposal-typography.proposal-typography .flow-quote-line.selected{border-color:var(--quote-accent,#365c4a);background:color-mix(in srgb,var(--quote-accent,#365c4a) 5%,white)}.proposal-typography.proposal-typography .flow-line-title{display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;gap:12px;font:inherit}.proposal-typography.proposal-typography .flow-line-title .amount{white-space:nowrap;flex:none}.proposal-typography.proposal-typography .flow-subline{display:flex;justify-content:space-between;gap:24px;margin:4px 0 0;padding-left:12px;font:inherit}.proposal-typography.proposal-typography .flow-quote-line .quote-description,.proposal-typography.proposal-typography .flow-quote-line .flow-terms{font-size:.85em;line-height:1.5;color:#6b6963;margin:4px 0 0}.proposal-typography.proposal-typography .flow-choice-group{padding:12px;border:2px solid #8baba0;border-radius:8px;margin:0}.proposal-typography.proposal-typography .flow-choice-group>h3{padding-left:44px}.proposal-typography.proposal-typography .flow-choice-group>.flow-quote-line,.proposal-typography.proposal-typography .flow-choice-group>.quote-sortable{margin-top:8px}.proposal-typography.proposal-typography .flow-quote{display:grid;gap:8px}.proposal-typography.proposal-typography .document-quote{display:block}.proposal-typography.proposal-typography .document-quote>.quote-sortable+.quote-sortable{margin-top:8px}.print-pricing-table>section+section,.print-pricing-intro>.print-pricing-unit,.print-pricing-intro>.print-choice-group{margin-top:8px}.print-selection{display:inline-flex;width:18px;height:18px;margin:3px 0;border:1px solid #7e8690;border-radius:3px;align-items:center;justify-content:center}.print-selection svg{width:16px;height:16px}.print-selection[data-checked=true]{background:var(--quote-accent,#365c4a);color:white}.print-radio{border-radius:50%}.quote-required{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;margin-top:3px;color:#6b6963}.print-pricing-card,.print-choice-group{break-inside:avoid}`;
