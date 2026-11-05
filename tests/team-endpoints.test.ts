import { beforeEach, afterEach, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: null as any, fixture: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => state.actor,
  workspaceStaff: async () => state.fixture.team.list(),
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
vi.mock("../src/lib/team-runtime", () => ({
  teamService: () => state.fixture.team,
}));
import { handle } from "../src/lib/http";
import { teamFixture } from "./fixtures/team";
beforeEach(async () => {
  vi.stubEnv("APP_MODE", "supabase");
  vi.stubEnv("APP_URL", "https://app.example.test");
  state.fixture = await teamFixture();
  state.actor = state.fixture.admin;
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
it("every team management endpoint rejects Staff server-side, while list and own name remain available", async () => {
  const f = state.fixture;
  state.actor = f.member;
  expect((await call("team")).status).toBe(200);
  expect(
    (
      await call("team/invite", {
        email: "new@example.test",
        display_name: "New",
      })
    ).status,
  ).toBe(403);
  for (const action of [
    "name",
    "role",
    "password_set",
    "deactivate",
    "reactivate",
    "remove",
    "reset_sent",
    "invite_resent",
  ]) {
    const response = await call("team/" + f.admin.actor.slice(6), {
      action,
      role: "member",
      password: "Private test password!",
    });
    expect(response.status, action).toBe(403);
  }
  const own = await call("team/" + f.member.actor.slice(6), {
    display_name: "My new name",
  });
  expect(own.status).toBe(200);
  expect(f.store.history).toHaveLength(1);
});
it("Super admin mutations succeed, audit actions, and never put a supplied password in JSON", async () => {
  const f = state.fixture;
  const invite = await call("team/invite", {
    email: "new@example.test",
    display_name: "New staff",
  });
  expect(invite.status).toBe(201);
  const added = await invite.json();
  for (const payload of [
    { action: "invite_resent" },
    {
      action: "password_set",
      password: "Secret new password!",
      choose_new_password: true,
    },
    { action: "role", role: "owner" },
    { action: "name", display_name: "New name" },
    { action: "reset_sent" },
    { action: "deactivate" },
    { action: "reactivate" },
    { action: "remove" },
  ]) {
    const response = await call("team/" + added.user_id, payload);
    expect(response.status, payload.action).toBe(200);
    expect(await response.text()).not.toContain("Secret new password!");
  }
  const data = await (await call("team")).json();
  expect(data.members.some((m: any) => m.user_id === added.user_id)).toBe(
    false,
  );
  expect(data.recent.map((e: any) => e.action)).toEqual([
    "remove",
    "reactivate",
    "deactivate",
    "reset_sent",
    "name",
    "role",
    "password_set",
    "invite_resent",
    "invite",
  ]);
});
it("blocked removal lists unfinished proposals and offers Deactivate without removing or banning the person", async () => {
  const f = state.fixture,
    id = f.member.actor.slice(6),
    p = await f.repo.get(f.draft.id);
  p.created_by = "staff:" + id;
  await f.repo.save(p, p.revision);
  const response = await call("team/" + id, { action: "remove" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: expect.stringContaining("Deactivate"),
    unfinished_proposals: [{ id: p.id, title: p.title }],
  });
  expect(f.auth.banned.has(id)).toBe(false);
  expect(await f.store.get(id)).toBeTruthy();
});

it("proposal handoff endpoints enforce ownership and bulk admin permission with current revisions", async () => {
  const f = state.fixture,
    id = f.draft.id;
  state.actor = f.member;
  const input = {
    user_id: f.member.actor.slice(6),
    revision: 0,
    notify: false,
  };
  expect((await call(`proposals/${id}/reassign`, input)).status).toBe(403);
  expect((await call(`team/${f.admin.actor.slice(6)}/proposals`)).status).toBe(
    403,
  );
  expect(
    (
      await call("team/reassign", {
        user_id: f.member.actor.slice(6),
        notify: false,
        from_user_id: f.admin.actor.slice(6),
        proposals: [{ id, revision: 0 }],
      })
    ).status,
  ).toBe(403);
  state.actor = f.admin;
  const response = await call(`proposals/${id}/reassign`, input);
  expect(response.status).toBe(200);
  expect((await response.json()).owner.user_id).toBe(f.member.actor.slice(6));
  state.actor = f.member;
  expect(
    (
      await call(`proposals/${id}/reassign`, {
        user_id: f.admin.actor.slice(6),
        revision: 1,
        notify: false,
      })
    ).status,
  ).toBe(200);
  expect(
    (await call(`proposals/${id}/reassign`, { ...input, revision: 1 })).status,
  ).toBe(403);
  // GET list filtering uses the current owner, not immutable created_by.
  const filtered = await handle(
    new Request("https://app.example.test/api/proposals?owner=mine"),
    ["proposals"],
  );
  expect((await filtered.json()).items).toHaveLength(0);
});
