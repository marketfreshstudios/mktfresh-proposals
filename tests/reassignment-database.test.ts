import { addAuthSessionsFixture } from "./postgres-fixture";
import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { setup, staff } from "./helpers";
import { ReassignmentService } from "../src/lib/reassignment";
it("database reassignment is atomic, tenant-scoped, owner-guarded and unblocks removal without altering frozen evidence", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create table auth.sessions(id uuid primary key,user_id uuid);create table auth.refresh_tokens(user_id text,session_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.sessions to service_role;grant execute on function auth.uid() to authenticated;`,
  );
  await addAuthSessionsFixture(db);
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const f = await setup(),
    wid = f.repo.workspaceId,
    owner = staff.actor.slice(6),
    member = crypto.randomUUID(),
    foreign = crypto.randomUUID(),
    other = crypto.randomUUID();
  await db.query("insert into workspaces(id,name) values($1,'Other')", [other]);
  for (const id of [owner, member, foreign])
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      id + "@example.test",
    ]);
  await db.query(
    "insert into staff_users(user_id,workspace_id,role,display_name) values($1,$2,'owner','Alex'),($3,$2,'member','Jamie'),($4,$5,'owner','Foreign')",
    [owner, wid, member, foreign, other],
  );
  const person = {
    user_id: member,
    display_name: "Jamie",
    name: "Jamie",
    email: member + "@example.test",
    role: "member",
    status: "active",
  };
  const second = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Second",
    },
    staff,
  );
  await db.query("insert into clients(id,workspace_id,data) values($1,$2,$3)", [
    f.draft.client.id,
    wid,
    JSON.stringify(f.draft.client),
  ]);
  for (const p of [f.draft, second])
    await db.query("select save_proposal($1,-1)", [
      JSON.stringify(await f.repo.get(p.id)),
    ]);
  const r = new ReassignmentService(f.repo, async () => [...f.members, person]);
  const docs = await r.reassign(staff, {
    user_id: member,
    notify: false,
    proposals: [
      { id: f.draft.id, revision: 0 },
      { id: second.id, revision: 0 },
    ],
  });
  const assign = (actor: string, documents = docs) =>
    db.query("select reassign_proposals($1,$2,$3)", [
      wid,
      actor,
      JSON.stringify(documents),
    ]);
  await db.exec("set role authenticated");
  await expect(assign(owner)).rejects.toThrow("permission denied");
  await db.exec("reset role;set role service_role");
  await expect(assign(foreign)).rejects.toThrow("Staff access required");
  await expect(assign(member, [docs[0]])).rejects.toThrow(
    "only reassign proposals you own",
  );
  const bad = structuredClone(docs);
  bad[1].revision++;
  await expect(assign(owner, bad)).rejects.toThrow("Revision conflict");
  expect(
    (
      await db.query<any>("select state from proposals where id=$1", [
        f.draft.id,
      ])
    ).rows[0].state.owner,
  ).toBeUndefined();
  const content = structuredClone(docs);
  content[0].title = "Hacked";
  await expect(assign(owner, content)).rejects.toThrow(
    "cannot change proposal content",
  );
  await assign(owner);
  expect(
    (
      await db.query<any>(
        "select count(*)::int as n from workspace_events where data->>'type'='reassigned'",
      )
    ).rows[0].n,
  ).toBe(2);
  await expect(
    db.query("select change_team_member($1,$2,$3,'remove')", [
      wid,
      owner,
      member,
    ]),
  ).rejects.toThrow("unfinished proposals");
  // A draft's original creator remains history after assigning it away.
  const createdByMember = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Member-authored draft",
    },
    { ...staff, actor: "staff:" + member },
  );
  await db.query("select save_proposal($1,-1)", [
    JSON.stringify(await f.repo.get(createdByMember.id)),
  ]);
  const transferCreator = await r.reassign(staff, {
    user_id: owner,
    notify: false,
    proposals: [{ id: createdByMember.id, revision: 0 }],
  });
  await assign(owner, transferCreator);
  const back = await r.reassign(staff, {
    user_id: owner,
    notify: false,
    from_user_id: member,
    proposals: docs.map((p) => ({ id: p.id, revision: p.revision })),
  });
  await assign(owner, back);
  await db.query("select change_team_member($1,$2,$3,'remove')", [
    wid,
    owner,
    member,
  ]);
  expect(
    (
      await db.query<any>(
        "select count(*)::int as n from staff_users where user_id=$1",
        [member],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<any>("select state from proposals where id=$1", [
        f.draft.id,
      ])
    ).rows[0].state.created_by,
  ).toBe(staff.actor);
  await db.close();
});
