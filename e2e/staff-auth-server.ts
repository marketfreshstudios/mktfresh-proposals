// Local-only Supabase Auth/PostgREST fixture. Never imported by the app.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "staff@example.test",
  app_metadata: {} as Record<string, unknown>,
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const staffAccounts = {
  staff: {
    ...user,
    id: "00000000-0000-4000-8000-000000000002",
    email: "member@example.test",
    app_metadata: { provider: "email" } as Record<string, unknown>,
  },
  other: {
    ...user,
    id: "00000000-0000-4000-8000-000000000003",
    email: "other-member@example.test",
    app_metadata: {} as Record<string, unknown>,
  },
};
type Fixture = {
  identity: typeof user;
  id: string;
  access: string;
  refresh: string;
  expired: boolean;
  revoked: boolean;
  refreshes: number;
  twoStep?: boolean;
};
const expiredAccess = new Set<string>();
const sessions = new Map<string, Fixture>(),
  access = new Map<string, Fixture>(),
  refresh = new Map<string, Fixture>();
function rotate(s: Fixture) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: s.identity.id,
      session_id: s.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  s.access = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${payload}.${Buffer.from(randomUUID()).toString("base64url")}`;
  s.refresh = randomUUID();
  s.expired = false;
  access.set(s.access, s);
  refresh.set(s.refresh, s);
}
function pair(s: Fixture) {
  return {
    access_token: s.access,
    refresh_token: s.refresh,
    expires_in: 3600,
    token_type: "bearer",
    user: s.identity,
  };
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://127.0.0.1:3112");
  const json = (value: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  if (url.pathname === "/fixture" && req.method === "POST") {
    const s: Fixture = {
      identity:
        body.account === "staff" || body.account === "other"
          ? staffAccounts[body.account as keyof typeof staffAccounts]
          : user,
      id: randomUUID(),
      access: "",
      refresh: "",
      expired: false,
      revoked: false,
      refreshes: 0,
      twoStep: !!body.two_step,
    };
    rotate(s);
    s.expired = !!body.expired;
    if (s.expired) expiredAccess.add(s.access);
    sessions.set(s.id, s);
    return json({ id: s.id, ...pair(s) });
  }
  if (url.pathname.startsWith("/fixture/")) {
    const [, , id, action] = url.pathname.split("/");
    const s = sessions.get(id);
    if (!s) return json({ error: "Unknown fixture" }, 404);
    if (action === "revoke") {
      s.expired = true;
      expiredAccess.add(s.access);
      s.revoked = true;
    }
    if (action === "expire") {
      s.expired = true;
      expiredAccess.add(s.access);
    }
    return json({ refreshes: s.refreshes });
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "password") {
      if (body.email !== user.email || body.password !== "fixture-password")
        return json({ message: "Invalid credentials" }, 400);
      const s: Fixture = {
        identity: user,
        id: randomUUID(),
        access: "",
        refresh: "",
        expired: false,
        revoked: false,
        refreshes: 0,
      };
      rotate(s);
      sessions.set(s.id, s);
      return json(pair(s));
    }
    const s = refresh.get(body.refresh_token);
    if (!s || s.revoked)
      return json(
        {
          message: "Refresh token revoked",
          error_code: "refresh_token_not_found",
        },
        400,
      );
    s.refreshes++;
    // Reuse of the parent returns the current pair, matching Supabase's reuse window.
    if (s.refresh === body.refresh_token) rotate(s);
    return json(pair(s));
  }
  if (url.pathname === "/rest/v1/rpc/staff_session_security") {
    const session = sessions.get(body.target_session);
    return json(
      !session || session.revoked || body.target_user !== session.identity.id
        ? "signed_out"
        : session.twoStep
          ? "two_step"
          : "ok",
    );
  }
  if (url.pathname === "/rest/v1/staff_security_sessions") return json([]);
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, ""),
    s = access.get(token);
  if (url.pathname === "/auth/v1/user")
    return s && !expiredAccess.has(token) && !s.revoked
      ? json(s.identity)
      : json({ message: "JWT expired", error_code: "bad_jwt" }, 401);
  if (url.pathname === "/auth/v1/logout") {
    if (s) s.revoked = true;
    return json({});
  }
  if (
    url.pathname.startsWith("/auth/v1/admin/users/") &&
    req.method === "PUT"
  ) {
    const id = url.pathname.split("/").at(-1);
    const target = Object.values(staffAccounts).find(
      (account) => account.id === id,
    );
    if (!target || token !== "local-auth-fixture-service")
      return json({ message: "Not allowed" }, 403);
    Object.assign(target.app_metadata, body.app_metadata);
    return json(target);
  }
  if (url.pathname === "/rest/v1/staff_users") {
    const filter = url.searchParams.get("user_id");
    const identity =
      [user, ...Object.values(staffAccounts)].find(
        (account) => filter === "eq." + account.id,
      ) ?? user;
    return json([
      {
        user_id: identity.id,
        workspace_id: LOCAL_WORKSPACE_ID,
        role: identity === user ? "owner" : "member",
        display_name: identity === user ? "Alex Morgan" : "Sam Lee",
      },
    ]);
  }
  if (url.pathname === "/") return json({ ready: true });
  json({ error: "Unknown fixture endpoint" }, 404);
});
server.listen(3112, "127.0.0.1");
