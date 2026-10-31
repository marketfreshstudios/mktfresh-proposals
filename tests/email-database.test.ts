import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
it("email storage migration scopes reads, denies direct/AI writes, atomically audits edits and preserves sent content", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const workspace = "00000000-0000-4000-8000-000000000001",
    other = "00000000-0000-4000-8000-000000000002",
    user = "00000000-0000-4000-8000-000000000011",
    id = "00000000-0000-4000-8000-000000000021",
    event = "00000000-0000-4000-8000-000000000031";
  await db.query(
    "insert into workspaces(id,name) values($1,'Other workspace')",
    [other],
  );
  await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query(
    "insert into staff_users(user_id,workspace_id) values($1,$2)",
    [user, workspace],
  );
  const template = {
    id,
    key: "proposal_sent",
    subject: "Your proposal",
    body: { type: "doc" },
    button_label: "View proposal",
    version_id: event,
  };
  const audit = {
    id: event,
    type: "email_template_saved",
    actor: "staff:" + user,
    created_at: new Date().toISOString(),
    metadata: { key: "proposal_sent", version_id: event },
  };
  await db.exec("set role service_role");
  await db.query("select save_email_template($1,$2,$3)", [
    workspace,
    JSON.stringify(template),
    JSON.stringify(audit),
  ]);
  expect((await db.query("select * from email_templates")).rows).toHaveLength(
    1,
  );
  expect(
    (await db.query("select * from workspace_events where id=$1", [event]))
      .rows,
  ).toHaveLength(1);
  await expect(
    db.query("select save_email_template($1,$2,$3)", [
      workspace,
      JSON.stringify({ ...template, subject: "must roll back" }),
      JSON.stringify(audit),
    ]),
  ).rejects.toThrow();
  expect(
    (await db.query<any>("select data from email_templates where id=$1", [id]))
      .rows[0].data.subject,
  ).toBe("Your proposal");
  await db.query(
    "insert into email_log(id,workspace_id,data) values($1,$2,$3)",
    [
      id,
      workspace,
      JSON.stringify({
        proposal_id: "proposal",
        snapshot: { subject: "Frozen subject", html: "<p>Frozen</p>" },
      }),
    ],
  );
  await expect(db.exec("update email_log set data='{}'")).rejects.toThrow(
    "Append-only",
  );
  await expect(db.exec("delete from email_log")).rejects.toThrow("Append-only");
  await expect(
    db.query("select save_email_template($1,$2,$3)", [
      other,
      JSON.stringify(template),
      JSON.stringify({ ...audit, id: crypto.randomUUID() }),
    ]),
  ).rejects.toThrow("Template not found");
  await db.query(
    "insert into email_templates(id,workspace_id,data) values($1,$2,$3)",
    [
      crypto.randomUUID(),
      other,
      JSON.stringify({ ...template, id: crypto.randomUUID() }),
    ],
  );
  await db.query(
    "insert into email_log(id,workspace_id,data) values($1,$2,$3)",
    [
      crypto.randomUUID(),
      other,
      JSON.stringify({
        snapshot: { subject: "Other workspace private email" },
      }),
    ],
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
  expect((await db.query("select * from email_templates")).rows).toHaveLength(
    1,
  );
  expect((await db.query("select * from email_log")).rows).toHaveLength(1);
  await expect(db.exec("update email_templates set data='{}'")).rejects.toThrow(
    "permission denied",
  );
  await expect(
    db.query("select save_email_template($1,$2,$3)", [
      workspace,
      JSON.stringify(template),
      JSON.stringify(audit),
    ]),
  ).rejects.toThrow("permission denied");
  await db.exec("set role anon");
  await expect(db.exec("select * from email_log")).rejects.toThrow(
    "permission denied",
  );
  await db.close();
});
