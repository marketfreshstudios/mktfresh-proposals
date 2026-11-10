import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
import { fieldNodes } from "../src/lib/editor-fields";
import { createHash } from "node:crypto";
import copy from "./starter-copy.json" with { type: "json" };
import { markdownBlocks } from "../src/lib/markdown";
import {
  coverText,
  applyCoverLayout,
  type Cover,
  type CoverElement,
} from "../src/lib/cover";
import { defaultTemplateBands } from "../src/lib/page-bands";
import { catalogQuoteItem } from "../src/lib/quote-model";
import type { Block, Item, Template } from "../src/lib/model";
import { paymentPlanClause } from "./oiot-clause";
export { paymentPlanClause } from "./oiot-clause";

export const starterCoverLayouts: Partial<
  Record<string, Exclude<NonNullable<Cover["layout"]>, "custom">>
> = {
  "general-project": "editorial",
  "website-design-build": "editorial",
  "local-visibility-seo": "side-photo",
  "website-ai-audit": "bold",
  "monthly-marketing": "centered",
};

export const starterOrder = [6, 1, 2, 3, 4, 5, 7];
export function starterId(workspace: string, key: string) {
  const hash = createHash("md5").update(`${workspace}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const starterProducts: Record<number, { sku: string; seed?: number }[]> = {
  1: [
    { sku: "build", seed: 101 },
    { sku: "oiot-monthly-175", seed: 103 },
    { sku: "hosted-essentials-25", seed: 104 },
  ],
  2: [
    { sku: "care-lite-49", seed: 105 },
    { sku: "care-standard-85", seed: 106 },
    { sku: "care-pro-149", seed: 107 },
  ],
  3: [
    { sku: "retainer-core-295", seed: 109 },
    { sku: "retainer-growth-495", seed: 110 },
  ],
  4: [{ sku: "audit", seed: 100 }],
  7: [
    { sku: "social-starter-595" },
    { sku: "social-growth-995" },
    { sku: "social-pro-1650" },
    { sku: "social-premium-2200" },
  ],
};
/** SKU is authoritative, including inactive matches. IDs support older seeded catalogs. */
export function starterCatalogProducts(number: number, catalog: Item[]) {
  return (starterProducts[number] ?? []).map(({ sku, seed }) => {
    const fallback =
      seed === undefined
        ? undefined
        : `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
    const item =
      catalog.find((i) => i.sku === sku) ??
      (seed === undefined ? undefined : catalog.find((i) => i.id === fallback));
    return {
      sku,
      item,
      issue: !item
        ? "missing"
        : !item.active || item.legacy
          ? "inactive"
          : null,
    };
  });
}
export function starterTemplates(
  workspace: string,
  options: { marketfresh?: boolean; catalog?: Item[] } = {},
): Template[] {
  return starterOrder.map((number, order) => {
    const source = copy.templates.find((t) => t.number === number)!;
    const products = options.marketfresh
      ? starterCatalogProducts(number, options.catalog ?? [])
      : [];
    const id = starterId(workspace, source.key);
    const coverLine = (
      kind: CoverElement["kind"],
      text?: string,
      key: string = kind,
    ): CoverElement => ({
      id: key,
      kind,
      align: "left",
      ...(text === undefined ? {} : { content: fieldNodes(coverText(text)) }),
    });
    const markdown =
      options.marketfresh && number === 7
        ? source.markdown
            .replaceAll("[Facebook and Instagram]", "Facebook and Instagram")
            .replaceAll("[$200]", "$200")
            .replaceAll("[$75–150]", "$75–150")
            .replaceAll("[3]", "3")
        : source.markdown;
    const blocks = markdownBlocks(
      markdown,
      [...markdown.matchAll(/{{([^}]+)}}/g)].map((m) => m[1]),
    );
    const content: Block[] = [{ type: "page_break" }];
    for (const block of blocks) {
      if (
        block.type === "heading" &&
        (block.text === "Investment" || block.text === "Why {{workspace.name}}")
      )
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
    if (options.marketfresh && number === 1) {
      const clause = structuredClone(paymentPlanClause);
      // Missing products leave the quote empty; retain the original conditional wording.
      clause.show_when.pricing_item_id =
        products[1]?.item?.id ?? clause.show_when.pricing_item_id;
      clauses.splice(4, 0, clause);
    }
    content.push(
      { type: "page_break" },
      { type: "contract", text: "Terms", clauses },
      { type: "page_break" },
      { type: "heading", text: "Signatures", level: 1 },
      { type: "signature_block", role: "client" },
      { type: "signature_block", role: "company" },
    );
    for (const b of content) {
      if (b.content) b.content = fieldNodes(b.content);
      if (b.type === "heading" && /{{/.test(b.text ?? "")) {
        b.content = fieldNodes(coverText(b.text!));
        b.rich_heading = true;
      }
    }
    content.forEach((b, index) => (b.id = starterId(id, `block-${index}`)));
    // A missing/inactive member leaves the entire template quote empty.
    const complete = products.every((p) => !p.issue);
    const default_items = complete
      ? products.map(({ item: product }, index) => {
          const item = product!;
          const quote = catalogQuoteItem(
            item,
            index,
            starterId(id, `quote-${index}`),
            [],
          );
          // Kickoff is proposal-specific: staff add a separately priced Custom line.
          if (number === 1 && index === 1)
            quote.sublines = quote.sublines.filter(
              (s) => s.interval !== "one_time",
            );
          const choice =
            (number === 1 && index < 2) ||
            number === 2 ||
            number === 3 ||
            number === 7;
          const checked =
            number === 1
              ? index === 0
              : number === 7
                ? index === 1
                : number === 4;
          return {
            ...quote,
            optional: choice || (number === 1 && index === 2),
            selected: checked,
            default_selected: checked,
            choice_group_id: choice ? starterId(id, "choices") : null,
          };
        })
      : [];
    const cover = applyCoverLayout(
      {
        logo_mode: "brand",
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
      starterCoverLayouts[source.key] ?? "editorial",
    );
    return {
      id,
      name: source.name,
      description: source.description,
      starter_key: source.key,
      starter_order: order,
      active: true,
      signature_heading_defaulted: true,
      header_footer: defaultTemplateBands(),
      cover,
      content,
      default_quote: [],
      default_items,
    };
  });
}

/** Workspace-specific catalog defaults stay in the seed layer, never in proposal logic. */
export function workspaceStarterTemplates(workspace: string, catalog: Item[]) {
  return starterTemplates(workspace, {
    marketfresh: workspace === LOCAL_WORKSPACE_ID,
    catalog,
  });
}
