import { expect, it } from "vitest";
import type { Block } from "../src/lib/model";
import {
  addPage,
  authoringPages,
  deletePage,
  movePage,
  movePageSection,
} from "../src/lib/editor-pages";
const content: Block[] = [
  { id: "a", type: "heading", level: 1, text: "A" },
  { id: "a2", type: "heading", level: 2, text: "Detail" },
  { id: "p", type: "paragraph", text: "Body" },
  { id: "break", type: "page_break" },
  { id: "b", type: "heading", level: 1, text: "B" },
  { id: "c", type: "heading", level: 1, text: "C" },
];
it("groups explicit pages and nests only H1 sections", () => {
  const pages = authoringPages(content);
  expect(pages).toHaveLength(2);
  expect(pages[0].sections.map((s) => s.title)).toEqual(["A"]);
  expect(pages[0].sections[0].indices).toEqual([0, 1, 2]);
  expect(pages[1].sections.map((s) => s.title)).toEqual(["B", "C"]);
});
it("moves whole pages and retains every non-marker block and its content", () => {
  const before = structuredClone(content),
    moved = movePage(content, "start", "break");
  expect(moved.filter((b) => b.type !== "page_break").map((b) => b.id)).toEqual(
    ["b", "c", "a", "a2", "p"],
  );
  expect(moved.filter((b) => b.type === "page_break")).toHaveLength(1);
  expect(content).toEqual(before);
});
it("moves a section across pages with its subheadings and paragraphs", () => {
  const moved = movePageSection(content, "a", "break", "c");
  expect(authoringPages(moved)[1].blocks.map((b) => b.id)).toEqual([
    "b",
    "a",
    "a2",
    "p",
    "c",
  ]);
  expect(authoringPages(moved)[0].blocks).toHaveLength(0);
});
it("adds a page after the selected page with a new H1, and deletion removes its content", () => {
  const next = addPage(content, "start"),
    pages = authoringPages(next.content);
  expect(pages).toHaveLength(3);
  expect(pages[1].blocks).toEqual([
    { id: next.heading, type: "heading", level: 1, text: "" },
  ]);
  expect(deletePage(next.content, pages[1].id)).toEqual(content);
});
