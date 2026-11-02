import { expect, it } from "vitest";
import { printView, viewKey } from "../src/lib/print-view";
import { setup } from "./helpers";
it("review flags and price holds do not invalidate identical visual pages; actual copy, money and choices do", async () => {
  const f = await setup(),
    original = JSON.stringify(f.draft),
    key = () => viewKey(printView(f.draft.content, f.draft.quote));
  const before = key();
  f.draft.content[0].ai_review = { source: "assistant", reviewed: true };
  f.draft.quote[0].price_review = { [f.draft.quote[0].sublines[0].id]: "keep" };
  expect(key()).toBe(before);
  f.draft.quote[0].sublines[0].amount++;
  expect(key()).not.toBe(before);
  const ungrouped = key();
  f.draft.quote[0].choice_group_id = crypto.randomUUID();
  expect(key()).not.toBe(ungrouped);
  expect(original).not.toContain("price_review");
});
it("visual identity is stable across object property ordering", () =>
  expect(viewKey({ b: { d: 2, c: 1 }, a: 0 })).toBe(
    viewKey({ a: 0, b: { c: 1, d: 2 } }),
  ));
