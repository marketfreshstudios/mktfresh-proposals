import { expect, it, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({ fixture: null as any, actor: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => {
    if (!state.actor)
      throw new (await import("../src/lib/model")).AppError(
        401,
        "Staff authorization required",
      );
    return state.actor;
  },
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  allRuntimes: vi.fn(),
  publicRuntime: vi.fn(),
}));
import { handle } from "../src/lib/http";
import { setup, staff } from "./helpers";
beforeEach(async () => {
  state.fixture = await setup();
  state.actor = { ...staff, workspace_id: state.fixture.repo.workspaceId };
});
function remove(id: string) {
  return handle(
    new Request(`http://localhost/api/content_library/${id}`, {
      method: "DELETE",
      headers: { origin: "http://localhost" },
    }),
    ["content_library", id],
  );
}
it("saved-block delete requires staff, stays workspace scoped and records activity", async () => {
  const id = crypto.randomUUID();
  await state.fixture.repo.put("content_library", {
    id,
    name: "A reusable block",
    block: { type: "paragraph", text: "Original" },
  });
  state.actor = null;
  expect((await remove(id)).status).toBe(401);
  state.actor = {
    ...staff,
    staff_role: "member",
    workspace_id: state.fixture.repo.workspaceId,
  };
  expect((await remove(crypto.randomUUID())).status).toBe(404);
  expect((await remove(id)).status).toBe(200);
  expect((await remove(id)).status).toBe(404);
  const events = await state.fixture.repo.entities("workspace_events");
  expect(
    events.some(
      (e: any) =>
        e.type === "content_library_deleted" && e.metadata.entity_id === id,
    ),
  ).toBe(true);
});
