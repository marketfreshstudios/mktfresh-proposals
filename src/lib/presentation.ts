import {
  clauseTextParts,
  finalOiotClause,
  oiotOffer,
  oiotKickoff,
  oiotKickoffField,
  oiotPurchasePriceField,
  oiotCareVariables,
} from "./oiot";
import { blockBoxCss, columnBoxStyle, cssDeclarations } from "./block-style";
import { columnGridStyle, columnRejection, columnsSchema } from "./columns";
import { documentSpacing } from "./document-spacing";
import { resolveStyles, type ResolvedStyles } from "./proposal-styles";
import { businessState } from "./business-state";
import { workspaceBusinessName } from "./business-details";
import { hasInlineFontSize, inlineSizeHtml } from "./inline-font-size";
import { formattedAddress } from "./client-contact";
import { readableDate } from "./validity";
import {
  quoteSublines,
  cloneQuote,
  selected,
  selectedContent,
  orderedItems,
  visibleQuote,
} from "./quote-model";
import { formatMoney } from "./money";
import {
  AppError,
  check,
  type Block,
  type BillingLine,
  type Quote,
  type Proposal,
  type RichText,
} from "./model";
export function totals(lines: Quote) {
  const out = { one_time_total: 0, monthly_total: 0, yearly_total: 0 };
  for (const raw of quoteSublines(lines)) {
    const line = raw;
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
export const intervalLabel = (interval: BillingLine["interval"]) =>
  ({ one_time: "One-time", month: "Monthly", year: "Yearly" })[interval];
export const money = (cents: number, currency = "USD") =>
  formatMoney(cents, currency);
export function variables(p: Proposal, quote = p.quote) {
  const fmt = (amount: number) =>
    formatMoney(
      amount,
      p.currency,
      p.workspace_settings?.money?.cents ?? "auto",
    );
  const t = totals(quote);
  const map: Record<string, string> = {};
  for (const field of ["first_name", "last_name", "company", "email"] as const)
    map["client." + field] = p.client[field];
  Object.assign(map, {
    "client.address": formattedAddress(p.client.address),
    "proposal.title": p.title,
    "proposal.valid_until": readableDate(
      p.valid_until,
      p.workspace_settings?.timezone,
    ),
    "proposal.validity": p.valid_until
      ? `This proposal is valid until ${readableDate(p.valid_until, p.workspace_settings?.timezone)}.`
      : "",
    "proposal.date": new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: p.workspace_settings?.timezone ?? "UTC",
    }).format(new Date(p.sent_at ?? p.created_at)),
    "company.name": p.workspace_settings?.company_name ?? "",
    "company.owner": p.workspace_settings?.owner ?? "",
    "company.email": p.workspace_settings?.email ?? "",
    "company.phone": p.workspace_settings?.phone ?? "",
    "quote.one_time_total": fmt(t.one_time_total),
    "quote.monthly_total": fmt(t.monthly_total),
    "quote.yearly_total": fmt(t.yearly_total),
    "quote.selected_items": visibleQuote(cloneQuote(quote))
      .filter(selected)
      .map((l) => l.name)
      .join(", "),
  });
  Object.assign(map, {
    "client.full_name": [p.client.first_name, p.client.last_name]
      .filter(Boolean)
      .join(" "),
    "workspace.name": workspaceBusinessName(p.workspace_settings),
    "workspace.state": businessState(p.workspace_settings),
    "business.state": businessState(p.workspace_settings),
    "sender.name": p.sender?.display_name ?? p.workspace_settings?.owner ?? "",
  });
  for (const raw of quoteSublines(quote, false, true)) {
    const l = raw;
    map[`quote.item.${l.stripe_lookup_key ?? l.id}.price`] = fmt(l.amount);
  }
  const offer = oiotOffer(quote, p.content ?? []);
  const kickoff = offer && oiotKickoff(offer);
  map[oiotKickoffField] = kickoff ? fmt(kickoff.amount * kickoff.qty) : "";
  map[oiotPurchasePriceField] =
    offer?.oiot_purchase_price === undefined
      ? ""
      : fmt(offer.oiot_purchase_price);
  Object.assign(map, oiotCareVariables(quote, fmt));
  return map;
}
/** Fill known fields for labels shown to staff (section titles in readiness
 * messages). Unknown or empty fields stay as written instead of throwing. */
export function resolveLabel(text: string, map: Record<string, string>) {
  return text.replace(/{{\s*([\w.-]+)\s*}}/g, (token, path) =>
    map[path] ? map[path] : token,
  );
}
export const permitsEmptyVariable = (path: string) =>
  ["proposal.validity", "proposal.valid_until", "client.address"].includes(
    path,
  );

export function resolve(text: string, map: Record<string, string>) {
  return text.replace(/{{\s*([\w.-]+)\s*}}/g, (_, path) => {
    check(
      map[path] !== undefined &&
        (map[path] !== "" || permitsEmptyVariable(path)),
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
export function contractClauseHtml(
  clause: NonNullable<Block["clauses"]>[number],
  map: Record<string, string>,
) {
  return clauseTextParts(clause.body, finalOiotClause(clause))
    .map((part) => {
      const html = escape(resolve(part.text, map)).replace(/\n/g, "<br>");
      return part.bold ? `<strong>${html}</strong>` : html;
    })
    .join("");
}
function escapedResolved(text: string, map: Record<string, string>) {
  const result = escape(resolve(text, map));
  // Only the new multiline field changes whitespace; existing document text keeps its rendering.
  return /{{\s*client\.address\s*}}/.test(text)
    ? result.replaceAll("\n", "<br>")
    : result;
}
function rich(node: RichText, map: Record<string, string>, depth = 0): string {
  check(depth < 30, "Content nesting too deep");
  if (node.type === "text" || node.type === "variable") {
    let s =
      node.type === "variable"
        ? escapedResolved("{{" + (node.attrs?.path ?? "") + "}}", map)
        : escapedResolved(node.text ?? "", map);
    for (const m of node.marks ?? []) {
      if (["bold", "italic", "underline"].includes(m.type))
        s = `<${{ bold: "strong", italic: "em", underline: "u" }[m.type]}>${s}</${{ bold: "strong", italic: "em", underline: "u" }[m.type]}>`;
      else if (m.type === "fontSize") s = inlineSizeHtml(s, m.attrs?.size);
      else if (m.type === "link") {
        const href = String(m.attrs?.href ?? "");
        let safe = false;
        try {
          safe = ["https:", "mailto:"].includes(new URL(href).protocol);
        } catch {}
        check(safe, "Links must use HTTPS or mailto");
        s = `<a href="${escape(href)}" rel="noopener noreferrer">${s}</a>`;
      }
    }
    return s;
  }
  const tags: Record<string, string> = {
    doc: "div",
    paragraph: "p",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    hardBreak: "br",
    horizontalRule: "hr",
  };
  const tag = tags[node.type];
  check(tag, "Unsupported rich text node");
  if (tag === "hr") return "<hr>";
  const body = (node.content ?? [])
    .map((n) => rich(n, map, depth + 1))
    .join("");
  if (!body.trim() && tag === "div") return "";
  return tag === "p" &&
    !body.replace(/<[^>]*>/g, "").trim() &&
    /proposal\.valid|client\.address/.test(JSON.stringify(node))
    ? ""
    : `<${tag}>${tag === "p" && !body ? "<br>" : body}</${tag}>`;
}
export function renderBlocks(
  blocks: Block[],
  quote: Quote,
  map: Record<string, string>,
  currency = "USD",
  centsMode: "auto" | "always" = "auto",
  styles?: ResolvedStyles,
): string {
  check(Array.isArray(blocks) && blocks.length <= 300, "Invalid content");
  return blocks
    .map((b) => {
      switch (b.type) {
        case "columns": {
          const columns = columnsSchema.parse(b.columns);
          const resolved = styles ?? resolveStyles();
          const groups = columns.items
            .map((column, n) => {
              const reason = columnRejection(column.content);
              check(!reason, reason ?? "");
              const spacing = documentSpacing(column.content, resolved, true);
              const children = column.content
                .map((child, i) => {
                  const id = child.id ?? String(i);
                  const box = blockBoxCss(child.style);
                  return `<div class="print-atom column-document-block" data-column-block="${escape(id)}" style="display:flow-root;margin-top:${spacing[id]}px;padding-top:0;${box}">${renderBlocks([child], quote, map, currency, centsMode, resolved)}</div>`;
                })
                .join("");
              return `<div class="document-column" role="group" aria-label="Column ${n + 1}" style="${cssDeclarations(columnBoxStyle(column.style))}">${children}</div>`;
            })
            .join("");
          return `<div class="document-columns" role="region" aria-label="Columns" style="${cssDeclarations(columnGridStyle(columns))}">${groups}</div>`;
        }
        case "heading": {
          const level = [1, 2, 3].includes(b.level ?? 1) ? (b.level ?? 1) : 1;
          return `<h${level + 1} data-heading-level="${level}">${b.content && (b.rich_heading || hasInlineFontSize(b.content)) ? rich(b.content, map).replace(/<\/?(?:div|p)>/g, "") : escapedResolved(b.text ?? "", map)}</h${level + 1}>`;
        }
        case "paragraph":
          return b.content
            ? rich(b.content, map)
            : resolve(b.text ?? "", map).trim()
              ? `<p>${escapedResolved(b.text ?? "", map)}</p>`
              : "";
        case "variable":
          return resolve("{{" + b.path + "}}", map)
            ? `<span>${escapedResolved("{{" + b.path + "}}", map)}</span>`
            : "";
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
          check(
            b.width_percent === undefined ||
              (Number.isFinite(b.width_percent) &&
                b.width_percent > 0 &&
                b.width_percent <= 100),
            "Image width must be between 0 and 100 percent",
          );
          check(
            b.align === undefined ||
              ["left", "center", "right"].includes(b.align),
            "Invalid image alignment",
          );
          return `<img class="proposal-block-image" src="${b.src}" alt="${escape(b.alt ?? "")}" style="display:block;width:${b.width_percent ?? 100}%;height:auto;max-height:none;margin-left:${b.align === "right" || b.align === "center" ? "auto" : "0"};margin-right:${b.align === "left" || b.align === "center" ? "auto" : "0"}" />`;
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
              return `<section><h3 data-print-part="${escape(c.id)}">${escape(resolve(c.heading, map))}</h3><p data-print-part="${escape(c.id)}">${contractClauseHtml(c, map)}</p></section>`;
            })
            .join("")}</section>`;
        }
        case "pricing_table": {
          const items = orderedItems(visibleQuote(quote)),
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
                return `<section class="${grouped ? "print-choice-group" : "print-pricing-unit"}" data-print-unit="${escape(options[0].id)}" style="break-inside:avoid;${grouped ? "border:2px solid #8baba0;padding:12px;border-radius:8px;" : ""}margin:14px 0">${grouped ? "<h3>Choose one</h3>" : ""}${options.map((i) => `<section class="print-pricing-card" style="break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0"><h3>${escape(i.name)} · ${selected(i) ? "Included" : "Not included"}</h3><p>${escape(i.description)}</p><table><tbody>${i.sublines.map((s) => `<tr><td>${escape(s.label || intervalLabel(s.interval))}</td><td>× ${s.qty}</td><td>${fmt(s.amount * s.qty)}${s.interval === "month" ? "/mo" : s.interval === "year" ? "/yr" : ""}</td></tr>`).join("")}</tbody></table>${typeof i.plan_terms?.client_copy === "string" && i.plan_terms.client_copy ? `<p>${escape(i.plan_terms.client_copy)}</p>` : ""}${i.min_term_months ? `<p>${i.min_term_months}-month minimum commitment.</p>` : ""}${i.schedule ? `<p>After ${i.schedule.after_paid_invoices} paid invoices: ${fmt(i.schedule.then.amount)} per recurring period.</p>` : ""}</section>`).join("")}</section>`;
              })
              .join("") +
            `<p>One-time: ${fmt(t.one_time_total)} · Monthly: ${fmt(t.monthly_total)}/mo${items.some((i) => i.sublines.some((s) => s.interval === "year")) ? ` · Yearly: ${fmt(t.yearly_total)}/yr` : ""}</p>`
          );
        }
        default:
          throw new AppError(400, "Unsupported content block");
      }
    })
    .filter(Boolean)
    .join("\n");
}
export const htmlDocument = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;line-height:1.5;color:#222;margin:36px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;text-align:left;padding:8px}img{max-width:100%;max-height:320px}h2{break-after:avoid}tr{break-inside:avoid}.page-break{break-before:page}pre{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:Letter;margin:18mm}</style></head><body>${body}</body></html>`;
