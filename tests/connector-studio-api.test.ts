import { it, expect, vi } from "vitest";
import { setup, staff } from "./helpers";
import { AppError, type Template, type Audit } from "../src/lib/model";
import { studioRevision } from "../src/lib/studio-history";
import { connectorStudioTool } from "../src/lib/connector-studio";
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
const request = (path: string[], method = "GET", body: unknown = {}) =>
  handle(
    new Request(`http://localhost/api/${path.join("/")}`, {
      method,
      ...(method === "GET"
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    }),
    path,
  );
async function fixture() {
  const f = await setup();
  mocks.runtime.mockReturnValue(f);
  mocks.staff.mockResolvedValue(staff);
  const before = (await f.repo.entities<Template>("templates"))[0];
  const after = await connectorStudioTool(
    f.repo,
    {
      actor: "ai:Claude",
      workspace_id: f.repo.workspaceId,
      on_behalf_of_user_id: staff.actor.slice(6),
      on_behalf_of_name: staff.staff_name,
      ip: "",
      user_agent: "MCP",
    },
    "update_template",
    {
      template_id: before.id,
      revision: studioRevision(before),
      name: "Claude copy",
    },
  );
  const event = (await f.repo.entities<Audit>("workspace_events")).find(
    (e) => e.type === "connector_template_updated",
  )!;
  return { ...f, before, after, event };
}
it("staff API redacts snapshots, exposes Restore only to the editor/admin, and requires staff authentication", async () => {
  const f = await fixture();
  let list = await (await request(["templates"])).json();
  expect(
    list.find((r: any) => r.id === f.before.id).connector_restore_event_id,
  ).toBe(f.event.id);
  const activity = await (await request(["workspace_events"])).json(),
    row = activity.find((r: any) => r.id === f.event.id);
  expect(row.metadata.can_restore).toBe(true);
  expect(row.metadata.before).toBeUndefined();
  expect(row.metadata.after).toBeUndefined();
  mocks.staff.mockResolvedValue({
    ...staff,
    actor: `staff:${crypto.randomUUID()}`,
    staff_role: "member",
  });
  expect(
    (await request(["studio-history", f.event.id, "restore"], "POST")).status,
  ).toBe(403);
  list = await (await request(["templates"])).json();
  expect(
    list.find((r: any) => r.id === f.before.id).connector_restore_event_id,
  ).toBeUndefined();
  mocks.staff.mockResolvedValue({ ...staff, staff_role: "member" });
  const restored = await request(
    ["studio-history", f.event.id, "restore"],
    "POST",
  );
  expect(restored.status).toBe(200);
  expect((await restored.json()).name).toBe(f.before.name);
  mocks.staff.mockRejectedValue(
    new AppError(401, "Staff authorization required"),
  );
  expect(
    (await request(["studio-history", f.event.id, "restore"], "POST")).status,
  ).toBe(401);
});
it("normal Studio saves and Restore both refuse a stale revision without replacing staff changes", async () => {
  const f = await fixture(),
    dto = (await (await request(["templates"])).json()).find(
      (r: any) => r.id === f.before.id,
    );
  const saved = await request(["templates"], "POST", {
    ...dto,
    name: "A staff edit",
    expected_revision: dto.revision,
  });
  expect(saved.status).toBe(201);
  expect(
    (
      await request(["templates"], "POST", {
        ...dto,
        name: "A stale save",
        expected_revision: dto.revision,
      })
    ).status,
  ).toBe(409);
  expect(
    (await request(["studio-history", f.event.id, "restore"], "POST")).status,
  ).toBe(409);
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.before.id,
    )?.name,
  ).toBe("A staff edit");
});
