import { it, expect, vi } from "vitest";
import { setup, staff } from "./helpers";
import { AppError, type SavedBlock, type Template } from "../src/lib/model";
import { stampSavedBlocks } from "../src/lib/linked-blocks";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), runtime: vi.fn() }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: mocks.staff,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: mocks.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
const request = (path: string[], method = "GET", value: unknown = {}) =>
  handle(
    new Request(`http://localhost/api/${path.join("/")}`, {
      method,
      ...(method === "GET"
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(value),
          }),
    }),
    path,
  );
it("Staff retains library edit permissions; groups validate, draft scope requires approved IDs, and deletion unlinks without removing content", async () => {
  const f = await setup();
  mocks.runtime.mockReturnValue(f);
  mocks.staff.mockResolvedValue({ ...staff, staff_role: "member" });
  const row: SavedBlock = {
    id: crypto.randomUUID(),
    name: "Case studies",
    block: { id: crypto.randomUUID(), type: "paragraph", text: "First" },
    type: "group",
    blocks: [
      { id: crypto.randomUUID(), type: "paragraph", text: "First" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Second" },
    ],
  };
  expect(
    (
      await request(["content_library"], "POST", {
        ...row,
        blocks: [{ type: "pricing_table" }],
      })
    ).status,
  ).toBe(400);
  const created = await request(["content_library"], "POST", row);
  expect(created.status).toBe(201);
  const saved = await created.json();
  const template = (await f.repo.entities<Template>("templates"))[0];
  await f.repo.put("templates", {
    ...template,
    content: stampSavedBlocks(saved),
  });
  const draft = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      content: [...f.draft.content, ...stampSavedBlocks(saved)],
    },
    staff,
  );
  let view = (await (await request(["content_library"])).json()).find(
    (r: SavedBlock) => r.id === row.id,
  );
  expect(view.used_in).toMatchObject({ template_count: 1, draft_count: 1 });
  const input = {
    ...view,
    expected_revision: view.revision,
    update_drafts: true,
    blocks: [{ type: "paragraph", text: "Updated" }],
  };
  expect((await request(["content_library"], "POST", input)).status).toBe(400);
  expect(
    (
      await request(["content_library"], "POST", {
        ...input,
        update_draft_ids: [draft.id],
      })
    ).status,
  ).toBe(201);
  expect((await f.repo.get(draft.id))!.content.at(-1)!.text).toBe("Updated");
  const before = (await f.repo.get(draft.id))!.content.map((b) => ({ ...b }));
  expect((await request(["content_library", row.id], "DELETE")).status).toBe(
    200,
  );
  const after = (await f.repo.get(draft.id))!.content;
  expect(after.map((b) => b.id)).toEqual(before.map((b) => b.id));
  expect(after.some((b) => b.saved_block_id === row.id)).toBe(false);
  expect(after.at(-1)!.text).toBe("Updated");
  expect(
    (await f.repo.entities<Template>("templates"))[0].content.some(
      (b) => b.saved_block_id === row.id,
    ),
  ).toBe(false);
});
it("anonymous and non-staff requests cannot read or write the library", async () => {
  const f = await setup();
  mocks.runtime.mockReturnValue(f);
  for (const status of [401, 403]) {
    mocks.staff.mockRejectedValue(
      new AppError(
        status,
        status === 401
          ? "Staff authorization required"
          : "Staff access required",
      ),
    );
    expect((await request(["content_library"])).status).toBe(status);
    expect((await request(["content_library"], "POST", {})).status).toBe(
      status,
    );
  }
});
