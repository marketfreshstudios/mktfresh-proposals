import { it, expect } from "vitest";
import { documentQuote } from "../src/lib/document-quote";
import type { QuoteItem } from "../src/lib/model";
export const item: QuoteItem = {
  id: crypto.randomUUID(),
  source: "custom",
  pricing_item_id: null,
  custom_family_id: null,
  choice_group_id: null,
  min_term_months: null,
  schedule: null,
  plan_terms: null,
  name: "Website",
  description: "A useful site",
  optional: false,
  default_selected: true,
  order: 0,
  sublines: [
    {
      id: crypto.randomUUID(),
      label: "",
      amount: 10000,
      qty: 1,
      interval: "one_time",
      list_amount: null,
      stripe_lookup_key: null,
      qbo_item_ref: null,
    },
  ],
};
it("required rows have an accessible empty spacer and only alternatives have a group box", () => {
  const html = documentQuote(
    [
      item,
      { ...item, id: crypto.randomUUID(), optional: true },
      ...[crypto.randomUUID(), crypto.randomUUID()].map((id) => ({
        ...item,
        id,
        optional: true,
        choice_group_id: "00000000-0000-4000-8000-000000000001",
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
it("totals always include zero one-time/monthly and only include yearly when present", () => {
  const html = documentQuote(
    [{ ...item, sublines: [{ ...item.sublines[0], amount: 0 }] }],
    "USD",
  );
  expect(html).toContain("<span>One-time</span><strong>$0</strong>");
  expect(html).toContain(
    "<span>Monthly</span><strong>$0<small>/mo</small></strong>",
  );
  expect(html).not.toContain("<span>Yearly</span>");
  expect(
    documentQuote(
      [{ ...item, sublines: [{ ...item.sublines[0], interval: "year" }] }],
      "USD",
    ),
  ).toContain("<span>Yearly</span>");
});
