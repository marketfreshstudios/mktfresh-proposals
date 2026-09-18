import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
it("applies migration to fresh PostgreSQL, enforces RLS, CAS, append-only audit and frozen versions", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile("supabase/migrations/20260918190502_phase1.sql", "utf8"),
  );
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  await db.query("insert into clients(id,data) values($1,$2)", [
    p.client.id,
    JSON.stringify(p.client),
  ]);
  const document = { ...p, revision: 0 };
  await db.query("select save_proposal($1::jsonb,-1)", [
    JSON.stringify(document),
  ]);
  await expect(
    db.query("select save_proposal($1::jsonb,-1)", [JSON.stringify(document)]),
  ).rejects.toThrow("Revision conflict");
  expect((await db.query("select * from proposal_versions")).rows).toHaveLength(
    1,
  );
  await expect(db.exec("update events set actor='tampered'")).rejects.toThrow(
    "Append-only",
  );
  await expect(db.exec("delete from events")).rejects.toThrow("Append-only");
  await expect(
    db.exec(
      "update proposal_versions set data=jsonb_set(data,'{content_hash}','\"bad\"')",
    ),
  ).rejects.toThrow("Frozen");
  await db.exec("set role authenticated");
  expect((await db.query("select * from proposals")).rows).toHaveLength(0);
  await expect(
    db.query("select save_proposal($1::jsonb,0)", [
      JSON.stringify({ ...document, revision: 1 }),
    ]),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role");
  await db.query("insert into auth.users values($1)", [staff.actor.slice(6)]);
  await db.query("insert into staff_users values($1)", [staff.actor.slice(6)]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    staff.actor.slice(6),
  ]);
  await db.exec("set role authenticated");
  expect((await db.query("select * from proposals")).rows).toHaveLength(1);
  await expect(
    db.exec("update proposals set title='tampered'"),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role");
  const changed = structuredClone(document);
  changed.revision = 1;
  changed.versions[0].quote[0].unit_price = 1;
  await expect(
    db.query("select save_proposal($1::jsonb,0)", [JSON.stringify(changed)]),
  ).rejects.toThrow("Frozen evidence");
  await db.query("select save_proposal($1::jsonb,0)", [
    JSON.stringify({ ...document, revision: 1 }),
  ]);
  await db.close();
});
