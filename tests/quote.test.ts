import { flatQuote, quoteItems } from "../src/lib/quote-model";
import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { LineSchema, type Item, readLine } from "../src/lib/model";
import { readiness } from "../src/lib/quote";
import { totals, versionHash, renderBlocks } from "../src/lib/content";

it("keeps three totals, entered overrides and custom scope without deriving prices", async () => {
  const { draft } = await setup();
  const custom = LineSchema.parse({
    ...flatQuote(draft.quote)[1],
    pricing_item_id: null,
    custom_family_id: "00000000-0000-4000-8000-000000000099",
    amount: 200000,
    description: "Two articles and one strategy call every month",
    list_amount: null,
  });
  const annual = {
    ...custom,
    id: "00000000-0000-4000-8000-000000000098",
    amount: 30000,
    interval: "year" as const,
  };
  expect(totals([custom, annual])).toEqual({
    one_time_total: 0,
    monthly_total: 200000,
    yearly_total: 30000,
  });
  expect(renderBlocks([{ type: "pricing_table" }], [custom], {})).toContain(
    custom.description,
  );
  expect(totals([{ ...custom, selected: false }]).monthly_total).toBe(0);
});
it("warns on inconsistencies and unknown keys, but blocks legacy keys at send", async () => {
  const { draft, repo, service } = await setup();
  draft.quote = flatQuote(draft.quote);
  (draft.quote[1] as import("../src/lib/model").Line).amount = 9000;
  (draft.quote[1] as import("../src/lib/model").Line).stripe_lookup_key =
    "new-unknown";
  draft.quote[1].plan_terms = {
    kickoff_qbo: 100,
    payoff_months: 2,
    build_credit_mo: 50,
    full_price: 999,
  };
  const catalog = await repo.entities<Item>("pricing_items");
  expect(readiness(draft, catalog)).toMatchObject({ ready: true });
  expect(readiness(draft, catalog).warnings).toHaveLength(4);
  const legacy = { ...catalog[4], legacy: true };
  await repo.put("pricing_items", legacy);
  await expect(service.send(draft.id, staff)).rejects.toThrow("legacy");
});
it("reads historical quote shape without changing signed hash input", () => {
  const old = {
    id: "00000000-0000-4000-8000-000000000099",
    name: "Retained evidence",
    description: "Original",
    unit_price: 4200,
    billing: "monthly",
    qty: 1,
    optional: false,
    selected: true,
  };
  const v = { content: [], quote: [old] as never, variables_resolved: {} };
  const before = versionHash(v);
  expect(readLine(old as never).amount).toBe(4200);
  expect(totals(v.quote).monthly_total).toBe(4200);
  expect(versionHash(v)).toBe(before);
  expect(old).not.toHaveProperty("amount");
});
