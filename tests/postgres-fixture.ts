import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function addAuthSessionsFixture(db: PGlite) {
  await db.exec(`
    create table if not exists auth.sessions (id uuid primary key, user_id uuid);
    alter table auth.sessions add column not_after timestamptz,
      add column user_agent text, add column created_at timestamptz default now(),
      add column updated_at timestamptz, add column refreshed_at timestamp;
    create function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
  `);
}

export async function setAuthSessionClaim(db: PGlite, user: string) {
  const session = crypto.randomUUID();
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    session,
    user,
  ]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, session_id: session }),
  ]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
}

export async function postgresFixture() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  await addAuthSessionsFixture(db);
  for (const file of (await readdir("supabase/migrations")).sort()) {
    const sql = await readFile(`supabase/migrations/${file}`, "utf8");
    if (sql.trim()) await db.exec(sql);
  }
  return db;
}
