import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  AppError,
  check,
  type Block,
  type Line,
  type Proposal,
  type RichText,
  type Version,
} from "./model";
export const CONSENT =
  "By signing electronically, I consent to electronic records and signatures, intend to sign this proposal, and agree that my electronic signature is the legal equivalent of my handwritten signature. I can download and retain a copy.";
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const versionHash = (
  v: Pick<Version, "content" | "quote" | "variables_resolved">,
) => sha256(canonical(v));
export function hashPassword(password: string) {
  check(
    password.length >= 8 && password.length <= 200,
    "Password must be 8–200 characters",
  );
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 32).toString("hex");
}
export function passwordMatches(password: string, hash: string) {
  if (password.length > 200) return false;
  const [salt, key] = hash.split(":");
  const a = scryptSync(password, salt, 32),
    b = Buffer.from(key, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function totals(lines: Line[]) {
  const out = { one_time_total: 0, monthly_total: 0 };
  for (const line of lines) {
    if (!line.optional || line.selected) {
      const key =
        line.billing === "monthly" ? "monthly_total" : "one_time_total";
      out[key] += line.unit_price * line.qty;
      check(Number.isSafeInteger(out[key]), "Quote total overflow");
    }
  }
  return out;
}
export const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
export function variables(p: Proposal, quote = p.quote) {
  const t = totals(quote);
  const map: Record<string, string> = {};
  for (const field of ["first_name", "last_name", "company", "email"] as const)
    map["client." + field] = p.client[field];
  Object.assign(map, {
    "proposal.title": p.title,
    "proposal.valid_until": p.valid_until.slice(0, 10),
    "proposal.date": (p.sent_at ?? p.created_at).slice(0, 10),
    "company.name": process.env.COMPANY_NAME ?? "MarketFresh",
    "company.owner": process.env.COMPANY_OWNER ?? "",
    "company.email": process.env.COMPANY_EMAIL ?? "",
    "company.phone": process.env.COMPANY_PHONE ?? "",
    "quote.one_time_total": money(t.one_time_total, p.currency),
    "quote.monthly_total": money(t.monthly_total, p.currency),
    "quote.selected_items": quote
      .filter((l) => !l.optional || l.selected)
      .map((l) => l.name)
      .join(", "),
  });
  for (const l of quote)
    map[`quote.item.${l.sku}.price`] = money(l.unit_price, p.currency);
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
  quote: Line[],
  map: Record<string, string>,
  currency = "USD",
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
        case "pricing_table":
          return (
            "<table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>" +
            quote
              .filter((l) => !l.optional || l.selected)
              .map(
                (l) =>
                  `<tr><td>${escape(l.name)} (${l.billing})</td><td>${l.qty}</td><td>${money(l.unit_price * l.qty, currency)}</td></tr>`,
              )
              .join("") +
            `</tbody></table><p>One time: ${money(totals(quote).one_time_total, currency)} · Monthly: ${money(totals(quote).monthly_total, currency)}</p>`
          );
        default:
          throw new AppError(400, "Unsupported content block");
      }
    })
    .join("\n");
}
export const htmlDocument = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;line-height:1.5;color:#222;margin:36px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;text-align:left;padding:8px}img{max-width:100%;max-height:320px}h2{break-after:avoid}tr{break-inside:avoid}.page-break{break-before:page}pre{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:Letter;margin:18mm}</style></head><body>${body}</body></html>`;
