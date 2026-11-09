import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  member: null as any,
  user: null as any,
  sessions: new Set<string>(),
  links: new Map<string, { user_id: string; type: string }>(),
  password: "Initial secure password!",
  rt: null as any,
  authCalls: [] as unknown[],
  members: new Map<string, any>(),
  current: null as any,
  resetMail: [] as any[],
  resetAudit: [] as any[],
  resetLimit: true,
  resetKeys: [] as any[],
  resetWorkspaces: [] as string[],
}));
const id = "00000000-0000-4000-8000-000000000001";
function token(sid: string) {
  return `header.${Buffer.from(JSON.stringify({ sub: id, session_id: sid })).toString("base64url")}.signature`;
}
function session() {
  const sid = crypto.randomUUID();
  state.sessions.add(sid);
  return {
    user: state.user,
    access_token: token(sid),
    refresh_token: "refresh:" + sid,
    expires_in: 3600,
    token_type: "bearer",
  };
}
const credentials = {
  signInWithPassword: vi.fn(async (input: any) =>
    input.email === state.user.email &&
    input.password === state.password &&
    state.member.status !== "deactivated"
      ? { data: { session: session(), user: state.user }, error: null }
      : { data: { session: null, user: null }, error: { status: 400 } },
  ),
  refreshSession: vi.fn(async (input: any) => {
    const sid = input.refresh_token.slice(8);
    return state.sessions.has(sid)
      ? { data: { session: { ...session() } }, error: null }
      : { data: { session: null }, error: { status: 400 } };
  }),
  verifyOtp: vi.fn(async (input: any) => {
    const found = state.links.get(input.token_hash);
    state.links.delete(input.token_hash);
    return found && found.type === input.type
      ? { data: { session: session() }, error: null }
      : { data: { session: null }, error: { status: 410 } };
  }),
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: credentials }),
}));
vi.mock("../src/lib/jobs", async (original) => ({
  ...(await original<typeof import("../src/lib/jobs")>()),
  ResendMailer: class {
    async send(message: unknown) {
      state.resetMail.push(message);
    }
  },
}));
vi.mock("../src/lib/repository", async (original) => ({
  ...(await original<typeof import("../src/lib/repository")>()),
  SupabaseRepository: class {
    constructor(_db: unknown, workspaceId: string) {
      state.resetWorkspaces.push(workspaceId);
      return state.rt.repo;
    }
  },
  supabase: () => ({
    from: (table: string) => {
      if (table === "team_audit")
        return {
          insert: async (row: unknown) => {
            state.resetAudit.push(row);
            return { error: null };
          },
        };

      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: state.member, error: null }),
      };
      return query;
    },
    rpc: async (name: string, args: any) => {
      if (name === "admit_staff_password_reset") {
        state.resetKeys.push(args);
        return { data: state.resetLimit, error: null };
      }
      if (name === "team_auth_identity")
        return {
          data:
            args.target_email === state.user.email
              ? {
                  id,
                  workspace_id: state.member.workspace_id,
                  confirmed: !!state.user.email_confirmed_at,
                }
              : null,
          error: null,
        };
      if (name === "staff_session_exists")
        return { data: state.sessions.has(args.target_session), error: null };
      if (name === "change_team_member") {
        state.member.status = "active";
        state.member.password_change_required = false;
        state.member.session_version++;
        state.authCalls.push({ action: args.operation, changes: args.changes });
        return { data: state.member, error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      getUser: async (access: string) => {
        try {
          const sid = JSON.parse(
            Buffer.from(access.split(".")[1], "base64url").toString(),
          ).session_id;
          return {
            data: { user: state.user },
            error: state.current?.expired ? { status: 401 } : null,
          };
        } catch {
          return { data: { user: null }, error: { status: 401 } };
        }
      },
      admin: {
        getUserById: async () => ({ data: { user: state.user }, error: null }),
        generateLink: async ({
          email,
          type,
        }: {
          email: string;
          type: string;
        }) => {
          expect(email).toBe(state.user.email);
          const hashed_token = "fake-recovery-token-" + crypto.randomUUID();
          state.links.set(hashed_token, { user_id: id, type });
          return {
            data: { user: state.user, properties: { hashed_token } },
            error: null,
          };
        },
        updateUserById: async (userId: string, input: any) => {
          state.password = input.password;
          state.sessions.clear();
          state.authCalls.push({
            admin_user_id: userId,
            password_updated: true,
          });
          return { data: { user: state.user }, error: null };
        },
        signOut: async () => ({ error: null }),
      },
    },
  }),
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.rt,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
import { staff } from "../src/lib/auth";
import { proxy } from "../src/proxy";
import { setup } from "./helpers";
import { sessionId } from "../src/lib/staff-access";
function req(path: string, input?: unknown, pair = state.current) {
  return new NextRequest(`https://app.example.test/api/${path}`, {
    method: input ? "POST" : "GET",
    headers: {
      origin: "https://app.example.test",
      cookie: pair
        ? `proposal_session=${pair.access_token}; proposal_refresh=${pair.refresh_token}`
        : "",
      "content-type": "application/json",
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
}
beforeEach(async () => {
  vi.stubEnv("APP_MODE", "supabase");
  vi.stubEnv("SUPABASE_URL", "https://auth.example.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "fake");
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.stubEnv(
    "INTEGRATION_ENCRYPTION_KEY",
    "local-only-password-reset-hmac-secret",
  );
  state.resetMail = [];
  state.resetAudit = [];
  state.resetKeys = [];
  state.resetWorkspaces = [];
  state.resetLimit = true;
  state.sessions.clear();
  state.links.clear();
  state.authCalls = [];
  state.rt = await setup();
  state.user = {
    id,
    email: "staff@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  state.member = {
    user_id: id,
    workspace_id: state.rt.repo.workspaceId,
    role: "member",
    display_name: "Jamie",
    status: "active",
    password_change_required: false,
    session_version: 0,
  };
  state.password = "Initial secure password!";
  state.current = session();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
it("invitation → choose password → HttpOnly signed-in Staff in the correct workspace, with no tokens/passwords in JSON", async () => {
  state.member.status = "invited";
  state.member.password_change_required = true;
  state.links.set("valid-invite", { user_id: id, type: "invite" });
  const response = await handle(
    req(
      "auth/set-password",
      {
        token_hash: "valid-invite",
        type: "invite",
        password: "New secret password!",
      },
      null,
    ),
    ["auth", "set-password"],
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ authenticated: true });
  expect(response.headers.getSetCookie().join()).toContain("HttpOnly");
  expect(state.member).toMatchObject({
    status: "active",
    password_change_required: false,
    session_version: 1,
  });
  expect(JSON.stringify(state.authCalls)).not.toContain("New secret password!");
  const cookie = response.headers
    .getSetCookie()
    .filter((c) => !c.includes("Max-Age=0"))
    .map((c) => c.split(";")[0])
    .join(";");
  const actor = await staff(
    new NextRequest("https://app.example.test/api/proposals", {
      headers: { cookie },
    }),
  );
  expect(actor.staff_role).toBe("member");
  expect(actor.workspace_id).toBe(state.rt.repo.workspaceId);
});
it("expired link reports a clear resend message and cannot update the password", async () => {
  const response = await handle(
    req(
      "auth/set-password",
      {
        token_hash: "expired-invite",
        type: "invite",
        password: "New password!",
      },
      null,
    ),
    ["auth", "set-password"],
  );
  expect(response.status).toBe(410);
  expect((await response.json()).error).toContain("Ask your admin to resend");
  expect(state.authCalls).toHaveLength(0);
});
it("password changes revoke old access/refresh, while the fresh login passes and password flag is cleared", async () => {
  const old = state.current;
  const response = await handle(
    req("auth/set-password", {
      current_password: state.password,
      password: "Another secure password!",
    }),
    ["auth", "set-password"],
  );
  expect(response.status).toBe(200);
  expect(state.sessions.has(sessionId(old.access_token)!)).toBe(false);
  await expect(staff(req("proposals", undefined, old))).rejects.toMatchObject({
    status: 401,
  });
  state.current = { ...old, expired: true };
  await expect(
    staff(req("proposals", undefined, state.current)),
  ).rejects.toMatchObject({ status: 401 });
  const login = await handle(
    req(
      "auth/login",
      { email: state.user.email, password: "Another secure password!" },
      null,
    ),
    ["auth", "login"],
  );
  expect(login.status).toBe(200);
  expect(await login.json()).toEqual({ authenticated: true });
});
it("forced next-sign-in change gets the Set password page, cannot use staff APIs, and needs no redundant current password", async () => {
  state.member.password_change_required = true;
  const login = await handle(
    req(
      "auth/login",
      { email: state.user.email, password: state.password },
      null,
    ),
    ["auth", "login"],
  );
  expect(await login.json()).toEqual({
    authenticated: true,
    password_change_required: true,
  });
  const page = await proxy(
    new NextRequest("https://app.example.test/proposals/anything", {
      headers: { cookie: `proposal_session=${state.current.access_token}` },
    }),
  );
  expect(page.status).toBe(307);
  expect(new URL(page.headers.get("location")!).pathname).toBe("/set-password");
  const api = await handle(req("auth/session"), ["auth", "session"]);
  expect(api.status).toBe(403);
  expect((await api.json()).code).toBe("STAFF_PASSWORD_REQUIRED");
  const changed = await handle(
    req("auth/set-password", { password: "Final secure password!" }),
    ["auth", "set-password"],
  );
  expect(changed.status).toBe(200);
  expect(state.member.password_change_required).toBe(false);
});
it("deactivated users cannot log in, reuse an access cookie, or use a refresh-only session", async () => {
  state.member.status = "deactivated";
  const login = await handle(
    req(
      "auth/login",
      { email: state.user.email, password: state.password },
      null,
    ),
    ["auth", "login"],
  );
  expect(login.status).toBe(401);
  await expect(staff(req("proposals"))).rejects.toMatchObject({ status: 403 });
  const refreshOnly = req("proposals");
  refreshOnly.headers.set(
    "cookie",
    `proposal_refresh=${state.current.refresh_token}`,
  );
  await expect(staff(refreshOnly)).rejects.toMatchObject({ status: 403 });
});
it("ordinary self password changes require the current password and cross-site changes are refused", async () => {
  const response = await handle(
    req("auth/set-password", { password: "Replacement password!" }),
    ["auth", "set-password"],
  );
  expect(response.status).toBe(400);
  const wrong = await handle(
    req("auth/set-password", {
      current_password: "Wrong old password",
      password: "Replacement password!",
    }),
    ["auth", "set-password"],
  );
  expect(wrong.status).toBe(401);
  expect(state.authCalls).toHaveLength(0);
  const hostile = req("auth/set-password", {
    current_password: state.password,
    password: "Replacement password!",
  });
  hostile.headers.set("origin", "https://other.example.test");
  expect((await handle(hostile, ["auth", "set-password"])).status).toBe(403);
});

it("self-service sends one recovery link, signs in on one use, and sends a credential-free notice", async () => {
  // There is no workspace selector on the shared login; scope is derived from the account.
  state.member.workspace_id = "b36a2c11-64aa-4ca9-a8b1-2a17f35f9808";
  const scheduled: (() => Promise<void>)[] = [];
  const after = (work: () => Promise<void>) => {
    scheduled.push(work);
  };
  const request = await handle(
    req(
      "auth/reset-password",
      {
        email: " STAFF@EXAMPLE.TEST ",
        workspace_id: state.rt.repo.workspaceId,
      },
      null,
    ),
    ["auth", "reset-password"],
    after,
  );
  expect(request.status).toBe(200);
  expect(request.headers.get("cache-control")).toBe("no-store");
  expect(await request.json()).toEqual({
    accepted: true,
    expires_in_minutes: 60,
  });
  expect(state.resetMail).toHaveLength(0);
  await scheduled.shift()!();
  expect(state.resetWorkspaces).toEqual([state.member.workspace_id]);
  expect(state.resetAudit).toEqual([
    {
      workspace_id: state.member.workspace_id,
      actor: "system",
      actor_name: "Password reset form",
      target_user_id: id,
      target_name: "Jamie",
      action: "password_reset_requested",
    },
  ]);
  expect(state.resetMail).toHaveLength(1);
  expect(state.resetMail[0].to).toBe(state.user.email);
  const resetLink = state.resetMail[0].text.match(
    /https:\/\/app.example.test\/set-password#\S+/,
  )[0];
  const data = new URLSearchParams(new URL(resetLink).hash.slice(1));
  const token_hash = data.get("token_hash");
  expect(data.get("type")).toBe("recovery");
  expect(
    JSON.stringify(await state.rt.repo.entities("email_log")),
  ).not.toContain(token_hash);

  const input = {
    token_hash,
    type: "recovery",
    password: "Replacement after reset!",
  };
  const response = await handle(
    req("auth/set-password", input, null),
    ["auth", "set-password"],
    after,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ authenticated: true });
  expect(response.headers.getSetCookie().join()).toContain("HttpOnly");
  await scheduled.shift()!();
  expect(state.resetMail).toHaveLength(2);
  expect(state.resetMail[1]).toMatchObject({
    to: state.user.email,
    subject: "Your Yeswell password was changed",
  });
  expect(state.resetMail[1].text).toContain(
    "Not you? Contact your workspace admin",
  );
  expect(state.resetMail[1].text).not.toContain(token_hash);
  expect(state.resetMail[1].text).not.toContain(input.password);
  const replay = await handle(
    req("auth/set-password", input, null),
    ["auth", "set-password"],
    after,
  );
  expect(replay.status).toBe(410);
  expect(scheduled).toHaveLength(0);
});
it.each([
  "unknown",
  "invalid",
  "invited",
  "unconfirmed",
  "deactivated",
  "banned",
  "limited",
] as const)(
  "self-service returns the same confirmation and sends nothing for %s",
  async (kind) => {
    const email =
      kind === "unknown"
        ? "stranger@example.test"
        : kind === "invalid"
          ? "invalid email"
          : state.user.email;
    if (kind === "invited" || kind === "deactivated")
      state.member.status = kind;
    if (kind === "invited" || kind === "unconfirmed")
      delete state.user.email_confirmed_at;
    if (kind === "banned")
      state.user.banned_until = new Date(Date.now() + 60000).toISOString();
    if (kind === "limited") state.resetLimit = false;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const scheduled: (() => Promise<void>)[] = [];
    try {
      const response = await handle(
        req("auth/reset-password", { email }, null),
        ["auth", "reset-password"],
        (work) => scheduled.push(work),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        accepted: true,
        expires_in_minutes: 60,
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      for (const work of scheduled) await work();
      expect(state.resetMail).toHaveLength(0);
      expect(state.resetAudit).toHaveLength(
        ["unknown", "invalid"].includes(kind) ? 0 : 1,
      );
      if (kind === "unknown") {
        expect(log).toHaveBeenCalledWith("Password reset requested", {
          email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain(email);
      }
      expect(JSON.stringify(state.resetKeys)).not.toContain(email);
    } finally {
      log.mockRestore();
    }
  },
);
