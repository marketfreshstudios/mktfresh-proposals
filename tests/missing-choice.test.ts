import { describe, expect, it } from "vitest";
import type { QuoteItem } from "../src/lib/model";
import { missingChoiceGroups } from "../src/lib/quote-options";

const line = (amount: number) => [
  {
    id: crypto.randomUUID(),
    qty: 1,
    amount,
    interval: "month" as const,
  },
];
let order = 0;
const item = (fields: Partial<QuoteItem>) =>
  ({
    order: order++,
    source: "custom",
    default_selected: false,
    id: crypto.randomUUID(),
    name: "Option",
    description: "",
    optional: true,
    sublines: line(100),
    ...fields,
  }) as QuoteItem;

describe("missing choice groups", () => {
  it("counts only visible required groups with nothing chosen", () => {
    const now = item({
      name: "Now",
      choice_group_id: "build",
      selected: false,
    });
    const time = item({
      name: "Time",
      choice_group_id: "build",
      selected: true,
    });
    const hosting = item({
      name: "Hosting",
      choice_group_id: "hosting",
      selected: false,
      show_when: { kind: "quote_item", id: now.id },
    });
    const care = item({
      name: "Care",
      choice_group_id: "care",
      selected: true,
      show_when: { kind: "quote_item", id: time.id },
    });
    const extras = item({
      name: "Extras",
      choice_group_id: "extras",
      choice_group_required: false,
      selected: false,
    });
    const quote = [now, time, hosting, care, extras];
    // Hosting is hidden (Own It Now isn't chosen) and Extras is "up to one".
    expect(missingChoiceGroups(quote)).toEqual([]);
    const legacy = item({ name: "Legacy", choice_group_id: "legacy" });
    expect(
      missingChoiceGroups([...quote, legacy]).map((g) => g[0].name),
    ).toEqual(["Legacy"]);
  });
});
