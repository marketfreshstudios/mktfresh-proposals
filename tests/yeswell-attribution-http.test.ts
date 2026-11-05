import { it, expect, vi } from "vitest";
import { setup, staff } from "./helpers";
const mock = vi.hoisted(() => ({ staff: vi.fn(), runtime: vi.fn() }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: mock.staff,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: mock.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
it("only a super admin can change the attribution switch", async () => {
  const f = await setup();
  mock.runtime.mockReturnValue(f);
  const change = () =>
    handle(
      new Request("https://app.example.test/api/workspace_settings", {
        method: "POST",
        headers: {
          origin: "https://app.example.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...f.settings, show_powered_by: false }),
      }),
      ["workspace_settings"],
    );
  mock.staff.mockResolvedValue({
    ...staff,
    staff_role: "member",
    workspace_id: f.repo.workspaceId,
  });
  expect((await change()).status).toBe(403);
  expect(
    (await f.repo.entities<any>("workspace_settings"))[0].show_powered_by,
  ).not.toBe(false);
  mock.staff.mockResolvedValue({ ...staff, workspace_id: f.repo.workspaceId });
  expect((await change()).status).toBe(201);
  expect(
    (await f.repo.entities<any>("workspace_settings"))[0].show_powered_by,
  ).toBe(false);
});
