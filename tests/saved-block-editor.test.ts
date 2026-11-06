import { expect, it, vi } from "vitest";
import {
  convertSavedBlockType,
  savedBlockType,
} from "../src/lib/saved-block-type";
import { MemoryRepository, SupabaseRepository } from "../src/lib/repository";
import type { Block } from "../src/lib/model";
it("safe saved-block conversions preserve fields, marks, IDs and list content", () => {
  const b: Block = {
    id: crypto.randomUUID(),
    type: "paragraph",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [{ type: "bold" }] },
            { type: "variable", attrs: { path: "client.company" } },
          ],
        },
      ],
    },
  };
  const list = convertSavedBlockType(b, "Bulleted list");
  expect(savedBlockType(list)).toBe("Bulleted list");
  expect(list.id).toBe(b.id);
  const numbered = convertSavedBlockType(list, "Numbered list");
  expect(savedBlockType(numbered)).toBe("Numbered list");
  expect(convertSavedBlockType(numbered, "Text")).toEqual({
    ...b,
    text: undefined,
  });
  for (const type of ["contract", "image"] as const) {
    const special = { id: crypto.randomUUID(), type } as Block;
    expect(convertSavedBlockType(special, "Text")).toBe(special);
  }
});
it("saved-block removal deletes only its library copy in its workspace", async () => {
  const r = new MemoryRepository();
  const id = crypto.randomUUID();
  const block = {
    id: crypto.randomUUID(),
    type: "paragraph",
    text: "Keep this copy",
  };
  await r.put("content_library", { id, name: "Reusable", block });
  await r.put("templates", {
    id: crypto.randomUUID(),
    content: [structuredClone(block)],
  });
  expect(await r.removeSavedBlock(id)).toBe(true);
  expect(await r.removeSavedBlock(id)).toBe(false);
  expect((await r.entities<any>("templates"))[0].content).toEqual([block]);
  await r.put("content_library", {
    id,
    workspace_id: crypto.randomUUID(),
    block,
  });
  expect(await r.removeSavedBlock(id)).toBe(false);
});
it("Supabase deletion always filters both workspace and block ID", async () => {
  const calls: any[] = [];
  const query: any = {
    delete: () => {
      calls.push("delete");
      return query;
    },
    eq: (...v: any[]) => {
      calls.push(v);
      return query;
    },
    select: async (v: string) => ({ data: [{ id: "block" }], error: null }),
  };
  const db: any = { from: vi.fn(() => query) };
  const r = new SupabaseRepository(db, "workspace");
  expect(await r.removeSavedBlock("block")).toBe(true);
  expect(db.from).toHaveBeenCalledWith("content_library");
  expect(calls).toEqual([
    "delete",
    ["workspace_id", "workspace"],
    ["id", "block"],
  ]);
});
it("local library deletion survives reopening and leaves template copies", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { LocalRepository } = await import("../src/lib/repository");
  const dir = await mkdtemp(join(tmpdir(), "saved-block-"));
  try {
    const repo = new LocalRepository(dir);
    const id = crypto.randomUUID();
    await repo.put("content_library", {
      id,
      name: "Disposable",
      block: { type: "paragraph", text: "Example" },
    });
    expect(await repo.removeSavedBlock(id)).toBe(true);
    expect(await new LocalRepository(dir).entities("content_library")).toEqual(
      [],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("list style conversion retains nested items and unsupported saved types keep their label", () => {
  const block: Block = {
    id: crypto.randomUUID(),
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
                  content: [{ type: "text", text: "Parent" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "Child",
                              marks: [{ type: "italic" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const ordered = convertSavedBlockType(block, "Numbered list");
  expect(ordered.content!.content![0].content).toEqual(
    block.content!.content![0].content,
  );
  expect(savedBlockType({ type: "pricing_table" })).toBe("Pricing table");
  expect(convertSavedBlockType({ type: "pricing_table" }, "Text")).toEqual({
    type: "pricing_table",
  });
});
