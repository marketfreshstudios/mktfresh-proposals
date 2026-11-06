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
          business_state: { name: "North Carolina", other: "" },
        }),
      }),
      ["workspace_settings"],
    );
  expect((await save()).status).toBe(403);
  state.actor.staff_role = "owner";
  const result = await save();
  expect(result.status).toBe(201);
  expect((await result.json()).business_state.name).toBe("North Carolina");
  expect(await state.fixture.repo.get(state.fixture.draft.id)).toEqual(before);
});
