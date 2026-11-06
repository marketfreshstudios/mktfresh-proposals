import { createHash } from "node:crypto";
import copy from "./starter-copy.json" with { type: "json" };
import { markdownBlocks } from "../src/lib/markdown";
import { coverText, type CoverElement } from "../src/lib/cover";
import { defaultTemplateBands } from "../src/lib/page-bands";
import { catalogQuoteItem } from "../src/lib/quote-model";
import type { Block, Item, Template } from "../src/lib/model";

export const starterOrder = [6, 1, 2, 3, 4, 5];
export function starterId(workspace: string, key: string) {
  const hash = createHash("md5").update(`${workspace}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
// Kept byte-for-byte with the original sample's clause body and predicate.
export const paymentPlanClause = {
  id: "payment-plan",
  heading: "4.4 Own It Over Time",
  body: "If you choose Own It Over Time, you agree to a minimum commitment of 18 monthly payments. The website is paid off after 30 monthly payments of $175; billing then continues at $100/month for hosting and care. If payments stop before the 30th payment, {{workspace.name}} may take the website offline.",
  show_when: {
    kind: "item_selected" as const,
    pricing_item_id: "00000000-0000-4000-8000-000000000103",
  },
  draft: true,
};
export function starterTemplates(
  workspace: string,
  options: { marketfresh?: boolean; catalog?: Item[] } = {},
): Template[] {
  return starterOrder.map((number, order) => {
    const source = copy.templates.find((t) => t.number === number)!;
    const id = starterId(workspace, source.key);
    const coverLine = (
      kind: CoverElement["kind"],
      text?: string,
      key: string = kind,
    ): CoverElement => ({
      id: key,
      kind,
      align: "left",
      ...(text === undefined ? {} : { content: coverText(text) }),
    });
    const blocks = markdownBlocks(
      source.markdown,
      [...source.markdown.matchAll(/{{([^}]+)}}/g)].map((m) => m[1]),
    );
    const content: Block[] = [{ type: "page_break" }];
    for (const block of blocks) {
      if (block.type === "heading" && block.text === "Investment")
        content.push({ type: "page_break" });
      // The pricing marker is specification notation, not client-facing copy.
      if (
        block.type === "paragraph" &&
        JSON.stringify(block.content).includes("(pricing_table)")
      )
        content.push({ type: "pricing_table" });
      else content.push(block);
    }
    const clauses: NonNullable<Block["clauses"]> = source.clauses.map(
      (original, index) => {
        const clause = copy.clauses.find((c) => c.number === original)!;
        return {
          id: `terms-${original}`,
          heading: `${index + 1}. ${clause.heading}`,
          body: clause.body,
          show_when: null,
        };
      },
    );
    if (options.marketfresh && number === 1)
      clauses.splice(4, 0, structuredClone(paymentPlanClause));
    content.push(
      { type: "page_break" },
      { type: "contract", text: "Terms", clauses },
      { type: "page_break" },
      { type: "heading", text: "Signatures", level: 1 },
      { type: "signature_block", role: "client" },
      { type: "signature_block", role: "company" },
    );
    content.forEach((b, index) => (b.id = starterId(id, `block-${index}`)));
    const ids = (numbers: number[]) =>
      numbers.map(
        (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      );
    const wanted = options.marketfresh
      ? ids(
          number === 1
            ? [101, 103, 104]
            : number === 2
              ? [105, 106, 107]
              : number === 3
                ? [109, 110]
                : number === 4
                  ? [100]
                  : [],
        )
      : [];
    const catalog = options.catalog ?? [];
    // A missing member leaves the complete choice group empty; never guess a replacement.
    const complete = wanted.every((id) =>
      catalog.some((i) => i.id === id && i.active),
    );
    const default_items = complete
      ? wanted.map((itemId, index) => {
          const item = catalog.find((i) => i.id === itemId)!;
          const quote = catalogQuoteItem(
            item,
            index,
            starterId(id, `quote-${index}`),
            [],
          );
          const choice =
            (number === 1 && index < 2) || number === 2 || number === 3;
          const checked = number === 1 ? index === 0 : number === 4;
          return {
            ...quote,
            optional: choice || (number === 1 && index === 2),
            selected: checked,
            default_selected: checked,
            choice_group_id: choice ? starterId(id, "choices") : null,
          };
        })
      : [];
    return {
      id,
      name: source.name,
      description: source.description,
      starter_key: source.key,
      starter_order: order,
      active: true,
      signature_heading_defaulted: true,
      header_footer: defaultTemplateBands(),
      cover: {
        workspace: "{{workspace.name}}",
        eyebrow: source.eyebrow,
        byline: "{{proposal.validity}}",
        elements: [
          coverLine("logo"),
          coverLine("eyebrow", source.eyebrow),
          coverLine("title", source.title),
          coverLine(
            "prepared_for",
            "Prepared for {{client.full_name}}, {{client.company}}",
          ),
          coverLine(
            "byline",
            "Prepared by {{sender.name}}, {{workspace.name}}",
          ),
          coverLine("extra", "{{proposal.date}}", "date"),
          coverLine("extra", "{{proposal.validity}}", "validity"),
        ],
      },
      content,
      default_quote: [],
      default_items,
    };
  });
}
