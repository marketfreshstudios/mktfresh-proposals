import { expect, it, vi } from "vitest";
import type { Block } from "../src/lib/model";
import { EditorHistory } from "../src/lib/editor-history";
import { setup, staff } from "./helpers";
import { moveSection } from "../src/lib/editor-document";
import { movePage, movePageSection } from "../src/lib/editor-pages";
import {
  applyDocumentMove,
  assertBlockMove,
  moveAdjacentBlock,
  moveBlockRange,
  moveDocumentBlock,
  moveDocumentBlocksAt,
} from "../src/lib/editor-moves";
const content: Block[] = [
  { id: "overview", type: "heading", text: "Overview" },
  {
    id: "list",
    type: "paragraph",
    content: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Keep this list" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  { id: "investment", type: "heading", text: "Investment" },
  { id: "pricing", type: "pricing_table" },
  { id: "break1", type: "page_break" },
  { id: "terms", type: "heading", text: "Terms" },
  { id: "body", type: "paragraph", text: "Keep the terms" },
  { id: "break2", type: "page_break" },
  { id: "acceptance", type: "heading", text: "Acceptance" },
  { id: "client", type: "signature_block", role: "client" },
  { id: "company", type: "signature_block", role: "company" },
];
it("editing a moved section never reruns create-time heading deletion", async () => {
  const { service, draft } = await setup();
  const p = await service.edit(
    draft.id,
    {
      revision: draft.revision,
      content: [
        { id: "overview", type: "heading", text: "Overview" },
        { id: "body", type: "paragraph", text: "Keep this overview" },
        { id: "title-field", type: "heading", text: "{{proposal.title}}" },
      ],
    },
    staff,
  );
  const moved = moveSection(p.content, "title-field", "overview");
  const saved = await service.edit(
    p.id,
    { revision: p.revision, content: moved },
    staff,
  );
  expect(saved.content).toEqual(moved);
  expect(saved.content.map((b) => b.id)).toEqual([
    "title-field",
    "overview",
    "body",
  ]);
});
const cases: [string, (blocks: Block[]) => Block[], string[]][] = [
  [
    "first section to bottom",
    (b) => moveSection(b, "overview", "acceptance"),
    [
      "investment",
      "pricing",
      "break1",
      "terms",
      "body",
      "break2",
      "acceptance",
      "client",
      "company",
      "overview",
      "list",
    ],
  ],
  [
    "last section to top",
    (b) => moveSection(b, "acceptance", "overview"),
    [
      "acceptance",
      "client",
      "company",
      "overview",
      "list",
      "investment",
      "pricing",
      "break1",
      "terms",
      "body",
      "break2",
    ],
  ],
  [
    "section to another page",
    (b) => movePageSection(b, "overview", "break1", "terms"),
    [
      "investment",
      "pricing",
      "break1",
      "overview",
      "list",
      "terms",
      "body",
      "break2",
      "acceptance",
      "client",
      "company",
    ],
  ],
  [
    "same page section to top",
    (b) => movePageSection(b, "investment", "start", "overview"),
    [
      "investment",
      "pricing",
      "overview",
      "list",
      "break1",
      "terms",
      "body",
      "break2",
      "acceptance",
      "client",
      "company",
    ],
  ],
  [
    "same page section to bottom",
    (b) => movePageSection(b, "overview", "start"),
    [
      "investment",
      "pricing",
      "overview",
      "list",
      "break1",
      "terms",
      "body",
      "break2",
      "acceptance",
      "client",
      "company",
    ],
  ],
  [
    "first section down control",
    (b) => moveAdjacentBlock(b, "overview", 1),
    [
      "investment",
      "pricing",
      "overview",
      "list",
      "break1",
      "terms",
      "body",
      "break2",
      "acceptance",
      "client",
      "company",
    ],
  ],
  [
    "last section up control across page break",
    (b) => moveAdjacentBlock(b, "acceptance", -1),
    [
      "overview",
      "list",
      "investment",
      "pricing",
      "break1",
      "acceptance",
      "client",
      "company",
      "terms",
      "body",
      "break2",
    ],
  ],
  [
    "document section drag with pricing",
    (b) => moveDocumentBlock(b, "investment", "company"),
    [
      "overview",
      "list",
      "break1",
      "terms",
      "body",
      "break2",
      "acceptance",
      "client",
      "company",
      "investment",
      "pricing",
    ],
  ],
];
for (const [name, operation, ids] of cases)
  it(`${name}: preserves exact blocks and undo restores original`, () => {
    const before = structuredClone(content),
      history = new EditorHistory<Block[]>();
    const next = operation(content);
    expect(next.map((b) => b.id)).toEqual(ids);
    expect(assertBlockMove(before, next)).toBe(next);
    expect(content).toEqual(before);
    for (const block of next)
      expect(block).toBe(content.find((b) => b.id === block.id));
    history.record(before, next);
    expect(history.undo(next)).toEqual(before);
    expect(history.redo(before)).toEqual(next);
  });
it("every first/last page permutation preserves all page-break IDs and undoes exactly", () => {
  for (const from of ["start", "break1", "break2"])
    for (const to of ["start", "break1", "break2"]) {
      const before = structuredClone(content),
        next = movePage(content, from, to),
        history = new EditorHistory<Block[]>();
      expect(assertBlockMove(before, next)).toBe(next);
      history.record(before, next);
      expect(history.undo(next)).toEqual(before);
    }
});
it("unheaded Overview ranges stop at the page boundary and keep every original block", () => {
  const unheaded = content.filter((b) => b.id !== "overview");
  const next = moveSection(unheaded, "list", "acceptance");
  expect(next.at(-1)?.id).toBe("list");
  expect(assertBlockMove(unheaded, next)).toBe(next);
  expect(next.filter((b) => b.type === "page_break").map((b) => b.id)).toEqual([
    "break1",
    "break2",
  ]);
});
it("all source ranges and original insertion boundaries retain a complete permutation", () => {
  for (let start = 0; start < content.length; start++)
    for (let end = start + 1; end <= content.length; end++)
      for (let at = 0; at <= content.length; at++)
        expect(
          assertBlockMove(content, moveBlockRange(content, start, end, at)),
        ).toHaveLength(content.length);
});
it("aborts loss, duplication, ID replacement and mutation before any commit, with an error", () => {
  for (const operation of [
    (b: Block[]) => b.slice(1),
    (b: Block[]) => [b[0], ...b.slice(0, -1)],
    (b: Block[]) => b.map((v, n) => (n ? v : { ...v, id: "replacement" })),
    (b: Block[]) => {
      b[0].text = "Changed";
      return b;
    },
  ]) {
    const before = structuredClone(content),
      commit = vi.fn(),
      error = vi.fn();
    expect(applyDocumentMove(content, operation, commit, error)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Move cancelled"),
    );
    expect(content).toEqual(before);
  }
});

it("pointer boundaries move exact selected members in document order without changing page markers", () => {
  const next = moveDocumentBlocksAt(content, "list", 7, ["list", "pricing"]);
  expect(next.slice(5, 7).map((b) => b.id)).toEqual(["list", "pricing"]);
  expect(assertBlockMove(content, next)).toBe(next);
  const history = new EditorHistory<Block[]>();
  history.record(content, next);
  expect(history.undo(next)).toEqual(content);
  expect(history.redo(content)).toEqual(next);
});
it("pointer moves keep whole sections and accept an empty page's source boundary", () => {
  const blocks: Block[] = [
    { id: "a", type: "paragraph", text: "a" },
    { id: "p", type: "page_break" },
    { id: "empty", type: "page_break" },
    { id: "h", type: "heading", text: "H" },
    { id: "b", type: "paragraph", text: "b" },
  ];
  const next = moveDocumentBlocksAt(blocks, "h", 2);
  expect(next.map((b) => b.id)).toEqual(["a", "p", "h", "b", "empty"]);
  expect(assertBlockMove(blocks, next)).toBe(next);
  expect(() => moveDocumentBlocksAt(blocks, "h", -1)).toThrow("Move cancelled");
});
