import { expect, test } from "vitest";
import { setup, staff } from "./helpers";
import { createColumns } from "../src/lib/columns";
import type { Block, SavedBlock, Template } from "../src/lib/model";
import { ProposalService } from "../src/lib/service";
import { pdfPreview } from "../src/lib/pdf-preview";
import { aiTool } from "../src/lib/ai-tools";
import { stampSavedBlocks } from "../src/lib/linked-blocks";
import { validateSavedBlock } from "../src/lib/saved-blocks";
import { validatePagePlan } from "../src/lib/page-plan";

test("real Letter measurement protects Send and keeps the previous live Columns version", async () => {
  const f = await setup();
  const service = new ProposalService(
    f.repo,
    undefined,
    async () => f.members,
    undefined,
    async (p) =>
      (
        await pdfPreview(
          f.repo,
          {
            get: async () => new Uint8Array(),
            put: async () => {
              throw new Error("Unexpected file write");
            },
          },
          p,
          f.settings,
        )
      ).layout,
  );
  const grid: Block = {
    id: "columns",
    type: "columns",
    columns: createColumns(),
  };
  const document = (text: string, padding?: "s" | "l"): Block[] => [
    { id: "cover-break", type: "page_break" },
    {
      ...grid,
      ...(padding ? { style: { padding } } : {}),
      columns: {
        ...grid.columns!,
        items: grid.columns!.items.map((column, index) => ({
          ...column,
          content: [
            {
              id: `child-${index}`,
              type: "paragraph",
              text: index ? "Next steps" : text,
            },
          ],
        })),
      },
    },
    { id: "quote", type: "pricing_table" },
    { id: "client", type: "signature_block", role: "client" },
    { id: "company", type: "signature_block", role: "company" },
  ];
  const tall = document(
    "This text makes the first column exceed the height of a Letter sheet. ".repeat(
      160,
    ),
  );
  const short = document("A short client case study.", "s");
  const draft = await service.edit(
    f.draft.id,
    { revision: f.draft.revision, content: tall },
    staff,
  );
  expect(draft.content[1].columns!.items[0].content[0].text).toBe(
    tall[1].columns!.items[0].content[0].text,
  );
  await expect(service.send(draft.id, staff)).rejects.toThrow(
    /Columns exceed a Letter page by \d+px/,
  );
  const revised = await service.edit(
    draft.id,
    { revision: draft.revision, content: short },
    staff,
  );
  const published = await service.send(revised.id, staff);
  const version = structuredClone(published.versions.at(-1)!);
  const blocked = await service.edit(
    published.id,
    { revision: published.revision, content: tall },
    staff,
  );
  expect(blocked.live_blockers).toEqual([
    expect.stringMatching(/Columns exceed a Letter page by \d+px/),
  ]);
  expect(blocked.versions).toEqual([version]);
  expect(blocked.token).toBe(published.token);
  const ready = await service.edit(
    blocked.id,
    {
      revision: blocked.revision,
      content: document("A short client case study.", "l"),
    },
    staff,
  );
  expect(ready.live_blockers).toBeUndefined();
  expect(ready.versions).toHaveLength(2);
  expect(ready.versions[0]).toEqual(version);
  expect(
    ready.versions[1].content.find((b) => b.type === "columns")?.style,
  ).toEqual({ padding: "l" });
  expect(ready.token).toBe(published.token);
}, 30000);

test("stored Columns and styled saved groups survive connector Markdown markers", async () => {
  const f = await setup();
  const columns = createColumns();
  columns.items[0].style = { padding: "m", border: "thin" };
  columns.items[0].content = [
    {
      id: "styled-case",
      type: "paragraph",
      text: "Case study",
      style: { background: "neutral" },
    },
  ];
  const row = validateSavedBlock({
    id: crypto.randomUUID(),
    name: "Layout and case study",
    type: "group",
    block: { id: "cols", type: "columns", columns },
    blocks: [
      { id: "cols", type: "columns", columns },
      {
        id: "description",
        type: "paragraph",
        text: "Initial wording",
        style: { padding: "m", background: "#eeeeee" },
      },
    ],
  });
  await f.repo.put("content_library", row);
  const actor = {
    ...staff,
    actor: "ai:Claude",
    workspace_id: f.repo.workspaceId,
    on_behalf_of_user_id: staff.actor.slice(6),
  };
  const call = (name: string, input: unknown) =>
    aiTool(f.repo, actor, name, input, [
      "templates:edit",
      "proposals:read",
    ]) as Promise<{ content: string; revision: string }>;
  const saved = await call("get_saved_block", { saved_block_id: row.id });
  expect(saved.content).toContain("<!-- yeswell:block:cols -->");
  await call("update_saved_block", {
    saved_block_id: row.id,
    revision: saved.revision,
    type: "group",
    content: saved.content.replace("Initial wording", "New wording"),
  });
  const updated = (await f.repo.entities<SavedBlock>("content_library")).find(
    (b) => b.id === row.id,
  )!;
  expect(updated.blocks?.[0]).toEqual(row.blocks?.[0]);
  expect(updated.blocks?.[1].style).toEqual(row.blocks?.[1].style);

  const template = (await f.repo.entities<Template>("templates"))[0];
  const stamped = stampSavedBlocks(updated);
  await f.repo.put("templates", { ...template, content: stamped });
  const view = await call("get_template", { template_id: template.id });
  await call("update_template", {
    template_id: template.id,
    revision: view.revision,
    content: view.content.replace("New wording", "Updated wording"),
  });
  const reread = (await f.repo.entities<Template>("templates"))[0];
  expect(reread.content.find((b) => b.type === "columns")).toEqual(stamped[0]);
  expect(reread.content.find((b) => b.id === stamped[1].id)?.style).toEqual(
    stamped[1].style,
  );
});

test("PagePlan v1 accepts only whole Columns boundaries", () => {
  const block: Block = {
    id: "grid",
    type: "columns",
    columns: createColumns(),
  };
  const boundary = { page: 2, block: block.id!, offset: 0, explicit: false };
  expect(
    validatePagePlan({ format: 1, pages: 2, starts: [boundary] }, [block]),
  ).toEqual({
    format: 1,
    pages: 2,
    starts: [boundary],
  });
  expect(() =>
    validatePagePlan(
      { format: 1, pages: 2, starts: [{ ...boundary, offset: 1 }] },
      [block],
    ),
  ).toThrow("cannot split");
});
