import { it, expect, vi } from "vitest";
import { setup, staff } from "./helpers";
const mocked = vi.hoisted(() => ({
  staff: vi.fn(),
  workspaceStaff: vi.fn(),
  runtime: vi.fn(),
}));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: mocked.staff,
  workspaceStaff: mocked.workspaceStaff,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: mocked.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
it("only an owner can change the signatory; validates workspace membership and derives email from Auth", async () => {
  const { repo, service, settings } = await setup();
  mocked.runtime.mockReturnValue({ repo, service });
  mocked.staff.mockResolvedValue({
    ...staff,
    workspace_id: repo.workspaceId,
    staff_role: "member",
  });
  mocked.workspaceStaff.mockResolvedValue([
    {
      user_id: staff.actor.slice(6),
      email: "trusted@example.test",
      name: "Alex",
      role: "owner",
    },
  ]);
  const save = () =>
    handle(
      new Request("http://localhost/api/workspace_settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      }),
      ["workspace_settings"],
    );
  settings.company_signatory!.name = "Updated Owner";
  expect((await save()).status).toBe(403);
  expect(
    (await repo.entities<any>("workspace_settings"))[0].company_signatory.name,
  ).toBe("Alex Morgan");
  mocked.staff.mockResolvedValue({ ...staff, workspace_id: repo.workspaceId });
  settings.company_signatory!.authorized_user_ids.push(
    "00000000-0000-4000-8000-000000000099",
  );
  expect((await save()).status).toBe(400);
  settings.company_signatory!.authorized_user_ids.pop();
  const result = await save();
  expect(result.status).toBe(201);
  expect((await result.json()).company_signatory.email).toBe(
    "trusted@example.test",
  );
  settings.company_signatory!.user_id = "00000000-0000-4000-8000-000000000099";
  expect((await save()).status).toBe(400);
});
it("only an owner can change the verified sending domain", async () => {
  const { repo, service, settings } = await setup();
  mocked.runtime.mockReturnValue({ repo, service });
  mocked.staff.mockResolvedValue({
    ...staff,
    workspace_id: repo.workspaceId,
    staff_role: "member",
  });
  settings.sending_domain = "different.test";
  const response = await handle(
    new Request("http://localhost/api/workspace_settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
    ["workspace_settings"],
  );
  expect(response.status).toBe(403);
  expect(
    (await repo.entities<any>("workspace_settings"))[0].sending_domain,
  ).toBe("example.test");
});
it("workspace password defaults are hashed, owner-only, redacted on reads and not replaceable by submitting a hash", async () => {
  const { repo, service, settings } = await setup();
  mocked.runtime.mockReturnValue({ repo, service });
  mocked.staff.mockResolvedValue({ ...staff, workspace_id: repo.workspaceId });
  const save = (input: unknown) =>
    handle(
      new Request("http://localhost/api/workspace_settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      ["workspace_settings"],
    );
  const result = await save({
    ...settings,
    default_password: "a-good-test-password",
    default_password_hash: "forged",
  });
  expect(result.status).toBe(201);
  expect((await result.json()).default_password_hash).toBeUndefined();
  const stored = (await repo.entities<any>("workspace_settings"))[0];
  expect(stored.default_password_hash).not.toBe("a-good-test-password");
  expect(stored.default_password_hash).not.toBe("forged");
  const session = await handle(
    new Request("http://localhost/api/auth/session"),
    ["auth", "session"],
  );
  const data = await session.json();
  expect(data.settings.default_password_enabled).toBe(true);
  expect(data.settings.default_password_hash).toBeUndefined();
  const unchanged = await save({
    ...settings,
    default_password_hash: "tampered",
  });
  expect(unchanged.status).toBe(201);
  expect(
    (await repo.entities<any>("workspace_settings"))[0].default_password_hash,
  ).toBe(stored.default_password_hash);
  mocked.staff.mockResolvedValue({
    ...staff,
    staff_role: "member",
    workspace_id: repo.workspaceId,
  });
  expect((await save({ ...settings, default_password: null })).status).toBe(
    403,
  );
});
it("rejects inaccessible accent choices and foreign font descriptors without saving", async () => {
  const { repo, service, settings } = await setup();
  mocked.runtime.mockReturnValue({ repo, service });
  mocked.staff.mockResolvedValue({ ...staff, workspace_id: repo.workspaceId });
  const request = (input: unknown) =>
    handle(
      new Request("http://localhost/api/workspace_settings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
      ["workspace_settings"],
    );
  const bad = await request({ ...settings, accent_colour: "#aaddcc" });
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toContain("4.5:1");
  const font = {
    id: crypto.randomUUID(),
    name: "Foreign",
    path: "other/fonts/test.woff2",
    hash: "a".repeat(64),
    format: "woff2",
  };
  expect(
    (
      await request({
        ...settings,
        proposal_fonts: { heading: font, body: "serif" },
      })
    ).status,
  ).toBe(400);
  expect(
    (await repo.entities<any>("workspace_settings"))[0].proposal_fonts,
  ).toBeUndefined();
});
