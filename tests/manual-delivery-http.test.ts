import { it, expect, beforeEach, afterEach, vi } from "vitest";
const state = vi.hoisted(() => ({
  fixture: null as any,
  actor: null as any,
  access: true,
}));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => {
    if (!state.access)
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
import { MemoryRepository } from "../src/lib/repository";
beforeEach(async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  state.fixture = await setup();
  state.actor = { ...staff, workspace_id: state.fixture.repo.workspaceId };
  state.access = true;
});
afterEach(() => vi.unstubAllEnvs());
async function call(path: string, input?: unknown) {
  return handle(
    new Request("https://app.example.test/api/" + path, {
      method: input ? "POST" : "GET",
      headers: {
        origin: "https://app.example.test",
        "content-type": "application/json",
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    }),
    path.split("/"),
  );
}
it("manual Send and reminder policy use the authenticated controller and the current revision", async () => {
  const f = state.fixture,
    id = f.draft.id;
  const response = await call(`proposals/${id}/send`, {
    delivery_method: "manual",
    revision: 0,
    pagination: { format: 1, pages: 1, starts: [] },
    body: { type: "invalid" },
    subject: "{{not.a.field}}",
  });
  expect(response.status).toBe(200);
  const p = await response.json();
  expect(p.status).toBe("sent");
  expect(p.token).toHaveLength(43);
  expect(p.jobs).toEqual([]);
  expect((await call(`proposals/${id}/emails`)).status).toBe(200);
  expect(await (await call(`proposals/${id}/emails`)).json()).toEqual([]);
  expect(
    (await call(`proposals/${id}/reminders`, { revision: 0, enabled: true }))
      .status,
  ).toBe(409);
  const toggled = await call(`proposals/${id}/reminders`, {
    revision: p.revision,
    enabled: true,
  });
  expect(toggled.status).toBe(200);
  expect((await toggled.json()).automatic_reminders).toBe(true);
  expect(
    (await call(`proposals/${id}/send`, { delivery_method: "invalid" })).status,
  ).toBe(400);
});
it("an anonymous caller or another workspace cannot fetch the staff link or publish/toggle a proposal", async () => {
  const f = state.fixture,
    id = f.draft.id;
  await f.service.send(id, state.actor, false, undefined, {
    delivery_method: "manual",
  });
  state.access = false;
  for (const [path, input] of [
    [`proposals/${id}`, undefined],
    [`proposals/${id}/send`, { delivery_method: "manual" }],
    [`proposals/${id}/reminders`, { revision: 1, enabled: true }],
  ] as const)
    expect((await call(path, input)).status).toBe(401);
  state.access = true;
  state.fixture = { ...f, repo: new MemoryRepository(crypto.randomUUID()) };
  expect((await call(`proposals/${id}`)).status).toBe(404);
});
