import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ fixture: null as any, actor: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => state.actor,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  allRuntimes: vi.fn(),
  publicRuntime: vi.fn(),
}));
import { handle } from "../src/lib/http";
import { setup, staff } from "./helpers";
beforeEach(async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  state.fixture = await setup();
  state.actor = { ...staff, workspace_id: state.fixture.repo.workspaceId };
});
afterEach(() => vi.unstubAllEnvs());
async function save(patch: unknown) {
  return handle(
    new Request("https://app.example.test/api/workspace_settings", {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...state.fixture.settings, ...(patch as object) }),
    }),
    ["workspace_settings"],
  );
}
it("only Super admins can change payment methods; old settings default to Card", async () => {
  const before = await state.fixture.repo.entities("workspace_settings");
  state.actor.staff_role = "member";
  expect((await save({ payment_methods: "card_ach" })).status).toBe(403);
  expect(await state.fixture.repo.entities("workspace_settings")).toEqual(
    before,
  );
  expect((await save({ payment_methods: "card" })).status).toBe(201);
  state.actor.staff_role = "owner";
  expect((await save({ payment_methods: "card_ach" })).status).toBe(201);
  expect(
    (await state.fixture.repo.entities("workspace_settings"))[0],
  ).toMatchObject({ payment_methods: "card_ach" });
  expect((await save({ payment_methods: "live" })).status).toBe(400);
  state.actor.staff_role = "member";
  expect((await save({ payment_methods: "card" })).status).toBe(403);
});
