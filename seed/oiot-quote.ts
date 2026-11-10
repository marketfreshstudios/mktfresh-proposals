import type { Item, QuoteItem } from "../src/lib/model";
import { catalogQuoteItem, draftItems } from "../src/lib/quote-model";
import { oiotCarePlans, oiotPlan } from "./oiot-plan";

export const ownItNowCareKeys = [
  "hosted-essentials-25",
  "hosted-lite-64",
  "hosted-standard-100",
  "hosted-pro-164",
] as const;

export function marketFreshWebsiteChoices(
  catalog: Item[],
  id: (key: string) => string,
) {
  const find = (key: string) => {
    const item =
      catalog.find((item) => item.sku === key) ??
      catalog.find(
        (item) =>
          item.stripe_lookup_key === key ||
          item.sublines?.some((line) => line.stripe_lookup_key === key),
      );
    return item?.active && !item.legacy ? item : undefined;
  };
  const build = find("build");
  const ownCare = ownItNowCareKeys.map(find);
  const plans = oiotCarePlans.map((plan) => find(plan.lookup));
  if (!build || ownCare.some((item) => !item) || plans.some((item) => !item))
    return null;
  const buildGroup = id("build");
  const now = catalogQuoteItem(build, 0, id("own-now"), [id("own-now:line")]);
  const later: QuoteItem = {
    id: id("over-time"),
    order: 1,
    name: "Website Build — Own It Over Time",
    description: "",
    source: "custom",
    pricing_item_id: null,
    custom_family_id: null,
    sublines: [],
    optional: true,
    default_selected: false,
    choice_group_id: buildGroup,
    choice_group_required: true,
    min_term_months: null,
    schedule: null,
    plan_terms: null,
    oiot_build: true,
  };
  const care = (
    product: Item,
    order: number,
    parent: QuoteItem,
    group: string,
  ): QuoteItem => ({
    ...catalogQuoteItem(product, order, id(group + product.sku), [
      id(group + product.sku + ":line"),
    ]),
    optional: true,
    default_selected: false,
    selected: false,
    choice_group_id: id(group),
    choice_group_required: parent.oiot_build === true,
    show_when: { kind: "quote_item", id: parent.id },
  });
  return draftItems([
    {
      ...now,
      optional: true,
      choice_group_id: buildGroup,
      choice_group_required: true,
    },
    later,
    ...ownCare.map((item, index) =>
      care(item!, index + 2, now, "own-now-care"),
    ),
    ...plans.map((item, index) => {
      const plan = oiotCarePlans[index];
      const row = care(item!, index + 6, later, "over-time-care");
      const target = find(plan.stepDownLookup)!;
      return {
        ...row,
        name: plan.name,
        sublines: row.sublines
          .filter((line) => line.interval === "month")
          .map((line) => ({
            ...line,
            id: id("over-time-care" + item!.sku + ":line"),
          })),
        default_selected: index === 0,
        schedule: {
          after_paid_invoices: oiotPlan.paidPayments,
          then: { amount: target.amount, lookup_key: plan.stepDownLookup },
        },
        plan_terms: { ...row.plan_terms, oiot_paid_step_down: true },
      };
    }),
  ]);
}
