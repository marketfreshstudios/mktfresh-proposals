import { expect, it, vi, afterEach } from "vitest";
import { setup, staff } from "./helpers";
const state = vi.hoisted(() => ({ fixture: null as any, actor: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => state.actor,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  publicRuntime: async () => state.fixture,
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
afterEach(() => vi.unstubAllEnvs());
it("only Super admins can update Business state, through the existing JSON settings; proposals stay unchanged", async () => {
  vi.stubEnv("APP_URL", "http://localhost");
  vi.stubEnv("APP_MODE", "local");
  state.fixture = await setup();
  state.actor = {
    ...staff,
    workspace_id: state.fixture.repo.workspaceId,
    staff_role: "member",
  };
  const before = await state.fixture.repo.get(state.fixture.draft.id);
  const save = () =>
    handle(
      new Request("http://localhost/api/workspace_settings", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...state.fixture.settings,
          business_state: { name: "Virginia", other: "" },
        }),
      }),
      ["workspace_settings"],
    );
  expect((await save()).status).toBe(403);
  state.actor.staff_role = "owner";
  const result = await save();
  expect(result.status).toBe(201);
  expect((await result.json()).business_state.name).toBe("Virginia");
  expect(await state.fixture.repo.get(state.fixture.draft.id)).toEqual(before);
});

it("blocks sending an ordinary draft until State is set, then snapshots the entered state and legal name", async () => {
  const f = await setup();
  const previous = f.settings.business_state;
  delete f.settings.business_state;
  await f.repo.put("workspace_settings", f.settings);
  expect((await f.service.checkReady(f.draft)).errors).toContain(
    "Add your business state",
  );
  await expect(f.service.send(f.draft.id, staff)).rejects.toThrow(
    "Add your business state",
  );
  f.settings.business_state = previous;
  f.settings.business_name = "Example Studio LLC";
  await f.repo.put("workspace_settings", f.settings);
  const sent = await f.service.send(f.draft.id, staff);
  expect(sent.versions[0].variables_resolved["workspace.name"]).toBe(
    "Example Studio LLC",
  );
  expect(sent.versions[0].variables_resolved["business.state"]).toBe(
    "North Carolina",
  );
  await f.repo.put("workspace_settings", {
    ...f.settings,
    business_name: "Example Agency",
    business_state: { name: "New York", other: "" },
  });
  expect((await f.service.forRead(sent)).versions).toEqual(sent.versions);
});
