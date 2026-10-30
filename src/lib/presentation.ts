import {
  flatQuote,
  quoteItems,
  selected,
  selectedContent,
  isQuoteItem,
  orderedItems,
} from "./quote-model";
import { formatMoney } from "./money";
import {
  AppError,
  check,
  readLine,
  type Block,
  type Line,
  type Quote,
  type Proposal,
  type RichText,
} from "./model";
export function totals(lines: Quote) {
  const out = { one_time_total: 0, monthly_total: 0, yearly_total: 0 };
  for (const raw of flatQuote(lines)) {
    const line = readLine(raw);
    if (!line.optional || line.selected) {
      const key =
        line.interval === "month"
          ? "monthly_total"
          : line.interval === "year"
            ? "yearly_total"
            : "one_time_total";
      out[key] += line.amount * line.qty;
      check(Number.isSafeInteger(out[key]), "Quote total overflow");
    }
  }
  return out;
}
export const intervalLabel = (interval: Line["interval"]) =>
  ({ one_time: "One-time", month: "Monthly", year: "Yearly" })[interval];
export const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
export function variables(
  p: Proposal,
  quote = p.quote,
  modern = p.status === "draft" ||
    p.versions?.at(-1)?.money_format_version === 2,
) {
  const fmt = (amount: number) =>
    modern
      ? formatMoney(
          amount,
          p.currency,
          p.workspace_settings?.money?.cents ?? "auto",
        )
      : money(amount, p.currency);
  const t = totals(quote);
  const map: Record<string, string> = {};
  for (const field of ["first_name", "last_name", "company", "email"] as const)
    map["client." + field] = p.client[field];
  Object.assign(map, {
    "proposal.title": p.title,
    "proposal.valid_until": p.valid_until.slice(0, 10),
    "proposal.date": (p.sent_at ?? p.created_at).slice(0, 10),
    "company.name": p.workspace_settings?.company_name ?? "",
    "company.owner": p.workspace_settings?.owner ?? "",
    "company.email": p.workspace_settings?.email ?? "",
    "company.phone": p.workspace_settings?.phone ?? "",
    "quote.one_time_total": fmt(t.one_time_total),
    "quote.monthly_total": fmt(t.monthly_total),
    "quote.yearly_total": fmt(t.yearly_total),
    "quote.selected_items": quoteItems(quote)
      .filter(selected)
      .map((l) => l.name)
      .join(", "),
  });
  if (modern)
    Object.assign(map, {
      "client.full_name": [p.client.first_name, p.client.last_name]
        .filter(Boolean)
        .join(" "),
      "workspace.name": p.workspace_settings?.company_name ?? "",
      "sender.name":
        p.sender?.display_name ?? p.workspace_settings?.owner ?? "",
    });
  for (const raw of flatQuote(quote)) {
    const l = readLine(raw);
    map[`quote.item.${l.stripe_lookup_key ?? l.id}.price`] = fmt(l.amount);
  }
  return map;
}
export function resolve(text: string, map: Record<string, string>) {
  return text.replace(/{{\s*([\w.-]+)\s*}}/g, (_, path) => {
    check(
      map[path] !== undefined && map[path] !== "",
      `Unresolved variable: ${path}`,
    );
    return map[path];
  });
}
export const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function rich(node: RichText, map: Record<string, string>, depth = 0): string {
  check(depth < 30, "Content nesting too deep");
  if (node.type === "variable")
    return `<span class="field-chip">${escape(resolve("{{" + (node.attrs?.path ?? "") + "}}", map))}</span>`;
  if (node.type === "text") {
    let s = escape(resolve(node.text ?? "", map));
    for (const m of node.marks ?? [])
      if (["bold", "italic", "underline"].includes(m.type))
        s = `<${{ bold: "strong", italic: "em", underline: "u" }[m.type]}>${s}</${{ bold: "strong", italic: "em", underline: "u" }[m.type]}>`;
    return s;
  }
  const tags: Record<string, string> = {
    doc: "div",
    paragraph: "p",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    hardBreak: "br",
  };
  const tag = tags[node.type];
  check(tag, "Unsupported rich text node");
  return `<${tag}>${(node.content ?? []).map((n) => rich(n, map, depth + 1)).join("")}</${tag}>`;
}
export function renderBlocks(
  blocks: Block[],
  quote: Quote,
  map: Record<string, string>,
  currency = "USD",
  centsMode: "auto" | "always" = "auto",
): string {
  check(Array.isArray(blocks) && blocks.length <= 300, "Invalid content");
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h2>${escape(resolve(b.text ?? "", map))}</h2>`;
        case "paragraph":
          return b.content
            ? rich(b.content, map)
            : `<p>${escape(resolve(b.text ?? "", map))}</p>`;
        case "variable":
          return `<span>${escape(resolve("{{" + b.path + "}}", map))}</span>`;
        case "page_break":
          return '<div class="page-break"></div>';
        case "signature_block":
          check(
            ["client", "company"].includes(b.role ?? ""),
            "Signature role required",
          );
          return `<p>Signature: ${b.role}</p>`;
        case "image":
          check(
            /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(
              b.src ?? "",
            ) && (b.src?.length ?? 0) < 1000000,
            "Images must be embedded PNG/JPEG (no remote requests)",
          );
          return `<img src="${b.src}" alt="${escape(b.alt ?? "")}" />`;
        case "contract": {
          check(
            Array.isArray(b.clauses) && b.clauses.length <= 50,
            "Contract requires at most 50 clauses",
          );
          const clauses = selectedContent([b], quote)[0].clauses!;
          return `<section class="contract"><h2>${escape(b.text || "Statement of Work & Contract")}</h2>${clauses
            .map((c) => {
              check(
                typeof c.heading === "string" &&
                  typeof c.body === "string" &&
                  c.body.length <= 20000,
                "Invalid contract clause",
              );
              return `<section><h3>${escape(resolve(c.heading, map))}</h3><p>${escape(resolve(c.body, map)).replace(/\n/g, "<br>")}</p></section>`;
            })
            .join("")}</section>`;
        }
        case "pricing_table":
          if (quote.some(isQuoteItem)) {
            const items = orderedItems(quote),
              groups = Array.from(
                new Set(items.map((i) => i.choice_group_id ?? i.id)),
              ),
              fmt = (v: number) => formatMoney(v, currency, centsMode),
              t = totals(quote);
            return (
              groups
                .map((id) => {
                  const options = items.filter(
                      (i) => (i.choice_group_id ?? i.id) === id,
                    ),
                    grouped = !!options[0].choice_group_id;
                  return `<section style="${grouped ? "border:2px solid #8baba0;padding:12px;border-radius:8px;" : ""}margin:14px 0">${grouped ? "<h3>Choose one</h3>" : ""}${options.map((i) => `<section style="break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0"><h3>${escape(i.name)} · ${selected(i) ? "Included" : "Not included"}</h3><p>${escape(i.description)}</p><table><tbody>${i.sublines.map((s) => `<tr><td>${escape(s.label || intervalLabel(s.interval))}</td><td>× ${s.qty}</td><td>${fmt(s.amount * s.qty)}${s.interval === "month" ? "/mo" : s.interval === "year" ? "/yr" : ""}</td></tr>`).join("")}</tbody></table>${i.min_term_months ? `<p>${i.min_term_months}-month minimum commitment.</p>` : ""}${i.schedule ? `<p>After ${i.schedule.after_paid_invoices} paid invoices: ${fmt(i.schedule.then.amount)} per recurring period.</p>` : ""}</section>`).join("")}</section>`;
                })
                .join("") +
              `<p>One-time: ${fmt(t.one_time_total)} · Monthly: ${fmt(t.monthly_total)}/mo${items.some((i) => i.sublines.some((s) => s.interval === "year")) ? ` · Yearly: ${fmt(t.yearly_total)}/yr` : ""}</p>`
            );
          }
          return (
            "<table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>" +
            flatQuote(quote)
              .map(readLine)
              .filter((l) => !l.optional || l.selected)
              .map(
                (l) =>
                  `<tr><td>${escape(l.name)} (${intervalLabel(l.interval)})<p>${escape(l.description)}</p>${l.min_term_months ? `<p>${l.min_term_months}-month minimum</p>` : ""}${l.schedule ? `<p>After ${l.schedule.after_paid_invoices} paid invoices: ${money(l.schedule.then.amount, currency)} ${intervalLabel(l.interval).toLowerCase()}.</p>` : ""}</td><td>${l.qty}</td><td>${money(l.amount * l.qty, currency)}</td></tr>`,
              )
              .join("") +
            `</tbody></table><p>One time: ${money(totals(quote).one_time_total, currency)} · Monthly: ${money(totals(quote).monthly_total, currency)} · Yearly: ${money(totals(quote).yearly_total, currency)}</p>`
          );
        default:
          throw new AppError(400, "Unsupported content block");
      }
    })
    .join("\n");
}
export const htmlDocument = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;line-height:1.5;color:#222;margin:36px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;text-align:left;padding:8px}img{max-width:100%;max-height:320px}h2{break-after:avoid}tr{break-inside:avoid}.page-break{break-before:page}pre{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:Letter;margin:18mm}</style></head><body>${body}</body></html>`;
