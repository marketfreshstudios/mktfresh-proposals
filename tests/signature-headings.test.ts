import { it, expect } from "vitest";
import { withSignatureHeadings } from "../src/lib/signature-headings";
import { setup, staff } from "./helpers";
it("adds one editable heading before a pair, honors an existing heading and leaves separated signatures in place", () => {
  const pair = [
    { id: "a", type: "signature_block" as const, role: "client" as const },
    { id: "b", type: "signature_block" as const, role: "company" as const },
  ];
  expect(withSignatureHeadings(pair).map((b) => b.type)).toEqual([
    "heading",
    "signature_block",
    "signature_block",
  ]);
  expect(
    withSignatureHeadings([{ type: "heading", text: "Accept" }, ...pair]),
  ).toHaveLength(3);
  expect(
    withSignatureHeadings([
      pair[0],
      { type: "paragraph", text: "More terms" },
      pair[1],
    ]).filter((b) => b.type === "heading"),
  ).toHaveLength(2);
});
it("new drafts get defaults, old drafts migrate once, removals stick, sent versions never change", async () => {
  const { repo, service, draft } = await setup();
  expect(draft.content.some((b) => b.text === "Signatures")).toBe(true);
  draft.content = draft.content.filter((b) => b.text !== "Signatures");
  delete draft.signature_heading_defaulted;
  await repo.save(draft, draft.revision);
  const migrated = await service.forRead(draft);
  expect(migrated.content.some((b) => b.text === "Signatures")).toBe(true);
  migrated.content = migrated.content.filter((b) => b.text !== "Signatures");
  await repo.save(migrated, migrated.revision);
  expect(
    (await service.forRead(migrated)).content.some(
      (b) => b.text === "Signatures",
    ),
  ).toBe(false);
  const sent = await service.send(draft.id, staff);
  const frozen = JSON.stringify(sent.versions);
  await service.forRead(sent);
  expect(JSON.stringify((await repo.get(sent.id))!.versions)).toBe(frozen);
});
