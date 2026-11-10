import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";
import {
  acceptedTotpStep,
  backupHash,
  newBackupCodes,
  newTotpSecret,
  totpCode,
} from "../src/lib/staff-security-crypto";

it("uses RFC 6238 time steps and produces eight independent user-bound backup codes", () => {
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  expect(totpCode(rfcSecret, 1)).toBe("287082");
  expect(acceptedTotpStep(rfcSecret, "287082", 59_000)).toBe(1);
  expect(acceptedTotpStep(rfcSecret, "287082", 60_000)).toBe(1);
  expect(acceptedTotpStep(rfcSecret, "287082", 90_000)).toBeNull();
  expect(acceptedTotpStep(rfcSecret, "hello", 59_000)).toBeNull();
  expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  vi.stubEnv(
    "INTEGRATION_ENCRYPTION_KEY",
    Buffer.alloc(32, 19).toString("base64"),
  );
  try {
    const codes = newBackupCodes();
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/);
      expect(backupHash("first", code)).toMatch(/^[0-9a-f]{64}$/);
      expect(backupHash("first", code)).toBe(
        backupHash("first", code.replaceAll("-", "").toLowerCase()),
      );
      expect(backupHash("first", code)).not.toBe(backupHash("second", code));
    }
  } finally {
    vi.unstubAllEnvs();
  }
});

it("enforces two-step and email confirmation in RLS, consumes codes atomically and revokes only owned sessions", async () => {
  const db = new PGlite();
  const [owner, other, first, second, third, foreign] = Array.from(
    { length: 6 },
    () => crypto.randomUUID(),
  );
  const claims = async (session: string) => {
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: owner, session_id: session }),
    ]);
  };
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema team_private;
      revoke all on schema team_private from public;
      grant usage on schema team_private to service_role;
      create table auth.users (id uuid primary key, email text);
      create table auth.sessions (
        id uuid primary key, user_id uuid references auth.users,
        not_after timestamptz, created_at timestamptz default now(),
        updated_at timestamptz, refreshed_at timestamp, user_agent text
      );
      create function auth.jwt() returns jsonb language sql stable as $$
        select nullif(current_setting('request.jwt.claims', true), '')::jsonb
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select (auth.jwt()->>'sub')::uuid
      $$;
      create table public.staff_users (user_id uuid primary key, status text);
      alter table public.staff_users enable row level security;
      grant usage on schema auth to authenticated;
      grant select on public.staff_users to authenticated, service_role;
      create policy self_read on public.staff_users for select to authenticated using (user_id = auth.uid());
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/20261110033306_staff_security.sql",
        "utf8",
      ),
    );
    await db.query(
      "insert into auth.users values ($1,'staff@example.test'),($2,'other@example.test')",
      [owner, other],
    );
    await db.query(
      "insert into public.staff_users values ($1,'active'),($2,'active')",
      [owner, other],
    );
    await db.query(
      `insert into auth.sessions (id,user_id,user_agent) values
      ($1,$5,'Chrome'),($2,$5,'Safari'),($3,$5,'Firefox'),($4,$6,'Chrome')`,
      [first, second, third, foreign, owner, other],
    );
    const {
      rows: [row],
    } = await db.query<{ revision: string }>(
      "insert into staff_security (user_id,totp_secret,backup_hashes) values ($1,'ciphertext',array['hash']) returning revision",
      [owner],
    );
    await claims(first);
    await db.exec("set role authenticated");
    expect(
      (await db.query("select user_id from public.staff_users")).rows,
    ).toEqual([]);
    await expect(
      db.query("select * from staff_security"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select staff_session_security($1,$2)", [owner, first]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select manage_staff_sessions($1,$2,'list')", [owner, first]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("set role anon");
    await expect(
      db.query("select * from staff_email_changes"),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    await db.query(
      "update auth.sessions set created_at = now() - interval '11 minutes' where id = $1",
      [third],
    );
    expect(
      (
        await db.query("select staff_session_security($1,$2) as state", [
          owner,
          third,
        ])
      ).rows,
    ).toEqual([{ state: "signed_out" }]);
    await db.query(
      "update auth.sessions set created_at = now() where id = $1",
      [third],
    );
    await db.exec("set role service_role");
    const current = () =>
      db.query("select staff_session_security($1,$2) as state", [owner, first]);
    expect((await current()).rows).toEqual([{ state: "two_step" }]);
    const consume = (session: string) =>
      db.query("select save_staff_factor($1,$2,$3,$4,true,false) as verified", [
        owner,
        session,
        row.revision,
        JSON.stringify({ totp_secret: "ciphertext", backup_hashes: [] }),
      ]);
    const attempts = await Promise.all([consume(first), consume(second)]);
    expect(attempts.map(({ rows }) => rows[0])).toEqual([
      { verified: true },
      { verified: false },
    ]);
    expect((await current()).rows).toEqual([{ state: "ok" }]);
    await db.exec("set role authenticated");
    expect(
      (await db.query("select user_id from public.staff_users")).rows,
    ).toEqual([{ user_id: owner }]);
    await db.exec("set role service_role");
    const list = () =>
      db.query<{ devices: { id: string; current: boolean }[] }>(
        "select manage_staff_sessions($1,$2,'list') as devices",
        [owner, first],
      );
    expect((await list()).rows[0].devices.map(({ id }) => id).sort()).toEqual(
      [first, second, third].sort(),
    );
    await db.query("select manage_staff_sessions($1,$2,'one',$3)", [
      owner,
      first,
      foreign,
    ]);
    await db.query("select manage_staff_sessions($1,$2,'one',$3)", [
      owner,
      first,
      second,
    ]);
    expect((await list()).rows[0].devices).toHaveLength(2);
    await db.exec("reset role");
    await db.query(
      "insert into staff_email_changes values ($1,'staff@example.test','new@other.test','hash',now()+interval '1 day',now(),$2)",
      [owner, first],
    );
    expect(
      (
        await db.query("select staff_session_security($1,$2) as state", [
          owner,
          third,
        ])
      ).rows,
    ).toEqual([{ state: "two_step" }]);
    await db.query("update auth.users set email='new@other.test' where id=$1", [
      owner,
    ]);
    expect(
      (
        await db.query("select staff_session_security($1,$2) as state", [
          owner,
          third,
        ])
      ).rows,
    ).toEqual([{ state: "signed_out" }]);
    expect((await current()).rows).toEqual([{ state: "ok" }]);
    await db.exec("set role service_role");
    await db.query("select manage_staff_sessions($1,$2,'others')", [
      owner,
      first,
    ]);
    expect((await list()).rows[0].devices).toMatchObject([
      { id: first, current: true },
    ]);
    expect(
      (
        await db.query("select staff_session_security($1,$2) as state", [
          other,
          foreign,
        ])
      ).rows,
    ).toEqual([{ state: "ok" }]);
    for (const kind of ["email", "password", "verification"] as const) {
      const limit = { email: 3, password: 5, verification: 10 }[kind];
      const attempt = () =>
        db.query("select admit_staff_security_attempt($1,$2) as ok", [
          owner,
          kind,
        ]);
      for (let i = 0; i < limit; i++)
        expect((await attempt()).rows).toEqual([{ ok: true }]);
      expect((await attempt()).rows).toEqual([{ ok: false }]);
    }
  } finally {
    await db.close();
  }
});
