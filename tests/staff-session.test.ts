import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setup, staff as actor } from "./helpers";
const state = vi.hoisted(() => ({
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "staff@example.test",
  },
  refresh: vi.fn(),
  signIn: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  member: vi.fn(),
  rt: null as any,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { refreshSession: state.refresh, signInWithPassword: state.signIn },
  }),
}));
vi.mock("../src/lib/repository", async (original) => ({
  ...(await original<typeof import("../src/lib/repository")>()),
  supabase: () => ({
    auth: { getUser: state.getUser, admin: { signOut: state.signOut } },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: state.member,
      };
      return chain;
    },
  }),
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.rt,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
import { proxy } from "../src/proxy";
import { staff } from "../src/lib/auth";
import { STAFF_SESSION_AGE, staffCookiePair } from "../src/lib/staff-session";
let refreshToken: string;
const session = () => ({
  access_token: "access-new",
  refresh_token: "refresh-new-" + refreshToken,
  expires_in: 3600,
  token_type: "bearer",
  user: state.user,
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("APP_MODE", "supabase");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SUPABASE_URL", "https://auth.example.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-test");
  refreshToken = crypto.randomUUID();
  state.getUser.mockImplementation(async (token: string) =>
    token === "access-new" || token === "access-valid"
      ? { data: { user: state.user }, error: null }
      : { data: { user: null }, error: { status: 401 } },
  );
  state.member.mockResolvedValue({
    data: {
      user_id: state.user.id,
      workspace_id: "00000000-0000-4000-8000-000000000000",
      role: "owner",
      display_name: "Alex Morgan",
    },
    error: null,
  });
  state.refresh.mockImplementation(async () => ({
    data: { session: session() },
    error: null,
  }));
  state.signIn.mockImplementation(async () => ({
    data: { session: session(), user: state.user },
    error: null,
  }));
  state.signOut.mockResolvedValue({ error: null });
  const f = await setup();
  state.rt = f;
  state.member.mockResolvedValue({
    data: {
      user_id: state.user.id,
      workspace_id: f.repo.workspaceId,
      role: "owner",
      display_name: "Alex Morgan",
    },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookies = `proposal_session=access-expired; proposal_refresh=${refreshToken}`,
) {
  return new NextRequest(`https://app.example.test/api/${path}`, {
    method,
    headers: {
      cookie: cookies,
      origin: "https://app.example.test",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function throughProxy(path: string, body: unknown) {
  const req = request(path, "PATCH", body),
    gate = await proxy(req);
  expect(gate.headers.get("x-middleware-next")).toBe("1");
  const forwarded = gate.headers.get("x-middleware-request-cookie")!;
  expect(forwarded).toContain("proposal_session=access-new");
  expect(forwarded).toContain("proposal_refresh=refresh-new-");
  const result = await handle(
    request(path, "PATCH", body, forwarded),
    path.split("/"),
  );
  return { gate, result };
}
it("expired access refreshes in the proxy, reaches the actual save, and rotates browser cookies without leaking tokens", async () => {
  const f = state.rt;
  const { gate, result } = await throughProxy(`proposals/${f.draft.id}`, {
    revision: f.draft.revision,
    title: "Kept working after an hour",
  });
  expect(result.status).toBe(200);
  expect((await result.json()).title).toBe("Kept working after an hour");
  expect(state.refresh).toHaveBeenCalledOnce();
  for (const response of [gate, result]) {
    expect(response.headers.getSetCookie()).toHaveLength(3);
    expect(response.headers.get("set-cookie")).toContain(
      "proposal_session=access-new",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${STAFF_SESSION_AGE}`,
    );
  }
});
it("missing access uses the refresh cookie; valid access slides both cookies without refreshing", async () => {
  await staff(
    request(
      "auth/session",
      "GET",
      undefined,
      `proposal_refresh=${refreshToken}`,
    ),
  );
  expect(state.refresh).toHaveBeenCalledOnce();
  state.refresh.mockClear();
  const gate = await proxy(
    request(
      "proposals",
      "GET",
      undefined,
      `proposal_session=access-valid; proposal_refresh=${refreshToken}`,
    ),
  );
  expect(gate.headers.get("x-middleware-next")).toBe("1");
  expect(gate.headers.getSetCookie()).toHaveLength(3);
  expect(state.refresh).not.toHaveBeenCalled();
});
it("parallel expired requests share one rotation and both independent proposal saves succeed", async () => {
  const f = state.rt;
  const second = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id,
      title: "Second proposal",
    },
    actor,
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.refresh.mockImplementation(async () => {
    await held;
    return { data: { session: session() }, error: null };
  });
  const firstSave = throughProxy(`proposals/${f.draft.id}`, {
    revision: f.draft.revision,
    title: "First saved",
  });
  const secondSave = throughProxy(`proposals/${second.id}`, {
    revision: second.revision,
    title: "Second saved",
  });
  await vi.waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
  release();
  const values = await Promise.all([firstSave, secondSave]);
  expect(values.map((v) => v.result.status)).toEqual([200, 200]);
  expect(values[0].gate.headers.getSetCookie()).toEqual(
    values[1].gate.headers.getSetCookie(),
  );
  expect(state.refresh).toHaveBeenCalledOnce();
  // A request already in transit with the previous cookie receives that same pair.
  await staff(request("auth/session"));
  expect(state.refresh).toHaveBeenCalledOnce();
});
it("login keeps both tokens out of JSON and asserts production HttpOnly/Secure/Lax/path/30-day flags", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const response = await handle(
    request(
      "auth/login",
      "POST",
      { email: "staff@example.test", password: "test-password" },
      "",
    ),
    ["auth", "login"],
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ authenticated: true });
  const cookies = response.headers.getSetCookie();
  expect(cookies).toHaveLength(3);
  expect(cookies[2]).toContain("Path=/api; Max-Age=0");
  for (const value of cookies.slice(0, 2)) {
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Max-Age=2592000");
  }
  expect(cookies[0]).toMatch(/Path=\/;/);
  expect(cookies[1]).toMatch(/Path=\/;/);
});
it("revoked refresh is 401 with cleared cookies; Auth outages preserve cookies and are retryable", async () => {
  state.refresh.mockResolvedValue({
    data: { session: null },
    error: { status: 400, code: "refresh_token_not_found" },
  });
  const response = await proxy(request("proposals"));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: "Staff authorization required",
    code: "STAFF_SIGNED_OUT",
  });
  expect(
    response.headers.getSetCookie().every((c) => c.includes("Max-Age=0")),
  ).toBe(true);
  state.refresh.mockResolvedValue({
    data: { session: null },
    error: { status: 503 },
  });
  const retry = await proxy(request("proposals"));
  expect(retry.status).toBe(503);
  expect(retry.headers.getSetCookie()).toEqual([]);
});
it("valid non-staff remains 403 and an invalid bearer cannot borrow the browser's refresh cookie", async () => {
  state.member.mockResolvedValue({ data: null, error: null });
  expect(
    (
      await proxy(
        request("proposals", "GET", undefined, "proposal_session=access-valid"),
      )
    ).status,
  ).toBe(403);
  const bearer = request("proposals");
  bearer.headers.set("authorization", "Bearer invalid");
  expect((await proxy(bearer)).status).toBe(401);
  expect(state.refresh).not.toHaveBeenCalled();
});
it("logout revokes this Supabase session and clears both cookies even when refresh was revoked", async () => {
  for (const revoked of [false, true]) {
    if (revoked)
      state.refresh.mockResolvedValue({
        data: { session: null },
        error: { status: 400 },
      });
    const response = await handle(request("auth/logout", "POST"), [
      "auth",
      "logout",
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signed_out: true });
    expect(response.headers.getSetCookie()).toEqual(staffCookiePair("", "", 0));
  }
  expect(state.signOut).toHaveBeenCalledWith("access-new", "local");
});
it("anonymous proposals are 401 for both proxy and route even with the old design flag", async () => {
  vi.stubEnv("DESIGN_PREVIEW_OPEN", "1");
  for (const response of [
    await proxy(request("proposals", "GET", undefined, "")),
    await handle(request("proposals", "GET", undefined, ""), ["proposals"]),
  ])
    expect(response.status).toBe(401);
  expect(state.getUser).not.toHaveBeenCalled();
  expect(state.refresh).not.toHaveBeenCalled();
});

it("staff pages redirect before rendering, preserve query, and refresh without a page flash", async () => {
  for (const path of ["/", "/proposals/example?view=send"]) {
    const req = new NextRequest("https://app.example.test" + path);
    const response = await proxy(req);
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe(path);
    expect(await response.text()).not.toContain("Dashboard");
  }
  const req = new NextRequest("https://app.example.test/proposals/example", {
    headers: { cookie: `proposal_refresh=${refreshToken}` },
  });
  const response = await proxy(req);
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-request-cookie")).toContain(
    "proposal_session=access-new",
  );
  expect(response.headers.getSetCookie()[1]).toContain("Path=/;");
  for (const path of [
    "/login",
    "/p/example",
    "/oauth/authorize",
    "/mcp",
    "/fonts/curated.css",
  ]) {
    const response = await proxy(
      new NextRequest("https://app.example.test" + path),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  }
});
