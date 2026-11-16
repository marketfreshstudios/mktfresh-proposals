import { expect, it } from "vitest";
import { postgresFixture } from "./postgres-fixture";

async function workspaceWithData(
  db: Awaited<ReturnType<typeof postgresFixture>>,
  slug: string,
) {
  const user = crypto.randomUUID();
  await db.query("insert into auth.users(id,email) values ($1,$2)", [
    user,
    `${slug}@x.test`,
  ]);
  await db.query("select public.reserve_workspace_signup($1,$2,$3,'Ann Lee')", [
    user,
    slug,
    slug,
  ]);
  const ws = (
    await db.query<{ workspace_id: string }>(
      "select * from public.complete_workspace_signup($1)",
      [user],
    )
  ).rows[0].workspace_id;
  const client = crypto.randomUUID(),
    proposal = crypto.randomUUID();
  await db.query(
    "insert into public.clients(id,data,workspace_id) values ($1,'{}',$2)",
    [client, ws],
  );
  await db.query(
    "insert into public.proposals(id,revision,state,client_id,title,status,source,created_at,updated_at,workspace_id) values ($1,1,'{}',$2,'P','completed','native',now(),now(),$3)",
    [proposal, client, ws],
  );
  await db.query(
    "insert into public.proposal_versions(id,proposal_id,version_no,data,workspace_id) values ($1,$2,1,'{\"frozen\":true}',$3)",
    [crypto.randomUUID(), proposal, ws],
  );
  await db.query(
    "insert into public.signers(proposal_id,role,data,workspace_id) values ($1,'client','{}',$2)",
    [proposal, ws],
  );
  await db.query(
    "insert into public.events(id,proposal_id,type,actor,created_at,data,workspace_id) values ($1,$2,'signed','client',now(),'{}',$3)",
    [crypto.randomUUID(), proposal, ws],
  );
  await db.query(
    "insert into public.files(id,proposal_id,kind,storage_path,sha256,data,workspace_id) values ($1,$2,'sealed',$3,'x','{}',$4)",
    [crypto.randomUUID(), proposal, `${ws}/sealed/${slug}.pdf`, ws],
  );
  return { ws, user, proposal };
}
const count = async (db: any, table: string, ws: string) =>
  Number(
    (
      await db.query(
        `select count(*)::int n from public.${table} where workspace_id=$1`,
        [ws],
      )
    ).rows[0].n,
  );

it("deletes a workspace's data 90 days after it closes, and nothing else", async () => {
  const db = await postgresFixture();
  const gone = await workspaceWithData(db, "closing");
  const kept = await workspaceWithData(db, "staying");

  // Not closed, or closed under 90 days ago: nothing to delete.
  await expect(
    db.query("select * from public.purge_workspace($1)", [gone.ws]),
  ).rejects.toThrow("not due for deletion");
  const closed = (
    await db.query<{ closed_at: string }>(
      "select public.close_workspace($1) as closed_at",
      [gone.ws],
    )
  ).rows[0].closed_at;
  expect(closed).toBeTruthy();
  const again = (
    await db.query<{ closed_at: string }>(
      "select public.close_workspace($1) as closed_at",
      [gone.ws],
    )
  ).rows[0].closed_at;
  expect(String(again)).toBe(String(closed));
  expect(
    (
      await db.query<{ plan_status: string }>(
        "select plan_status from public.workspaces where id=$1",
        [gone.ws],
      )
    ).rows[0].plan_status,
  ).toBe("canceled");
  expect(
    (await db.query("select * from public.workspaces_due_for_deletion()")).rows,
  ).toEqual([]);
  await expect(
    db.query("select * from public.purge_workspace($1)", [gone.ws]),
  ).rejects.toThrow("not due for deletion");

  await db.query(
    "update public.workspaces set closed_at = now() - interval '91 days' where id=$1",
    [gone.ws],
  );
  expect(
    (
      await db.query<{ workspaces_due_for_deletion: string }>(
        "select * from public.workspaces_due_for_deletion()",
      )
    ).rows.map((r) => Object.values(r)[0]),
  ).toEqual([gone.ws]);
  const members = (
    await db.query("select * from public.purge_workspace($1)", [gone.ws])
  ).rows.map((r: any) => Object.values(r)[0]);
  expect(members).toEqual([gone.user]);
  for (const table of [
    "clients",
    "proposals",
    "proposal_versions",
    "signers",
    "events",
    "files",
    "staff_users",
    "workspace_settings",
    "templates",
  ])
    expect(await count(db, table, gone.ws), table).toBe(0);
  expect(
    (await db.query("select 1 from public.workspaces where id=$1", [gone.ws]))
      .rows,
  ).toEqual([]);

  // The other workspace is untouched, and its records stay append-only.
  for (const table of [
    "proposals",
    "events",
    "files",
    "signers",
    "proposal_versions",
  ])
    expect(await count(db, table, kept.ws), table).toBe(1);
  await expect(
    db.query("delete from public.events where workspace_id=$1", [kept.ws]),
  ).rejects.toThrow("Append-only");
  await expect(
    db.query("delete from public.proposal_versions where workspace_id=$1", [
      kept.ws,
    ]),
  ).rejects.toThrow("immutable");
  // A purge setting for one workspace doesn't unlock another's records.
  await db.exec("begin");
  await db.query("select set_config('yeswell.purge_workspace', $1, true)", [
    gone.ws,
  ]);
  await expect(
    db.query("delete from public.events where workspace_id=$1", [kept.ws]),
  ).rejects.toThrow("Append-only");
  await db.exec("rollback");
});

it("removes stored files first, then the data, then the staff sign-ins", async () => {
  const { deleteClosedWorkspaces } =
    await import("../src/lib/workspace-deletion");
  const steps: string[] = [];
  const files = Array.from({ length: 150 }, (_, i) => `ws-a/f${i}.pdf`);
  const n = await deleteClosedWorkspaces({
    due: async () => ["ws-a", "ws-b"],
    files: async (w) => (w === "ws-a" ? files : []),
    removeFiles: async (p) => void steps.push(`remove ${p.length}`),
    purge: async (w) => {
      steps.push(`purge ${w}`);
      if (w === "ws-b") throw new Error("not due");
      return ["u1", "u2"];
    },
    deleteUser: async (u) => {
      steps.push(`user ${u}`);
      if (u === "u2") throw new Error("gone");
    },
  });
  expect(steps).toEqual([
    "remove 100",
    "remove 50",
    "purge ws-a",
    "user u1",
    "user u2",
    "purge ws-b",
  ]);
  // A failure on one doesn't stop the next; it's retried on a later run.
  expect(n).toBe(1);
});
