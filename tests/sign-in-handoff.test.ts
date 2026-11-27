import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HANDOFF_COOKIE,
  HandoffExpired,
  createHandoff,
  handoffNext,
  handoffTarget,
  redeemHandoff,
} from "../src/lib/sign-in-handoff";

const env = { ...process.env };
beforeEach(() => {
  process.env.WORKSPACE_DOMAIN = "example.test";
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  process.env = { ...env };
});

const appLogin = new Request("https://app.example.test/api/auth/login", {
  headers: { host: "app.example.test" },
});
const session = {
  access_token: "access-abc",
  refresh_token: "refresh-def",
  user_id: "00000000-0000-4000-8000-0000000000aa",
};
const flags = { two_step: false, password_change: false };

function start(now = Date.now()) {
  const h = createHandoff(
    appLogin,
    "https://acme.example.test",
    session,
    flags,
    now,
  );
  const pass = decodeURIComponent(new URL(h.url).hash.slice(1));
  const nonce = h.cookie.match(new RegExp(`^${HANDOFF_COOKIE}=([^;]+)`))![1];
  return { h, pass, nonce };
}
const redeemOn = (host: string, cookie?: string) =>
  new Request(`https://${host}/api/auth/handoff`, {
    method: "POST",
    headers: { host, ...(cookie ? { cookie } : {}) },
  });

describe("signing in from app.yeswell.co", () => {
  it("sends the browser to the workspace's own address with a sealed pass", () => {
    const { h, pass } = start();
    const url = new URL(h.url);
    expect(url.origin).toBe("https://acme.example.test");
    expect(url.pathname).toBe("/login/continue");
    // The tokens are sealed: neither appears in the address.
    expect(h.url).not.toContain("access-abc");
    expect(h.url).not.toContain("refresh-def");
    expect(url.search).toBe("");
    expect(pass.length).toBeGreaterThan(20);
    // The binding cookie spans the workspace domain, is HttpOnly and short.
    expect(h.cookie).toMatch(
      /^yeswell_handoff=[\w-]{43}; Domain=example\.test; Path=\/; Max-Age=120; HttpOnly; SameSite=Lax; Secure$/,
    );
  });

  it("redeems once, on that address, in the same browser", () => {
    const { pass, nonce } = start();
    const done = redeemHandoff(
      redeemOn("acme.example.test", `${HANDOFF_COOKIE}=${nonce}`),
      pass,
    );
    expect(done.session).toEqual(session);
    expect(done.flags).toEqual(flags);
    expect(done.clear).toMatch(
      /^yeswell_handoff=; Domain=example\.test;.*Max-Age=0/,
    );
  });

  it("refuses a pass without its browser cookie, or with another one", () => {
    const { pass } = start();
    const other = start().nonce;
    expect(() => redeemHandoff(redeemOn("acme.example.test"), pass)).toThrow(
      HandoffExpired,
    );
    expect(() =>
      redeemHandoff(
        redeemOn("acme.example.test", `${HANDOFF_COOKIE}=${other}`),
        pass,
      ),
    ).toThrow(HandoffExpired);
  });

  it("refuses a pass on another workspace's address", () => {
    const { pass, nonce } = start();
    expect(() =>
      redeemHandoff(
        redeemOn("bravo.example.test", `${HANDOFF_COOKIE}=${nonce}`),
        pass,
      ),
    ).toThrow(HandoffExpired);
  });

  it("refuses a pass after a minute", () => {
    const now = Date.now();
    const { pass, nonce } = start(now);
    const req = redeemOn("acme.example.test", `${HANDOFF_COOKIE}=${nonce}`);
    expect(() => redeemHandoff(req, pass, now + 59_000)).not.toThrow();
    expect(() => redeemHandoff(req, pass, now + 61_000)).toThrow(
      HandoffExpired,
    );
  });

  it("refuses a changed or made-up pass", () => {
    const { pass, nonce } = start();
    const req = redeemOn("acme.example.test", `${HANDOFF_COOKIE}=${nonce}`);
    const parts = pass.split(".");
    parts[2] =
      parts[2].slice(0, -4) + (parts[2].endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => redeemHandoff(req, parts.join("."), Date.now())).toThrow(
      HandoffExpired,
    );
    expect(() => redeemHandoff(req, "not-a-pass")).toThrow(HandoffExpired);
    // A pass sealed with another key never opens.
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => redeemHandoff(req, pass)).toThrow(HandoffExpired);
  });

  it("continues to two-step, a new password, or Home", () => {
    expect(handoffNext({ two_step: true, password_change: true })).toBe(
      "/login?state=two-step",
    );
    expect(handoffNext({ two_step: false, password_change: true })).toBe(
      "/set-password",
    );
    expect(handoffNext(flags)).toBe("/");
  });
});

describe("continuing to an assistant connection after signing in", () => {
  it("allows only the connect page as a next step", () => {
    expect(handoffTarget("/oauth/connect?client_id=a&state=b")).toBe(
      "/oauth/connect?client_id=a&state=b",
    );
    for (const bad of [
      "/",
      "/settings",
      "https://evil.test/oauth/connect?x=1",
      "//evil.test/oauth/connect?x=1",
      "/oauth/connect",
      "/oauth/connect?x=1#frag",
      "/oauth/connect?x= 1",
      "/oauth/connect?" + "a".repeat(4000),
      42,
      undefined,
    ])
      expect(handoffTarget(bad)).toBeUndefined();
  });

  it("goes to the connect page, or through two-step first", () => {
    const next = "/oauth/connect?client_id=a";
    expect(handoffNext({ ...flags, next })).toBe(next);
    expect(handoffNext({ ...flags, two_step: true, next })).toBe(
      "/login?state=two-step&next=" + encodeURIComponent(next),
    );
    expect(handoffNext({ ...flags, next: "https://evil.test" })).toBe("/");
  });

  it("carries the next step through the sealed pass", () => {
    const next = "/oauth/connect?client_id=a";
    const h = createHandoff(
      appLogin,
      "https://acme.example.test",
      session,
      { ...flags, next },
      Date.now(),
    );
    const pass = decodeURIComponent(new URL(h.url).hash.slice(1));
    const nonce = h.cookie.match(new RegExp(`^${HANDOFF_COOKIE}=([^;]+)`))![1];
    const redeemed = redeemHandoff(
      redeemOn("acme.example.test", `${HANDOFF_COOKIE}=${nonce}`),
      pass,
    );
    expect(redeemed.flags.next).toBe(next);
  });
});
