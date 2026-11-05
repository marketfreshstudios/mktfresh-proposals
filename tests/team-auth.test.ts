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
vi.mock("../src/lib/repository", async (original) => ({
  ...(await original<typeof import("../src/lib/repository")>()),
  supabase: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: state.member, error: null }),
      };
      return query;
    },
    rpc: async (name: string, args: any) => {
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
  state.sessions.clear();
  state.links.clear();
  state.authCalls = [];
  state.rt = await setup();
  state.user = {
    id,
    email: "staff@example.test",
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
