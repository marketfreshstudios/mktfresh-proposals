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
it.each([
  { email_reply_to: "workspace" },
  { countersign_reminder: { mode: "next_morning", days: 1 } },
  {
    reminder_rules: {
      enabled: true,
      unopened_days: 3,
      viewed_days: 7,
      stop_after: 3,
    },
  },
])(
  "Staff cannot change reminder settings; Super admins can: %j",
  async (patch) => {
    const before = await state.fixture.repo.entities("workspace_settings");
    state.actor.staff_role = "member";
    expect((await save(patch)).status).toBe(403);
    expect(await state.fixture.repo.entities("workspace_settings")).toEqual(
      before,
    );
    state.actor.staff_role = "owner";
    const response = await save(patch);
    expect(response.status).toBe(201);
    expect(
      (await state.fixture.repo.entities("workspace_settings"))[0],
    ).toMatchObject(patch);
  },
);
it.each([
  { email_reply_to: "somewhere" },
  { countersign_reminder: { mode: "after_days", days: 0 } },
  {
    countersign_reminder: {
      mode: "after_days",
      days: 1,
      email: "other@example.test",
    },
  },
  {
    reminder_rules: {
      enabled: true,
      unopened_days: 0,
      viewed_days: 7,
      stop_after: 3,
    },
  },
  {
    reminder_rules: {
      enabled: true,
      unopened_days: 3,
      viewed_days: 7,
      stop_after: 0,
    },
  },
  {
    reminder_rules: {
      enabled: true,
      unopened_days: 3.5,
      viewed_days: 7,
      stop_after: 3,
    },
  },
])("rejects invalid rules without saving: %j", async (patch) => {
  const before = await state.fixture.repo.entities("workspace_settings");
  expect((await save(patch)).status).toBe(400);
  expect(await state.fixture.repo.entities("workspace_settings")).toEqual(
    before,
  );
});
