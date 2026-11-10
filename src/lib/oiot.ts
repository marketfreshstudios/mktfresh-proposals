import { oiotPlan } from "../../seed/oiot-plan";
export { oiotPlan } from "../../seed/oiot-plan";
import type { Block, Item, Quote, QuoteItem, Subline } from "./model";

export const oiotKickoffField = "oiot.kickoff";
export const oiotPurchasePriceField = "oiot.purchase_price";
export const oiotKickoffRequired = `Enter the kickoff amount for ${oiotPlan.name}`;
export const oiotPurchasePriceRequired = `Enter the website purchase price for ${oiotPlan.name}`;
type Clause = NonNullable<Block["clauses"]>[number];
export const finalOiotClause = (clause: Clause) =>
  clause.body_format === "oiot_run_in";

export function oiotItem(
  item: QuoteItem,
  content: Block[],
  catalog: Item[] = [],
) {
  return (
    item.sublines.some((line) => line.interval === "month") &&
    (item.sublines.some(
      (line) => line.stripe_lookup_key === oiotPlan.lookupKey,
    ) ||
      (item.pricing_item_id !== null &&
        (catalog.some(
          (product) =>
            product.id === item.pricing_item_id &&
            oiotPlan.skus.includes(product.sku),
        ) ||
          content.some((block) =>
            block.clauses?.some(
              (clause) =>
                clause.id === "payment-plan" &&
                clause.show_when?.pricing_item_id === item.pricing_item_id,
            ),
          ))))
  );
}

export function isOiotKickoffLine(line: Subline) {
  return (
    line.interval === "one_time" &&
    (line.oiot_kickoff || line.label?.trim().toLowerCase() === "kickoff")
  );
}

export function oiotKickoff(item: QuoteItem) {
  const lines = item.sublines.filter(isOiotKickoffLine);
  return lines.length === 1 ? lines[0] : undefined;
}

export function oiotOffer(
  quote: Quote,
  content: Block[],
  catalog: Item[] = [],
) {
  const offers = quote.filter((item) => oiotItem(item, content, catalog));
  return offers.length === 1 ? offers[0] : undefined;
}

/** The long conditional clause needs a fresh layout when the client switches plans. */
export function finalOiotVisibility(content: Block[], quote: Quote) {
  return content.some((block) =>
    block.clauses?.some(
      (clause) =>
        finalOiotClause(clause) &&
        (!clause.show_when ||
          quote.some(
            (item) =>
              item.pricing_item_id === clause.show_when?.pricing_item_id &&
              (!item.optional || (item.selected ?? item.default_selected)),
          )),
    ),
  );
}

/** Return the heading only when selecting the plan reveals its terms. */
export function revealedOiotClause(
  content: Block[],
  before: Quote,
  after: Quote,
) {
  return content
    .flatMap((block) => block.clauses ?? [])
    .find((clause) => {
      if (
        (!finalOiotClause(clause) && clause.id !== "payment-plan") ||
        !clause.show_when
      )
        return false;
      const selected = (items: Quote) =>
        items.some(
          (item) =>
            item.pricing_item_id === clause.show_when?.pricing_item_id &&
            (!item.optional || (item.selected ?? item.default_selected)),
        );
      return !selected(before) && selected(after);
    })?.id;
}

/** This format applies only to the final clause. All pieces are escaped by its renderer. */
export function clauseTextParts(text: string, bold = false) {
  if (!bold) return [{ text, bold: false }];
  return text
    .split(/(^\*\*[^*\n]+\*\*(?= ))/m)
    .filter(Boolean)
    .map((part) =>
      /^\*\*[^*\n]+\*\*$/.test(part)
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}
