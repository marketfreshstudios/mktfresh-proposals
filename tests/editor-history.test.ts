import { expect, it } from "vitest";
import { EditorHistory } from "../src/lib/editor-history";
const original = () => ({
  title: "Proposal",
  content: [
    { id: "a", text: "First" },
    { id: "b", text: "Second" },
  ],
  quote: [
    { id: "x", amount: 100 },
    { id: "y", amount: 200 },
  ],
});
it("undoes block text before document changes without rolling back later reorders", () => {
  const h = new EditorHistory<ReturnType<typeof original>>();
  const a = original(),
    text = structuredClone(a);
  text.content[0].text = "Edited";
  h.record(a, text, "text:a");
  const moved = {
    ...text,
    content: [...text.content].reverse(),
    quote: [...text.quote].reverse(),
  };
  h.record(text, moved);
  const local = h.undo(moved, "text:a");
  expect(local.content).toEqual([
    { id: "b", text: "Second" },
    { id: "a", text: "First" },
  ]);
  expect(local.quote.map((v) => v.id)).toEqual(["y", "x"]);
  const document = h.undo(local, "text:a");
  expect(document).toEqual(a);
  const redo = h.redo(document);
  expect(redo.content.map((v) => v.id)).toEqual(["b", "a"]);
  expect(h.redo(redo, "text:a")).toEqual(moved);
});
it("uses the same delete step for toast undo, retains unrelated edits and supports redo", () => {
  const h = new EditorHistory<ReturnType<typeof original>>(),
    a = original();
  const removed = { ...a, content: [a.content[1]] };
  h.record(a, removed);
  const deletion = h.lastId!;
  const renamed = { ...removed, title: "New title" };
  h.record(removed, renamed);
  const restored = h.undo(renamed, undefined, deletion);
  expect(restored.content).toEqual(a.content);
  expect(restored.title).toBe("New title");
  expect(h.redo(restored).content).toEqual(removed.content);
  expect(h.undo(removed, undefined, -1)).toBe(removed);
});
it("tracks quote amounts, choices, title, insertion, duplication and clause edits", () => {
  const h = new EditorHistory<any>();
  const a = {
    ...original(),
    clauses: [{ id: "c", body: "Terms" }],
    valid_until: "2026-12-01",
  };
  const b = {
    ...a,
    title: "Renamed",
    content: [...a.content, { id: "copy", text: "First" }],
    quote: [
      { ...a.quote[0], amount: 300, default_selected: false },
      a.quote[1],
    ],
    clauses: [{ id: "c", body: "New terms" }],
    valid_until: null,
  };
  h.record(a, b);
  expect(h.undo(b)).toEqual(a);
  expect(h.redo(a)).toEqual(b);
});
it("groups typing only in the same block, caps history at 100 and clears redo after edits", () => {
  const h = new EditorHistory<{ n: number }>();
  h.record({ n: 0 }, { n: 1 }, "text:a", 0);
  h.record({ n: 1 }, { n: 2 }, "text:a", 100);
  expect(h.past).toHaveLength(1);
  expect(h.undo({ n: 2 })).toEqual({ n: 0 });
  h.record({ n: 0 }, { n: 3 }, "text:a", 200);
  expect(h.future).toHaveLength(0);
  for (let n = 3; n < 110; n++)
    h.record({ n }, { n: n + 1 }, "document", n * 1000);
  expect(h.past).toHaveLength(100);
  expect(new EditorHistory().past).toHaveLength(0);
});
it("groups a complete slider drag even when its duration exceeds typing debounce", () => {
  const h = new EditorHistory<{ space: number }>();
  h.beginGroup("slider");
  h.record({ space: 0 }, { space: 10 }, "cover:a", 0);
  h.record({ space: 10 }, { space: 280 }, "cover:a", 2000);
  h.endGroup("slider");
  expect(h.past).toHaveLength(1);
  expect(h.undo({ space: 280 })).toEqual({ space: 0 });
  expect(h.redo({ space: 0 })).toEqual({ space: 280 });
  h.beginGroup("slider");
  h.record({ space: 280 }, { space: 300 }, "cover:a", 3000);
  h.endGroup("slider");
  expect(h.past).toHaveLength(2);
});
