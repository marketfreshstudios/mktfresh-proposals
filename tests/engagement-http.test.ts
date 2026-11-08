import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const state = vi.hoisted(() => ({ rt: null as any, user: null as any }));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.rt,
  publicRuntime: () => state.rt,
  allRuntimes: async () => [state.rt],
}));
vi.mock("../src/lib/auth", async (original) => {
  const actual = await original<typeof import("../src/lib/auth")>();
  const { AppError } = await import("../src/lib/model");
  return {
    ...actual,
    staff: async (req: Request) => {
      if (!req.headers.has("authorization"))
        throw new AppError(401, "Staff required");
      return state.user;
    },
  };
});
import { handle } from "../src/lib/http";
import { setup, staff } from "./helpers";
let dir = "",
  token = "",
  id = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "engagement-test-"));
  vi.stubEnv("APP_MODE", "local");
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("APP_URL", "https://app.example.test");
  const f = await setup();
  const p = await f.service.send(f.draft.id, staff);
  token = p.token!;
  id = p.id;
  state.rt = { ...f, worker: { providers: { qbo: {} } } };
  state.user = { ...staff, workspace_id: f.repo.workspaceId };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
const input = () => ({
  session_id: crypto.randomUUID(),
  browser_id: crypto.randomUUID(),
  device: "desktop",
  intent: "read",
  activity: "pointer",
});
function req(
  path: string,
  data?: unknown,
  headers: Record<string, string> = {},
) {
  return handle(
    new Request(`https://app.example.test/api/${path}`, {
      method: data ? "POST" : "GET",
      headers: {
        origin: "https://app.example.test",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 Chrome/130",
        ...headers,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    path.split("/"),
  );
}
it("public GETs/scanners/prefetch/staff previews never count; only qualified client start sets the same viewed fact once", async () => {
  expect((await req(`public/${token}`)).status).toBe(200);
  expect((await state.rt.repo.get(id)).first_viewed_at).toBeNull();
  for (const headers of [
    { "user-agent": "Slackbot" },
    { "sec-purpose": "prefetch" },
    { cookie: "proposal_session=staff" },
    { authorization: "Bearer staff" },
  ] as Record<string, string>[]) {
    expect(
      await (
        await req(`public/${token}/engagement/start`, input(), headers)
      ).json(),
    ).toEqual({ ignored: true });
  }
  expect(await state.rt.repo.engagementSummary(id)).toBeNull();
  const payload = input();
  const start = await req(`public/${token}/engagement/start`, payload);
  expect(start.status).toBe(200);
  expect(await start.json()).toMatchObject({
    ticket: expect.any(String),
    targets: expect.any(Array),
  });
  await req(`public/${token}/engagement/start`, payload);
  const p = await state.rt.repo.get(id);
  expect(p.status).toBe("viewed");
  expect(p.events.filter((e: any) => e.type === "viewed")).toHaveLength(1);
  expect(p.jobs.some((j: any) => j.id.includes(":notify:viewed:"))).toBe(false);
  const report = await (
    await req(`proposals/${id}/engagement`, undefined, {
      authorization: "Bearer staff",
    })
  ).json();
  expect(report).toMatchObject({ views: 1, unique_viewers: 1, total_ms: 0 });
  expect(JSON.stringify(report)).not.toMatch(
    /viewer\":|browser_id|127\.0\.0\.1|ip\":/,
  );
});
it("engagement is token/password/origin validated; staff reports never leak publicly", async () => {
  const { hashPassword } = await import("../src/lib/content");
  const { mutate } = await import("../src/lib/repository");
  await mutate(state.rt.repo, id, (p) => {
    p.password_hash = hashPassword("safe-test-password");
  });
  expect((await req(`public/${token}/engagement/start`, input())).status).toBe(
    401,
  );
  expect(
    (
      await req(`public/${token}/engagement/start`, input(), {
        origin: "https://other.example.test",
      })
    ).status,
  ).toBe(403);
  const start = await req(`public/${token}/engagement/start`, input(), {
    "x-proposal-password": "safe-test-password",
  });
  expect(start.status).toBe(200);
  const { ticket } = await start.json();
  const snapshot = {
    seq: 2,
    active_ms: 0,
    targets: {},
    actions: [],
    ended: false,
  };
  expect(
    (await req(`public/${token}/engagement`, { ticket, snapshot })).status,
  ).toBe(200); // Beacon needs no password or staff cookie.
  expect(
    (await req(`public/${token}/engagement`, { ticket: "bad", snapshot }))
      .status,
  ).toBe(403);
  expect((await req(`proposals/${id}/engagement`)).status).toBe(401);
  expect((await req("engagement")).status).toBe(401);
  expect((await req(`public/${token}/engagement`)).status).toBe(404);
});
it("new notification controls use existing Super-admin-only workspace autosave", async () => {
  const data = {
    ...state.rt.settings,
    engagement_notifications: { in_app: false, email: true },
  };
  state.user.staff_role = "member";
  expect(
    (await req("workspace_settings", data, { authorization: "Bearer staff" }))
      .status,
  ).toBe(403);
  state.user.staff_role = "owner";
  expect(
    (await req("workspace_settings", data, { authorization: "Bearer staff" }))
      .status,
  ).toBe(201);
  expect(
    (await state.rt.repo.entities("workspace_settings"))[0]
      .engagement_notifications,
  ).toEqual(data.engagement_notifications);
});

it("durable token-level quota returns 429 with Retry-After even for duplicate starts", async () => {
  const payload = input();
  expect((await req(`public/${token}/engagement/start`, payload)).status).toBe(
    200,
  );
  state.rt.repo.catalog
    .get("engagement_local_limits")
    .set(id, { bucket: Math.floor(Date.now() / 600000), count: 600 });
  const response = await req(`public/${token}/engagement/start`, payload);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("600");
  expect((await state.rt.repo.engagementSummary(id)).views).toBe(1);
});
