import { expect, it } from "vitest";
import { contentSections } from "../src/lib/ai-review";
import {
  printedChoiceGroupLabel,
  choiceGroupLabel,
} from "../src/lib/quote-options";
import type { Block, QuoteItem } from "../src/lib/model";

it("Terms is its own section even without a heading or page break before it", () => {
  const content = [
    { id: "a", type: "heading", text: "Next steps", level: 1 },
    { id: "b", type: "paragraph", text: "Sign below." },
    { id: "c", type: "contract", text: "Terms", clauses: [] },
    { id: "d", type: "heading", text: "Signatures", level: 1 },
  ] as Block[];
  expect(contentSections(content).map((s) => s.title)).toEqual([
    "Next steps",
    "Terms",
    "Signatures",
  ]);
});

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
