import { expect, it } from "vitest";
import { paymentPlanClause } from "../seed/oiot-clause";
import {
  clauseEditorBody,
  clauseEditorDoc,
} from "../src/lib/clause-editor-text";
import { fieldNodes, plainEditorText } from "../src/lib/editor-fields";

it("round-trips the exact stored Own It Over Time clause, including fields and paragraph breaks", () => {
  const { body } = paymentPlanClause;
  const doc = fieldNodes(clauseEditorDoc(body, true));
  expect(doc.content![0].content!.filter((n) => n.marks?.length)).toHaveLength(
    5,
  );
  expect(plainEditorText(doc)).not.toContain("*");
  expect(clauseEditorBody(doc, true)).toBe(body);
});

it("drops orphaned markers without giving other clauses rich formatting", () => {
  const draft = fieldNodes(
    clauseEditorDoc("**Fees.** Pay {{oiot.kickoff}}**\n\n*Next line", true),
  );
  expect(clauseEditorBody(draft, true)).toBe(
    "**Fees.** Pay {{oiot.kickoff}}\n\nNext line",
  );
  const plain = "**Fees.** Pay as agreed.\n*Next line";
  expect(clauseEditorBody(clauseEditorDoc(plain))).toBe(plain);
});
