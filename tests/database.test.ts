import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { expect, it } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
it("applies migration to fresh PostgreSQL, enforces RLS, CAS, append-only audit and frozen versions", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile("supabase/migrations/20260918190502_phase1.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261029154748_workspace_isolation.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261029155924_provider_state.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261029161033_ai_connector.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261029164822_catalogue_line_upgrade.sql",
      "utf8",
    ),
  );
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  await db.query("insert into clients(id,data,workspace_id) values($1,$2,$3)", [
    p.client.id,
    JSON.stringify(p.client),
    repo.workspaceId,
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
  expect(
    (
      await db.query<{ data: { client_flow_version: number } }>(
        "select data from proposal_versions",
      )
    ).rows[0].data.client_flow_version,
  ).toBe(2);
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
  await db.query("insert into auth.users(id) values($1)", [
    staff.actor.slice(6),
  ]);
  await db.query(
    "insert into staff_users(user_id,workspace_id) values($1,'00000000-0000-4000-8000-000000000001')",
    [staff.actor.slice(6)],
  );
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
  changed.versions[0].quote[0].amount = 1;
  await expect(
    db.query("select save_proposal($1::jsonb,0)", [JSON.stringify(changed)]),
  ).rejects.toThrow("Frozen evidence");
  await db.query("select save_proposal($1::jsonb,0)", [
    JSON.stringify({ ...document, revision: 1 }),
  ]);
  await db.exec(
    "insert into workspaces values('00000000-0000-4000-8000-000000000002','Other workspace')",
  );
  await db.query(
    "insert into clients(id,workspace_id,data) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002',$1)",
    [
      JSON.stringify({
        ...p.client,
        id: "00000000-0000-4000-8000-000000000011",
      }),
    ],
  );
  // Linked references reuse these protected tables: credentials stay private and versions append-only.
  await db.exec(`
    insert into workspace_documents values
      ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000001','{"content":"own reference"}'),
      ('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000002','{"content":"other reference"}');
    insert into provider_credentials values ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000001','{"ciphertext":"encrypted"}');
    insert into workspace_events values ('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000001','{"type":"document_version","content":"frozen"}');
  `);
  await expect(
    db.exec("update workspace_events set data='{}'"),
  ).rejects.toThrow("Append-only");
  await db.exec("set role authenticated");
  expect(
    (await db.query("select * from workspace_documents")).rows,
  ).toHaveLength(1);
  await expect(db.exec("select * from provider_credentials")).rejects.toThrow(
    "permission denied",
  );
  await expect(db.exec("select * from provider_actions")).rejects.toThrow(
    "permission denied",
  );
  await db.exec("reset role");
  await db.exec("set role authenticated");
  expect((await db.query("select * from clients")).rows).toHaveLength(1);
  expect((await db.query("select * from workspaces")).rows).toHaveLength(1);
  await db.exec("reset role");
  await expect(
    db.exec(
      "update clients set workspace_id='00000000-0000-4000-8000-000000000002' where id='" +
        p.client.id +
        "'",
    ),
  ).rejects.toThrow("Workspace is immutable");
  await expect(
    db.query("select save_proposal($1::jsonb,1)", [
      JSON.stringify({
        ...document,
        revision: 2,
        workspace_id: "00000000-0000-4000-8000-000000000002",
      }),
    ]),
  ).rejects.toThrow("Workspace mismatch");

  // Upgrade editable settings/profiles without changing proposal snapshots.
  await db.query(
    "insert into workspace_settings(id,workspace_id,data) values($1,$1,$2)",
    [
      repo.workspaceId,
      JSON.stringify({
        client_url: "https://legacy.example.test",
        email_sender_name: "Legacy",
        email_sender_address: "legacy@example.test",
      }),
    ],
  );
  await db.query(
    "update auth.users set email='alex@example.test',raw_user_meta_data=$1 where id=$2",
    [JSON.stringify({ full_name: "Alex Morgan" }), staff.actor.slice(6)],
  );
  const before = (await db.query("select state from proposals")).rows;
  await db.exec(
    await readFile(
      "supabase/migrations/20261029200247_staff_senders_and_canonical_links.sql",
      "utf8",
    ),
  );
  expect((await db.query("select display_name from staff_users")).rows).toEqual(
    [{ display_name: "Alex Morgan" }],
  );
  expect((await db.query("select data from workspace_settings")).rows).toEqual([
    { data: { sending_domain: "" } },
  ]);
  expect((await db.query("select state from proposals")).rows).toEqual(before);
  await db.exec(
    "insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000003','new@example.test'); insert into staff_users(user_id,workspace_id) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001')",
  );
  expect(
    (
      await db.query(
        "select display_name from staff_users where user_id='00000000-0000-4000-8000-000000000003'",
      )
    ).rows,
  ).toEqual([{ display_name: "new@example.test" }]);
  await db.exec("set role authenticated");
  await expect(
    db.exec("update staff_users set display_name='forged',role='owner'"),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role");
  const frozenBefore = (
    await db.query("select data from proposal_versions order by id")
  ).rows;
  await db.query(
    "update workspace_settings set data=jsonb_set(data,'{money}',$1::jsonb) where workspace_id=$2",
    [JSON.stringify({ cents: "always" }), repo.workspaceId],
  );
  expect((await db.query("select state from proposals")).rows).toEqual(before);
  expect(
    (await db.query("select data from proposal_versions order by id")).rows,
  ).toEqual(frozenBefore);
  expect(
    (
      await db.query(
        "select data->'money' as money from workspace_settings where workspace_id=$1",
        [repo.workspaceId],
      )
    ).rows,
  ).toEqual([{ money: { cents: "always" } }]);
  await db.close();
});
