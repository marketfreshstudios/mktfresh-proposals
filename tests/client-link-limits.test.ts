import { it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalLinkLimitStore,
  limitClientLink,
  linkLimitHash,
} from "../src/lib/client-link-limits";
it("durable counters allow successes, count 30 unknown links, apply to both token formats and never persist raw IPs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "link-limit-")),
    store = new LocalLinkLimitStore(dir),
    salt = "test-salt-not-a-real-credential-12345",
    ip = "203.0.113.25";
  const run = (token: string, status: number, resolved: boolean, pw = "") =>
    limitClientLink(
      new Request("https://app.test/api/public/" + token, {
        headers: { "x-proposal-password": pw },
      }),
      token,
      async () =>
        Response.json(
          { error: status === 404 ? "Not found" : "ok" },
          { status },
        ),
      () => resolved,
      { store, salt, ip },
    );
  for (let n = 0; n < 50; n++)
    expect((await run("A".repeat(43), 200, true)).status).toBe(200);
  for (let n = 0; n < 30; n++)
    expect(
      (await run(n % 2 ? "7Kp9QmR2vTdX" : "A".repeat(43), 404, false)).status,
    ).toBe(404);
  const blocked = await run("7Kp9QmR2vTdX", 404, false);
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  const rows = await readFile(join(dir, "client-link-limits.json"), "utf8");
  expect(rows).not.toContain(ip);
  expect(rows).not.toContain("7Kp9");
  expect(
    await new LocalLinkLimitStore(dir).check(
      "lookup",
      linkLimitHash("lookup", ip, salt),
      false,
    ),
  ).toBeGreaterThan(0);
});
it("password failures lock only that link for the current window, and missing-password page loads do not count", async () => {
  const dir = await mkdtemp(join(tmpdir(), "password-limit-"));
  let now = Date.now();
  const store = new LocalLinkLimitStore(dir, () => now),
    salt = "test-salt-not-a-real-credential-12345",
    ip = "203.0.113.25",
    token = "7Kp9QmR2vTdX";
  const run = (password: string, code = token) =>
    limitClientLink(
      new Request("https://app.test", {
        headers: { "x-proposal-password": password },
      }),
      code,
      async () =>
        Response.json({ error: "Proposal password required" }, { status: 401 }),
      () => true,
      { store, salt, ip },
    );
  for (let n = 0; n < 20; n++) expect((await run("")).status).toBe(401);
  for (let n = 0; n < 10; n++)
    expect((await run("bad-password")).status).toBe(401);
  expect((await run("bad-password")).status).toBe(429);
  expect((await run("bad-password", "8Kp9QmR2vTdX")).status).toBe(401);
  now += 901000;
  expect((await run("bad-password")).status).toBe(401);
});
