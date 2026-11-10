import { quoteTableHtml } from "./quote-table";
import { sublineLabel } from "./subline-label";
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
  layout: "cards" | "table" = "cards",
) {
  if (layout === "table")
    return `<section class="print-pricing-table"><h2>Your investment</h2><p>Optional items are your choice. Totals update as you go.</p>${quoteTableHtml(quote, currency, cents)}${documentTotalsHtml(quote, currency, cents)}</section>`;
  const items = orderedItems(quote),
    units = Array.from(new Set(items.map((i) => i.choice_group_id ?? i.id))),
    fmt = (n: number) => formatMoney(n, currency, cents);
  const row = (i: (typeof items)[number]) => {
    const active = selected(i),
      status = i.optional ? (active ? "included" : "not included") : "Required";
    const control = i.optional
      ? `<span class="print-selection${i.choice_group_id ? " print-radio" : ""}" role="img" aria-label="${status}" data-checked="${active}">${active ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="3"/></svg>' : ""}</span>`
      : `<span class="quote-required" role="img" aria-label="Required" title="Required"></span>`;
    const price = (s: (typeof i.sublines)[number]) =>
      `${fmt(s.amount * s.qty)}${intervalSuffix(s.interval)}`;
    return `<div class="flow-quote-line print-pricing-card${active ? " selected" : ""}"><span class="quote-control-slot">${control}</span><div class="quote-item-body"><div class="flow-line-title"><strong>${esc(i.name)}</strong>${i.sublines.length === 1 ? `<strong class="amount">${price(i.sublines[0])}</strong>` : ""}</div>${i.description ? `<p class="quote-description">${esc(i.description)}</p>` : ""}${i.sublines.length > 1 ? i.sublines.map((s) => `<div class="flow-subline"><span>${esc(sublineLabel(s))}${s.qty !== 1 ? ` × ${s.qty}` : ""}</span><strong>${price(s)}</strong></div>`).join("") : ""}${i.schedule ? `<p class="flow-terms">${fmt(i.sublines.find((s) => s.interval !== "one_time")?.amount ?? 0)}/${i.sublines.some((s) => s.interval === "year") ? "year" : "month"} for ${i.schedule.after_paid_invoices} paid invoices, then ${fmt(i.schedule.then.amount)}/${i.sublines.some((s) => s.interval === "year") ? "year" : "month"}.</p>` : ""}${typeof i.plan_terms?.client_copy === "string" && i.plan_terms.client_copy ? `<p class="flow-terms">${esc(i.plan_terms.client_copy)}</p>` : ""}${i.min_term_months ? `<p class="flow-terms">${i.min_term_months}-month minimum commitment.</p>` : ""}</div></div>`;
  };
  const rendered = units.map((id) => {
    const group = items.filter((i) => (i.choice_group_id ?? i.id) === id);
    return group[0].choice_group_id
      ? `<section class="flow-choice-group print-choice-group" data-print-unit="${esc(group[0].id)}"><h3>Choose one</h3>${group.map(row).join("")}</section>`
      : `<section class="print-pricing-unit" data-print-unit="${esc(group[0].id)}">${row(group[0])}</section>`;
  });
  const heading =
    "<h2>Your investment</h2><p>Optional items are your choice. Totals update as you go.</p>";
  return `<section class="print-pricing-table"><section class="print-pricing-intro">${heading}${rendered[0] ?? ""}</section>${rendered.slice(1).join("")}${documentTotalsHtml(quote, currency, cents)}</section>`;
}
export function quoteTotalValues(quote: Quote) {
  const lines = quoteSublines(quote);
  const sum = (interval: string) =>
    lines
      .filter((l) => l.interval === interval && (!l.optional || l.selected))
      .reduce((n, l) => n + l.amount * l.qty, 0);
  return {
    oneTime: sum("one_time"),
    monthly: sum("month"),
    yearly: lines.some((l) => l.interval === "year") ? sum("year") : undefined,
  };
}
export function documentTotalsHtml(
  quote: Quote,
  currency: string,
  cents: "auto" | "always" = "auto",
) {
  const v = quoteTotalValues(quote);
  return `<div class="document-totals print-quote-totals" aria-label="Proposal totals" data-print-unit="quote-totals">${([["One-time", v.oneTime, ""], ["Monthly", v.monthly, "/mo"], ...(v.yearly === undefined ? [] : [["Yearly", v.yearly, "/yr"]])] as [string, number, string][]).map(([label, amount, suffix]) => `<div><span>${label}</span><strong>${formatMoney(amount, currency, cents)}${suffix ? `<small>${suffix}</small>` : ""}</strong></div>`).join("")}</div>`;
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
export const documentQuoteCss = `
.proposal-typography.proposal-typography .flow-quote-line{display:grid;grid-template-columns:20px minmax(0,1fr);align-items:start;gap:12px;padding:12px 4px;margin:0;border:0;border-bottom:1px solid #e4eaed;border-radius:0;min-height:48px;font:400 14px/1.5 var(--font-ui,"Instrument Sans",sans-serif);box-sizing:border-box;background:transparent}
.proposal-typography.proposal-typography .flow-quote-line.selected{border-color:#e4eaed;background:transparent}
.proposal-typography.proposal-typography .flow-line-title{display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;gap:12px;font:600 15px/21px var(--font-ui,"Instrument Sans",sans-serif)}
.proposal-typography.proposal-typography .flow-line-title strong{font-weight:600}
.proposal-typography.proposal-typography .flow-line-title>strong:first-child{padding-right:40px}
.proposal-typography.proposal-typography .flow-line-title .amount{white-space:nowrap;flex:none;font-variant-numeric:tabular-nums}
.proposal-typography.proposal-typography .flow-subline{display:flex;justify-content:space-between;gap:24px;margin:4px 0 0;padding-left:12px;font:400 13px/1.5 var(--font-ui,"Instrument Sans",sans-serif);align-items:baseline}
.proposal-typography.proposal-typography .flow-subline strong{font:600 15px/21px var(--font-ui,"Instrument Sans",sans-serif);font-variant-numeric:tabular-nums}
.proposal-typography.proposal-typography .flow-quote-line .quote-description,.proposal-typography.proposal-typography .flow-quote-line .flow-terms{font-size:13px;font-weight:400;line-height:19px;color:#56646a;margin:4px 0 0}
.proposal-typography.proposal-typography .flow-choice-group{padding:10px;border:2px solid #9DB3A8;background:#F2F6F3;border-radius:14px;margin:0}
.proposal-typography.proposal-typography .flow-choice-group>h3{padding:0;margin:0 0 8px;font:600 11px/1.5 var(--font-ui,"Instrument Sans",sans-serif);text-transform:uppercase;letter-spacing:.08em;color:#365c4a}
.proposal-typography.proposal-typography .flow-choice-group .flow-quote-line{border:0;border-radius:10px;padding:12px 14px;background:white;box-shadow:inset 0 0 0 1px #dce3e6}
.proposal-typography.proposal-typography .flow-choice-group .flow-quote-line.selected{box-shadow:inset 0 0 0 2px #365C4A}
.proposal-typography.proposal-typography .flow-choice-group>.flow-quote-line+.flow-quote-line,.proposal-typography.proposal-typography .flow-choice-group>.quote-sortable+.quote-sortable{margin-top:8px}
.proposal-typography.proposal-typography .flow-quote{display:grid;gap:8px}
.proposal-typography.proposal-typography .document-quote{display:block}
.proposal-typography.proposal-typography .document-quote>.quote-sortable+.quote-sortable{margin-top:8px}
.print-pricing-table>section+section,.print-pricing-intro>.print-pricing-unit,.print-pricing-intro>.print-choice-group{margin-top:8px}
.proposal-typography.proposal-typography .flow-quote-line input,.print-selection{appearance:none;display:inline-flex;flex:none;width:20px;height:20px;min-height:20px;margin:0;border:2px solid #7f8e94;border-radius:6px;align-items:center;justify-content:center;background:white;padding:0}
.proposal-typography.proposal-typography .flow-quote-line input[type=radio],.print-radio{border-radius:50%}
.proposal-typography.proposal-typography .flow-quote-line input:checked,.print-selection[data-checked=true]{background:#365c4a;border-color:#365c4a;color:white}
.proposal-typography.proposal-typography .flow-quote-line input:checked{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m5 12 4 4L19 6' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E");background-size:16px;background-position:center;background-repeat:no-repeat}
.proposal-typography.proposal-typography .flow-quote-line input[type=radio]:checked{background:white;background-image:radial-gradient(circle,#365c4a 0 5px,transparent 5.5px)}
.print-radio[data-checked=true]{background:white;color:#365c4a}.print-radio[data-checked=true] svg{display:none}.print-radio[data-checked=true]::after{content:"";display:block;width:10px;height:10px;border-radius:50%;background:#365c4a}
.print-selection svg{width:16px;height:16px}
.proposal-typography.proposal-typography .flow-quote-line>.quote-control-slot{display:inline-flex;width:20px;min-width:20px;height:20px;align-items:flex-start;justify-content:center;margin-top:2px}
.proposal-typography.proposal-typography .quote-control-slot input{margin:0}
.quote-required{display:block;width:20px;height:20px}
.proposal-typography.proposal-typography .document-totals,.client-flow.client-flow .document-totals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;background:#f4f7f7;border:0;border-radius:12px;padding:14px 16px;margin:4px 0 0;break-inside:avoid}
.proposal-typography.proposal-typography .document-totals:has(>div:nth-child(3)),.client-flow.client-flow .document-totals:has(>div:nth-child(3)){grid-template-columns:repeat(3,minmax(0,1fr))}
.proposal-typography.proposal-typography .document-totals>div,.client-flow.client-flow .document-totals>div{display:flex;flex-direction:column;gap:4px;padding:0}
.proposal-typography.proposal-typography .document-totals span,.client-flow.client-flow .document-totals span{font:600 11px/1.5 var(--font-ui,"Instrument Sans",sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#56646a}
.proposal-typography.proposal-typography .document-totals strong,.client-flow.client-flow .document-totals strong{font:650 22px/1.3 var(--font-ui,"Instrument Sans",sans-serif);font-variant-numeric:tabular-nums;color:#1C1B18}
.proposal-typography.proposal-typography .document-totals small,.client-flow.client-flow .document-totals small{font:400 14px/1.3 var(--font-ui,"Instrument Sans",sans-serif);color:#56646a;margin-left:2px}
.print-pricing-card,.print-choice-group{break-inside:avoid}
/* Keep screen typography. In Linux PDFs, tracking and kerned pairs can emit
   separate text runs that extractors interpret as word boundaries. */
@media print{.proposal-typography.proposal-typography .flow-choice-group>h3,.proposal-typography.proposal-typography .document-totals span,.client-flow.client-flow .document-totals span{letter-spacing:normal;font-kerning:none}}
`;
