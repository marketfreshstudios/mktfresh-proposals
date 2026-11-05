import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
it("atomic Postgres windows are durable, permission-restricted and race-safe", async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;",
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261105063146_client_link_limits.sql",
      "utf8",
    ),
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(
      db.query("select client_link_limit('lookup',$1,true)", ["a".repeat(64)]),
    ).rejects.toThrow("permission denied");
    await expect(db.query("select * from client_link_limits")).rejects.toThrow(
      "permission denied",
    );
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const call = (charge: boolean) =>
    db.query<{ retry: number }>(
      "select client_link_limit('lookup',$1,$2) as retry",
      ["a".repeat(64), charge],
    );
  expect((await call(false)).rows[0].retry).toBe(0);
  const results = await Promise.all(
    Array.from({ length: 40 }, () => call(true)),
  );
  expect(results.filter((r) => r.rows[0].retry === 0)).toHaveLength(30);
  expect((await call(false)).rows[0].retry).toBeGreaterThan(0);
  const row = (await db.query<any>("select * from client_link_limits")).rows[0];
  expect(row.failures).toBe(31);
  expect(row.key_hash).toBe("a".repeat(64));
  await db.exec("reset role");
  expect(
    (
      await db.query<any>(
        "select relrowsecurity from pg_class where relname='client_link_limits'",
      )
    ).rows[0].relrowsecurity,
  ).toBe(true);
  await db.close();
});
