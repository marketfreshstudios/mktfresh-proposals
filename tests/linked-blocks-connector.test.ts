import { it, expect } from "vitest";
import { setup, staff } from "./helpers";
import { aiTool } from "../src/lib/ai-tools";
import { stampSavedBlocks } from "../src/lib/linked-blocks";
import type { SavedBlock, Template } from "../src/lib/model";
it("connector creates, reads and updates groups with protected marker rules and never updates draft copies", async () => {
  const f = await setup(),
    actor = {
      ...staff,
      workspace_id: f.repo.workspaceId,
      actor: "ai:Claude",
      on_behalf_of_user_id: staff.actor.slice(6),
    };
  const call = (
    name: string,
    input: unknown,
    scopes = ["templates:edit", "proposals:read"],
  ) => aiTool(f.repo, actor, name, input, scopes);
  await expect(
    call(
      "create_saved_block",
      {
        name: "Case studies",
        type: "group",
        content: "# Results\n\nWork for {{client.company}}.",
      },
      ["proposals:draft"],
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    call("create_saved_block", {
      name: "Unknown",
      type: "group",
      content: "{{workspace.unknown}}",
    }),
  ).rejects.toThrow(/Unknown field/);
  const created = (await call("create_saved_block", {
    name: "Case studies",
    type: "group",
    content: "# Results\n\nWork for {{client.company}}.",
  })) as any;
  const view = (await call("get_saved_block", {
    saved_block_id: created.saved_block_id,
  })) as any;
  expect(view.type).toBe("group");
  expect(view.content).toContain("<!-- yeswell:block:");
  const row = (await f.repo.entities<SavedBlock>("content_library")).find(
    (r) => r.id === created.saved_block_id,
  )!;
  const template = (await f.repo.entities<Template>("templates"))[0];
  await f.repo.put("templates", {
    ...template,
    content: stampSavedBlocks(row),
  });
  f.draft.content = stampSavedBlocks(row);
  await f.repo.save(f.draft, f.draft.revision);
  const list = (await call("list_saved_blocks", {})) as any[];
  expect(list.find((r) => r.saved_block_id === row.id).used_in).toMatchObject({
    templates: [{ id: template.id }],
    drafts: [{ id: f.draft.id }],
  });
  await expect(
    call("update_saved_block", {
      saved_block_id: row.id,
      revision: view.revision,
      type: "group",
      content: view.content.replace(
        /yeswell:block:[^ ]+/,
        "yeswell:block:unknown",
      ),
    }),
  ).rejects.toThrow(/Unknown|marker/);
  const changed = (await call("update_saved_block", {
    saved_block_id: row.id,
    revision: view.revision,
    type: "group",
    content: view.content.replace("Results", "Updated results"),
  })) as any;
  expect(changed.type).toBe("group");
  expect(
    JSON.stringify((await f.repo.entities<Template>("templates"))[0].content),
  ).toContain("Updated results");
  expect((await f.repo.get(f.draft.id))!.content).toEqual(f.draft.content);
  await expect(
    call("update_saved_block", {
      saved_block_id: row.id,
      revision: view.revision,
      content: "# Stale",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    call("create_saved_block", {
      name: "Forbidden",
      type: "group",
      content: "<div>pricing table</div>",
    }),
  ).rejects.toThrow(/Unsupported Markdown/);
});
it("group marker guards require explicit removal of page breaks and reject duplicates", async () => {
  const f = await setup(),
    actor = {
      ...staff,
      actor: "ai:Claude",
      workspace_id: f.repo.workspaceId,
      on_behalf_of_user_id: staff.actor.slice(6),
    };
  const row: SavedBlock = {
    id: crypto.randomUUID(),
    name: "Two pages",
    type: "group",
    block: { type: "paragraph", text: "First" },
    blocks: [
      { id: crypto.randomUUID(), type: "paragraph", text: "First" },
      { id: crypto.randomUUID(), type: "page_break" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Second" },
    ],
  };
  await f.repo.put("content_library", row);
  const call = (name: string, input: unknown) =>
    aiTool(f.repo, actor, name, input, ["templates:edit", "proposals:read"]);
  const view = (await call("get_saved_block", {
      saved_block_id: row.id,
    })) as any,
    pageBreak = row.blocks![1].id!,
    content = view.content.replace(`<!-- yeswell:block:${pageBreak} -->`, "");
  await expect(
    call("update_saved_block", {
      saved_block_id: row.id,
      revision: view.revision,
      type: "group",
      content,
    }),
  ).rejects.toThrow(/remove_blocks/);
  await expect(
    call("update_saved_block", {
      saved_block_id: row.id,
      revision: view.revision,
      type: "group",
      content: view.content + "\n" + view.content,
    }),
  ).rejects.toThrow(/Duplicated|Duplicate/);
  await expect(
    call("update_saved_block", {
      saved_block_id: row.id,
      revision: view.revision,
      remove_blocks: [pageBreak],
    }),
  ).rejects.toThrow(/requires content/);
  await call("update_saved_block", {
    saved_block_id: row.id,
    revision: view.revision,
    type: "group",
    content,
    remove_blocks: [pageBreak],
  });
  expect(
    (await f.repo.entities<SavedBlock>("content_library")).find(
      (r) => r.id === row.id,
    )!.blocks,
  ).toHaveLength(2);
});
