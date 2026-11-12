import { expect, it } from "vitest";
import {
  printedChoiceGroupLabel,
  choiceGroupLabel,
} from "../src/lib/quote-options";
import type { QuoteItem } from "../src/lib/model";

it("an unnamed group reads the same in the sidebar and the document", () => {
  const base = { choice_group_id: "g" } as QuoteItem;
  for (const required of [true, false]) {
    const item = { ...base, choice_group_required: required };
    expect(choiceGroupLabel(item)).toBe(printedChoiceGroupLabel(item));
  }
  expect(choiceGroupLabel({ ...base, choice_group_required: false })).toBe(
    "Choose up to one",
  );
});
