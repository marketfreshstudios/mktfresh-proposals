import { oiotCarePlans, oiotPlan } from "../../seed/oiot-plan";
export { oiotPlan } from "../../seed/oiot-plan";
import type { Block, Item, Quote, QuoteItem, Subline } from "./model";
import { selected, visibleQuote } from "./quote-options";

export const oiotKickoffField = "oiot.kickoff";
export const oiotPurchasePriceField = "oiot.purchase_price";
export const oiotMonthlyField = "oiot.monthly";
export const oiotStepDownField = "oiot.step_down";
export const oiotStepDownPlanField = "oiot.step_down_plan";
export const oiotKickoffRequired = `Enter the kickoff amount for ${oiotPlan.name}`;
export const oiotPurchasePriceRequired = `Enter the website purchase price for ${oiotPlan.name}`;
type Clause = NonNullable<Block["clauses"]>[number];
export const finalOiotClause = (clause: Clause) =>
  clause.body_format === "oiot_run_in";

export function oiotPlanDetails(item: QuoteItem, catalog: Item[] = []) {
  const key = item.sublines.find(
    (line) => line.interval === "month",
  )?.stripe_lookup_key;
  const product = catalog.find((entry) => entry.id === item.pricing_item_id);
  return oiotCarePlans.find(
    (plan) =>
      plan.lookup === key ||
      (product &&
        (plan.lookup === product.stripe_lookup_key ||
          plan.skus.some((sku) => sku === product.sku))),
  );
}

export function oiotItem(
  item: QuoteItem,
  content: Block[],
  catalog: Item[] = [],
) {
  return (
    item.oiot_build ||
    (item.sublines.some((line) => line.interval === "month") &&
      (!!oiotPlanDetails(item, catalog) ||
        (item.pricing_item_id !== null &&
          content.some((block) =>
            block.clauses?.some(
              (clause) =>
                clause.id === "payment-plan" &&
                clause.show_when?.kind === "item_selected" &&
                clause.show_when.pricing_item_id === item.pricing_item_id,
            ),
          ))))
  );
}

/**
 * The financed build line: the one a choice group protects. A care
 * plan alone (monthly only, no one-time line) is an OIOT item but not the build,
 * so it can move in and out of groups like any option.
 */
export function oiotBuildItem(
  item: QuoteItem,
  content: Block[],
  catalog: Item[] = [],
) {
  return (
    !!item.oiot_build ||
    (oiotItem(item, content, catalog) &&
      item.sublines.some((line) => line.interval === "one_time"))
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
  const builds = quote.filter((item) => item.oiot_build);
  if (builds.length) return builds.length === 1 ? builds[0] : undefined;
  const offers = quote.filter((item) => oiotItem(item, content, catalog));
  return offers.length === 1 ? offers[0] : undefined;
}

/** Catalog IDs and the signed recurring line identify the plan even in public DTOs. */
export function chosenOiotCare(quote: Quote) {
  const matches = visibleQuote(quote).filter(
    (item) =>
      selected(item) &&
      (oiotPlanDetails(item) ||
        item.plan_terms?.oiot_paid_step_down === true ||
        (item.schedule &&
          oiotCarePlans.some(
            (plan) => plan.stepDownLookup === item.schedule?.then.lookup_key,
          ))),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function oiotCareVariables(
  quote: Quote,
  format: (amount: number) => string,
) {
  const plan = chosenOiotCare(quote);
  const monthly = plan?.sublines.find((line) => line.interval === "month");
  const next = plan?.schedule?.then;
  return {
    [oiotMonthlyField]: monthly ? format(monthly.amount * monthly.qty) : "",
    [oiotStepDownField]: next ? format(next.amount) : "",
    [oiotStepDownPlanField]: next
      ? (oiotCarePlans.find((care) => care.stepDownLookup === next.lookup_key)
          ?.stepDownPlan ?? "")
      : "",
  };
}

export function quoteChangesPageContent(
  content: Block[],
  before: Quote,
  after: Quote,
) {
  return (
    finalOiotVisibility(content, before) !==
      finalOiotVisibility(content, after) ||
    (after.some((item) => item.show_when) &&
      (visibleQuote(before)
        .map((item) => item.id)
        .join() !==
        visibleQuote(after)
          .map((item) => item.id)
          .join() ||
        chosenOiotCare(before)?.id !== chosenOiotCare(after)?.id))
  );
}

export function clauseApplies(clause: Clause, quote: Quote) {
  const condition = clause.show_when;
  if (!condition) return true;
  if (condition.kind === "oiot_plan_selected") return !!chosenOiotCare(quote);
  return visibleQuote(quote).some(
    (item) =>
      item.pricing_item_id === condition.pricing_item_id && selected(item),
  );
}

export function clauseCatalogItem(clause: Clause) {
  return clause.show_when?.kind === "item_selected"
    ? clause.show_when.pricing_item_id
    : undefined;
}

/** The long conditional clause needs a fresh layout when the client switches plans. */
export function finalOiotVisibility(content: Block[], quote: Quote) {
  return content.some((block) =>
    block.clauses?.some(
      (clause) => finalOiotClause(clause) && clauseApplies(clause, quote),
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
      return !clauseApplies(clause, before) && clauseApplies(clause, after);
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
