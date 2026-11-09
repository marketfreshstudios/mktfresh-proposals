import { expect, test } from "vitest";
import {
  changeColumnLayout,
  columnRejection,
  columnsSchema,
  createColumns,
  moveBlocksAcrossColumns,
  unwrapColumns,
} from "../src/lib/columns";
import type { Block } from "../src/lib/model";

test("every layout preserves its columns and 3 to 2 appends the third column", () => {
  const first: Block = { id: "one", type: "heading" };
  const second: Block = {
    id: "two",
    type: "paragraph",
    style: { padding: "m" },
  };
  const third: Block = { id: "three", type: "image" };
  const columns = changeColumnLayout(createColumns(), "33-33-33");
  columns.items[0].content = [first];
  columns.items[1].content = [second];
  columns.items[2].content = [third];
  for (const layout of ["50-50", "33-67", "67-33"] as const) {
    const resized = changeColumnLayout(columns, layout);
    expect(columnsSchema.parse(resized).items.map((c) => c.content)).toEqual([
      [first],
      [second, third],
    ]);
    expect(resized.items[1].id).toBe(columns.items[1].id);
  }
  const intro: Block = { type: "paragraph", id: "intro" };
  const end: Block = { type: "paragraph", id: "end" };
  expect(
    unwrapColumns(
      [intro, { id: "group", type: "columns", columns }, end],
      "group",
    ),
  ).toEqual([intro, first, second, third, end]);
  expect(columns.items).toHaveLength(3);
});

test("column insertion accepts ordinary content and explains protected blocks", () => {
  expect(
    columnRejection([{ type: "paragraph" }, { type: "image" }]),
  ).toBeUndefined();
  for (const [type, reason] of [
    ["columns", "can't be nested"],
    ["pricing_table", "Pricing tables stay outside"],
    ["contract", "Contracts stay outside"],
    ["signature_block", "Signatures stay outside"],
    ["page_break", "Page breaks go between blocks"],
  ] as const)
    expect(columnRejection([{ type: "heading" }, { type }])).toContain(reason);
});

test("moves an explicit selection into and out of columns in document order", () => {
  const columns = createColumns();
  const doc: Block[] = [
    { type: "heading", id: "heading" },
    { type: "paragraph", id: "paragraph", style: { padding: "m" } },
    { type: "pricing_table", id: "quote" },
    { type: "columns", id: "columns", columns },
  ];
  const inside = { block: "columns", column: columns.items[0].id };
  const before = structuredClone(doc);
  const insideResult = moveBlocksAcrossColumns(doc, ["paragraph", "heading"], {
    at: 0,
    inside,
  });
  expect(insideResult.map((block) => block.id)).toEqual(["quote", "columns"]);
  expect(insideResult[1].columns?.items[0].content).toEqual(doc.slice(0, 2));
  expect(
    moveBlocksAcrossColumns(insideResult, ["heading", "paragraph"], { at: 0 }),
  ).toEqual(before);
  expect(() =>
    moveBlocksAcrossColumns(doc, ["quote"], { at: 0, inside }),
  ).toThrow("Pricing tables stay outside columns.");
  expect(doc).toEqual(before);
});
