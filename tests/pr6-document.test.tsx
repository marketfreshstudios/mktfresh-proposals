import { it, expect } from "vitest";
import { documentQuote } from "../src/lib/document-quote";
import type { QuoteItem } from "../src/lib/model";
export const item: QuoteItem = {
  id: "required",
  name: "Website",
  description: "A useful site",
  optional: false,
  default_selected: true,
  order: 0,
  sublines: [
    { id: "price", label: "", amount: 10000, qty: 1, interval: "one_time" },
  ],
};
it("required rows have an accessible empty spacer and only alternatives have a group box", () => {
  const html = documentQuote(
    [
      item,
      { ...item, id: "optional", optional: true },
      ...["a", "b"].map((id) => ({
        ...item,
        id,
        optional: true,
        choice_group_id: "choice",
      })),
    ],
    "USD",
  );
  expect(html).toContain(
    'class="quote-required" role="img" aria-label="Required" title="Required"></span>',
  );
  expect(html).not.toMatch(/quote-required[^<]*><svg/);
  expect(
    html.match(/class="flow-choice-group print-choice-group"/g),
  ).toHaveLength(1);
  expect(html).toContain('class="print-selection');
  expect(html).toContain("print-radio");
});
