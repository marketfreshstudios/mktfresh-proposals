import type { Block } from "./model";

const pricingHeading =
  /\b(investment|pricing|price|prices|fees|cost|costs|quote)\b/i;
const signaturesHeading = /^\s*signatures?\s*$/i;

function blockText(block: Block) {
  return `${block.text ?? ""} ${block.content ? JSON.stringify(block.content) : ""}`;
}
const isPricingMarker = (block: Block) =>
  block.type === "paragraph" && blockText(block).includes("(pricing_table)");
const isTopHeading = (block: Block) =>
  block.type === "heading" && (block.level ?? 1) === 1;

/**
 * Lay out a draft written as Markdown (e.g. by an AI assistant) around the
 * template's protected blocks, the way the starters do: the pricing table
 * under the investment section, the Terms on a new page right after it,
 * then the rest, and the signatures on their own page.
 */
export function assembleDraftContent(
  written: Block[],
  contracts: Block[],
): Block[] {
  const out = [...written];
  // 1. Pricing: at an explicit (pricing_table) marker, else under the
  // investment/pricing heading, else before the signatures, else at the end.
  let pricing = out.findIndex(isPricingMarker);
  if (pricing >= 0) out.splice(pricing, 1);
  else {
    const heading = out.findIndex(
      (b) => isTopHeading(b) && pricingHeading.test(b.text ?? ""),
    );
    const signatures = out.findIndex(
      (b) => isTopHeading(b) && signaturesHeading.test(b.text ?? ""),
    );
    pricing =
      heading >= 0 ? heading + 1 : signatures >= 0 ? signatures : out.length;
  }
  out.splice(pricing, 0, { type: "pricing_table" });
  // 2. Terms on a new page right after the pricing section.
  if (contracts.length) {
    let at = pricing + 1;
    while (
      at < out.length &&
      out[at].type !== "heading" &&
      out[at].type !== "page_break"
    )
      at++;
    out.splice(at, 0, { type: "page_break" }, ...contracts);
  }
  // 3. Signatures on their own page.
  let signatures = out.findIndex(
    (b) => isTopHeading(b) && signaturesHeading.test(b.text ?? ""),
  );
  if (signatures < 0) {
    out.push({ type: "page_break" }, {
      type: "heading",
      text: "Signatures",
      level: 1,
    } as Block);
  } else if (out[signatures - 1]?.type !== "page_break") {
    out.splice(signatures, 0, { type: "page_break" });
    signatures++;
  }
  out.push(
    { type: "signature_block", role: "client" },
    { type: "signature_block", role: "company" },
  );
  return out;
}
