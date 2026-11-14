import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SignupError,
  addressFromName,
  checkAddress,
  startSignup,
  type SignupDeps,
} from "../src/lib/signup";
import { postgresFixture } from "./postgres-fixture";

const env = { ...process.env };
beforeEach(() => {
  process.env.APP_URL = "https://app.example.test";
  process.env.WORKSPACE_DOMAIN = "example.test";
  process.env.INTEGRATION_ENCRYPTION_KEY = "k".repeat(44);
});
afterEach(() => {
  process.env = { ...env };
});
const input = {
  business_name: "North Star Creative",
  slug: "northstar",
  first_name: "Dana",
  last_name: "Ruiz",
  email: "Dana@NorthStar.test",
  password: "correct horse",
};
function fakes(over: Partial<SignupDeps> = {}) {
  const sent: { to: string; text: string; html: string; subject: string }[] =
    [];
  const calls: string[] = [];
  const deps: SignupDeps = {
    admit: async () => true,
    addressFree: async (slug) => !["taken", "taken-2"].includes(slug),
    identity: async () => null,
    createUser: async (email) => (calls.push("create:" + email), "u1"),
    updatePendingUser: async (id) => void calls.push("update:" + id),
    reserve: async () => "reserved",
    link: async () => "hash/with+chars",
    send: async (m) => void sent.push(m),
    from: () => '"Yeswell" <notifications@example.test>',
    ...over,
  };
  return { deps, sent, calls };
}

describe("signup", () => {
  it("suggests an address from the business name", () => {
    expect(addressFromName("North Star Creative")).toBe("north-star-creative");
    expect(addressFromName("Café & Co.")).toBe("cafe-and-co");
    expect(addressFromName("  ---  ")).toBe("");
    expect(addressFromName("x".repeat(40))).toHaveLength(30);
  });
  it("checks addresses and offers a free alternative", async () => {
    const { deps } = fakes();
    expect(await checkAddress("northstar", deps)).toEqual({
      available: true,
      valid: true,
    });
    expect(await checkAddress("app", deps)).toEqual({
      available: false,
      valid: false,
    });
    expect(await checkAddress("taken", deps)).toEqual({
      available: false,
      valid: true,
      suggestion: "taken-3",
    });
  });
  it("creates the person, holds the address and emails a link on the new address", async () => {
    const { deps, sent, calls } = fakes();
    const result = await startSignup(input, "1.2.3.4", deps);
    expect(result).toEqual({
      email: "dana@northstar.test",
      address: "northstar.example.test",
    });
    expect(calls).toEqual(["create:dana@northstar.test"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("dana@northstar.test");
    expect(sent[0].text).toContain(
      "https://northstar.example.test/start/confirm#token_hash=hash%2Fwith%2Bchars",
    );
    expect(sent[0].html).toContain("Confirm email");
  });
  it("reuses an unconfirmed identity and refuses one that already has a workspace", async () => {
    const pending = fakes({
      identity: async () => ({
        id: "u9",
        workspace_id: null,
        confirmed: false,
      }),
    });
    await startSignup(input, "ip", pending.deps);
    expect(pending.calls).toEqual(["update:u9"]);
    for (const identity of [
      { id: "u9", workspace_id: "w", confirmed: true },
      { id: "u9", workspace_id: null, confirmed: true },
    ]) {
      const { deps, sent } = fakes({ identity: async () => identity });
      const e = await startSignup(input, "ip", deps).catch((x) => x);
      expect(e).toBeInstanceOf(SignupError);
      expect(e.code).toBe("email_has_workspace");
      expect(sent).toHaveLength(0);
    }
  });
  it("refuses taken addresses, rate-limited attempts and bad input before sending", async () => {
    const taken = fakes();
    const e = await startSignup(
      { ...input, slug: "taken" },
      "ip",
      taken.deps,
    ).catch((x) => x);
    expect([e.code, e.suggestion]).toEqual(["address_taken", "taken-3"]);
    const raced = fakes({ reserve: async () => "address_taken" });
    expect(
      (await startSignup(input, "ip", raced.deps).catch((x) => x)).code,
    ).toBe("address_taken");
    const limited = fakes({ admit: async () => false });
    expect(
      (await startSignup(input, "ip", limited.deps).catch((x) => x)).status,
    ).toBe(429);
    await expect(
      startSignup({ ...input, slug: "www" }, "ip", fakes().deps),
    ).rejects.toThrow();
    await expect(
      startSignup({ ...input, password: "short" }, "ip", fakes().deps),
    ).rejects.toThrow();
    await expect(
      startSignup({ ...input, extra: 1 }, "ip", fakes().deps),
    ).rejects.toThrow();
    for (const f of [taken, raced, limited]) expect(f.sent).toHaveLength(0);
  });
});

describe("signup database", () => {
  it("holds an address, creates the workspace once and makes the person its owner", async () => {
    const db = await postgresFixture();
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    await db.query(
      "insert into auth.users(id,email) values ($1,'a@x.test'),($2,'b@x.test')",
      [a, b],
    );
    const reserve = async (u: string, slug: string) =>
      (
        await db.query<{ r: string }>(
          "select public.reserve_workspace_signup($1,$2,'Acme Studio','Ann Lee') r",
          [u, slug],
        )
      ).rows[0].r;
    const free = async (slug: string) =>
      (
        await db.query<{ f: boolean }>(
          "select public.workspace_address_free($1) f",
          [slug],
        )
      ).rows[0].f;
    expect(await free("acme")).toBe(true);
    expect(await reserve(a, "acme")).toBe("reserved");
    expect(await free("acme")).toBe(false);
    expect(await reserve(b, "acme")).toBe("address_taken");
    expect(await reserve(a, "acme-2")).toBe("reserved"); // same person may change their mind
    expect(await free("acme")).toBe(true);
    const done = await db.query<{ workspace_id: string; slug: string }>(
      "select * from public.complete_workspace_signup($1)",
      [a],
    );
    expect(done.rows[0].slug).toBe("acme-2");
    const ws = done.rows[0].workspace_id;
    expect(
      (
        await db.query("select name, slug from public.workspaces where id=$1", [
          ws,
        ])
      ).rows,
    ).toEqual([{ name: "Acme Studio", slug: "acme-2" }]);
    expect(
      (
        await db.query(
          "select role, status, display_name, password_change_required from public.staff_users where user_id=$1",
          [a],
        )
      ).rows,
    ).toEqual([
      {
        role: "owner",
        status: "active",
        display_name: "Ann Lee",
        password_change_required: false,
      },
    ]);
    expect(
      (
        await db.query(
          "select action from public.team_audit where workspace_id=$1",
          [ws],
        )
      ).rows,
    ).toEqual([{ action: "workspace_created" }]);
    // New workspaces get the starter library.
    expect(
      Number(
        (
          await db.query<{ n: string }>(
            "select count(*) n from public.templates where workspace_id=$1",
            [ws],
          )
        ).rows[0].n,
      ),
    ).toBeGreaterThan(0);
    // A second click returns the same workspace; a member can't reserve again.
    expect(
      (
        await db.query<{ workspace_id: string }>(
          "select * from public.complete_workspace_signup($1)",
          [a],
        )
      ).rows[0].workspace_id,
    ).toBe(ws);
    expect(await reserve(a, "other")).toBe("member");
    // Expired holds free the address and can't be completed.
    expect(await reserve(b, "bravo")).toBe("reserved");
    await db.query(
      "update public.workspace_signups set expires_at = now() - interval '1 minute' where user_id=$1",
      [b],
    );
    expect(await free("bravo")).toBe(true);
    await expect(
      db.query("select * from public.complete_workspace_signup($1)", [b]),
    ).rejects.toThrow(/expired/);
    // Taken addresses are refused even if a hold slipped through.
    await db.query("delete from public.workspace_signups");
    await db.query(
      "insert into public.workspace_signups(user_id,slug,business_name,display_name,expires_at) values ($1,'acme-2','B','B',now()+interval '1 hour')",
      [b],
    );
    await expect(
      db.query("select * from public.complete_workspace_signup($1)", [b]),
    ).rejects.toThrow(/taken/);
  });
});
