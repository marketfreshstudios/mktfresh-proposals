import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { cloneQuote } from "../src/lib/quote-model";
import { QuoteItemSchema, type Item } from "../src/lib/model";
import { readiness } from "../src/lib/quote";
import { totals, renderBlocks } from "../src/lib/content";
it("keeps entered custom subline prices and independent interval totals", async () => {
  const { draft } = await setup(),
    custom = QuoteItemSchema.parse({
      ...draft.quote[1],
      source: "custom",
      pricing_item_id: null,
      custom_family_id: "00000000-0000-4000-8000-000000000099",
      description: "Two articles and one strategy call every month",
      sublines: [
        { ...draft.quote[1].sublines[0], amount: 200000, list_amount: null },
        {
          ...draft.quote[1].sublines[0],
          id: "00000000-0000-4000-8000-000000000098",
          interval: "year",
          amount: 30000,
        },
      ],
    });
  expect(totals([custom])).toEqual({
    one_time_total: 0,
    monthly_total: 200000,
    yearly_total: 30000,
  });
  expect(renderBlocks([{ type: "pricing_table" }], [custom], {})).toContain(
    custom.description,
  );
  expect(totals([{ ...custom, selected: false }]).monthly_total).toBe(0);
});
it("warns on inconsistencies and unknown keys but blocks retired catalogue prices", async () => {
  const { draft, repo, service } = await setup();
  draft.quote = cloneQuote(draft.quote);
  draft.quote[1].sublines[0].amount = 9000;
  draft.quote[1].sublines[0].stripe_lookup_key = "new-unknown";
  draft.quote[1].plan_terms = {
    kickoff_qbo: 100,
    payoff_months: 2,
    build_credit_mo: 50,
    full_price: 999,
  };
  const catalog = await repo.entities<Item>("pricing_items");
  expect(readiness(draft, catalog).ready).toBe(true);
  expect(readiness(draft, catalog).warnings).toHaveLength(4);
  await repo.put("pricing_items", { ...catalog[4], legacy: true });
  await expect(service.send(draft.id, staff)).rejects.toThrow("legacy");
});
