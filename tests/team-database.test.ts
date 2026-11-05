import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
it("team changes are tenant-scoped, guarded and append-only in the actual database", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create table auth.sessions(id uuid primary key,user_id uuid);create table auth.refresh_tokens(user_id text,session_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.sessions to service_role;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const wid = "00000000-0000-4000-8000-000000000001",
    owner = crypto.randomUUID(),
    member = crypto.randomUUID(),
    other = crypto.randomUUID(),
    foreign = crypto.randomUUID();
  await db.query("insert into workspaces(id,name) values($1,$2)", [
    other,
    "Other",
  ]);
  for (const id of [owner, member, foreign])
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${id}@example.test`,
    ]);
  await db.query(
    "insert into staff_users(user_id,workspace_id,role,display_name) values($1,$2,'owner','Alex'),($3,$2,'member','Jamie'),($4,$5,'owner','Other')",
    [owner, wid, member, foreign, other],
  );
  await db.exec("set role service_role");
  const change = async (
    actor: string,
    target: string,
    op: string,
    changes = {},
  ) =>
    db.query("select change_team_member($1,$2,$3,$4,$5)", [
      wid,
      actor,
      target,
      op,
      JSON.stringify(changes),
    ]);
  for (const op of [
    "role",
    "deactivate",
    "remove",
    "password_set",
    "reset_sent",
    "invite_resent",
    "reactivate",
  ])
    await expect(change(member, owner, op, { role: "member" })).rejects.toThrow(
      "Only a super admin",
    );
  await expect(
    change(owner, owner, "role", { role: "member" }),
  ).rejects.toThrow("at least one active super admin");
  await expect(change(owner, owner, "deactivate")).rejects.toThrow("yourself");
  await expect(change(owner, owner, "remove")).rejects.toThrow("yourself");
  await expect(
    change(owner, foreign, "role", { role: "member" }),
  ).rejects.toThrow("not found in this workspace");
  await change(owner, member, "role", { role: "owner" });
  await change(owner, owner, "role", { role: "member" });
  await expect(
    change(member, member, "role", { role: "member" }),
  ).rejects.toThrow("at least one active super admin");
  await db.exec("reset role");
  const targetSession = crypto.randomUUID(),
    otherSession = crypto.randomUUID(),
    grant = crypto.randomUUID();
  await db.query(
    "insert into auth.sessions(id,user_id) values($1,$2),($3,$4)",
    [targetSession, owner, otherSession, foreign],
  );
  await db.query(
    "insert into auth.refresh_tokens(user_id,session_id) values($1,$2),($3,$4)",
    [owner, targetSession, foreign, otherSession],
  );
  await db.query(
    "insert into oauth_records(id,workspace_id,kind,hash,data) values($1,$2,'grant',$3,$4)",
    [grant, wid, grant, JSON.stringify({ user_id: owner, revoked: false })],
  );
  await db.exec("set role service_role");
  await expect(
    db.query("select team_private.revoke_staff_sessions($1,$2,$3)", [
      wid,
      member,
      foreign,
    ]),
  ).rejects.toThrow("Only a super admin");
  await change(member, owner, "deactivate");
  expect(
    (
      await db.query("select staff_session_exists($1,$2) as valid", [
        owner,
        targetSession,
      ])
    ).rows,
  ).toEqual([{ valid: false }]);
  await db.exec("reset role");
  expect((await db.query("select * from auth.sessions")).rows).toMatchObject([
    { id: otherSession, user_id: foreign },
  ]);
  expect(
    (await db.query("select * from auth.refresh_tokens")).rows,
  ).toMatchObject([{ user_id: foreign, session_id: otherSession }]);
  expect(
    (await db.query<any>("select data from oauth_records where id=$1", [grant]))
      .rows[0].data.revoked,
  ).toBe(true);
  await db.exec("set role service_role");
  await expect(
    change(owner, member, "name", { display_name: "Forbidden" }),
  ).rejects.toThrow("Only a super admin");
  await change(member, owner, "reactivate");
  await change(owner, owner, "name", { display_name: "New own name" });
  const audit = (
    await db.query<any>("select * from team_audit order by created_at")
  ).rows;
  expect(audit).toHaveLength(5);
  expect(audit.at(-1).before.display_name).toBe("Alex");
  expect(audit.at(-1).after.display_name).toBe("New own name");
  await expect(
    db.exec("update team_audit set action='tamper'"),
  ).rejects.toThrow("Append-only");
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    member,
  ]);
  await db.exec("set role authenticated");
  expect((await db.query("select * from team_audit")).rows).toHaveLength(5);
  await expect(change(member, owner, "deactivate")).rejects.toThrow(
    "permission denied",
  );
  await db.exec("reset role");
  await db.query(
    "update staff_users set status='deactivated' where user_id=$1",
    [member],
  );
  await db.exec("set role authenticated");
  expect((await db.query("select * from team_audit")).rows).toHaveLength(0);
  await db.close();
});
