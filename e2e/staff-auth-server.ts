// Local-only Supabase Auth/PostgREST fixture. Never imported by the app.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "staff@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
type Fixture = {
  id: string;
  access: string;
  refresh: string;
  expired: boolean;
  revoked: boolean;
  refreshes: number;
};
const expiredAccess = new Set<string>();
const sessions = new Map<string, Fixture>(),
  access = new Map<string, Fixture>(),
  refresh = new Map<string, Fixture>();
function rotate(s: Fixture) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
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
    user,
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
      id: randomUUID(),
      access: "",
      refresh: "",
      expired: false,
      revoked: false,
      refreshes: 0,
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
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, ""),
    s = access.get(token);
  if (url.pathname === "/auth/v1/user")
    return s && !expiredAccess.has(token) && !s.revoked
      ? json(user)
      : json({ message: "JWT expired", error_code: "bad_jwt" }, 401);
  if (url.pathname === "/auth/v1/logout") {
    if (s) s.revoked = true;
    return json({});
  }
  if (url.pathname === "/rest/v1/staff_users")
    return json([
      {
        user_id: user.id,
        workspace_id: LOCAL_WORKSPACE_ID,
        role: "owner",
        display_name: "Alex Morgan",
      },
    ]);
  if (url.pathname === "/") return json({ ready: true });
  json({ error: "Unknown fixture endpoint" }, 404);
});
server.listen(3112, "127.0.0.1");
