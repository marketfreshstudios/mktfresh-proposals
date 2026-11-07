import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import {
  writeStudioEntity,
  studioRevision,
  restoreConnectorChange,
  studioEntityViews,
  connectorActivityViews,
} from "../src/lib/studio-history";
import type { Template, Audit } from "../src/lib/model";
const editorId = "00000000-0000-4000-8000-000000000002";
const ai = (workspace: string) => ({
  actor: "ai:Claude",
  workspace_id: workspace,
  on_behalf_of_user_id: editorId,
  on_behalf_of_name: "Taylor Editor",
  ip: "",
  user_agent: "MCP",
});
it("connector update keeps the entire previous state atomically; the recorded Staff editor or Super admin can restore", async () => {
  const f = await setup(),
    before = (await f.repo.entities<Template>("templates"))[0],
    proposals = await f.repo.list();
  const next = await writeStudioEntity(
    f.repo,
    "templates",
    before,
    { ...before, name: "Claude's draft copy" },
    ai(f.repo.workspaceId),
    {
      connector: true,
      type: "connector_template_updated",
      revision: studioRevision(before),
    },
  );
  const event = (await f.repo.entities<Audit>("workspace_events")).find(
    (e) => e.type === "connector_template_updated",
  )!;
  expect(event.metadata.before).toEqual(before);
  expect(event.metadata.after_revision).toBe(next.revision);
  await expect(
    restoreConnectorChange(f.repo, event.id, {
      ...staff,
      staff_role: "member",
      actor: "staff:" + crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 403 });
  const restored = await restoreConnectorChange(f.repo, event.id, {
    ...staff,
    staff_role: "member",
    actor: `staff:${editorId}`,
  });
  expect(restored.name).toBe(before.name);
  expect(await f.repo.list()).toEqual(proposals);
});
it("stale connector revisions and restore cannot overwrite a later staff edit", async () => {
  const f = await setup(),
    before = (await f.repo.entities<Template>("templates"))[0];
  const next = await writeStudioEntity(
    f.repo,
    "templates",
    before,
    { ...before, name: "AI wording" },
    ai(f.repo.workspaceId),
    {
      connector: true,
      type: "connector_template_updated",
      revision: studioRevision(before),
    },
  );
  const event = (await f.repo.entities<Audit>("workspace_events")).find(
    (e) => e.type === "connector_template_updated",
  )!;
  await expect(
    writeStudioEntity(
      f.repo,
      "templates",
      next,
      { ...next, name: "Stale AI retry" },
      ai(f.repo.workspaceId),
      { connector: true, revision: studioRevision(before) },
    ),
  ).rejects.toMatchObject({ status: 409 });
  await writeStudioEntity(
    f.repo,
    "templates",
    next,
    { ...next, name: "Staff's current wording" },
    staff,
    { revision: next.revision },
  );
  await expect(
    restoreConnectorChange(f.repo, event.id, staff),
  ).rejects.toMatchObject({ status: 409 });
  expect((await f.repo.entities<Template>("templates"))[0].name).toBe(
    "Staff's current wording",
  );
});
it("only current permitted changes expose Restore; Activity never sends revision snapshots", async () => {
  const f = await setup(),
    before = (await f.repo.entities<Template>("templates"))[0];
  await writeStudioEntity(
    f.repo,
    "templates",
    before,
    { ...before, name: "AI revision" },
    ai(f.repo.workspaceId),
    { connector: true, type: "connector_template_updated" },
  );
  const rows = await f.repo.entities<Template>("templates"),
    events = await f.repo.entities<Audit>("workspace_events");
  expect(
    (await studioEntityViews(f.repo, "templates", rows, staff))[0]
      .connector_restore_event_id,
  ).toBeTruthy();
  const activity = await connectorActivityViews(f.repo, events, staff),
    event = activity.find((e) => e.type === "connector_template_updated")!;
  expect(event.metadata.before).toBeUndefined();
  expect(event.metadata.after).toBeUndefined();
  expect(event.metadata.can_restore).toBe(true);
});
it("generic hosted CAS is workspace scoped, append-only and rollback-safe for both entity tables", async () => {
  const { PGlite } = await import("@electric-sql/pglite"),
    { readFile } = await import("node:fs/promises"),
    db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table templates(id uuid primary key,workspace_id uuid,data jsonb);create table content_library(id uuid primary key,workspace_id uuid,data jsonb);create table workspace_events(id uuid primary key,workspace_id uuid,data jsonb);",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261107090000_connector_studio_history.sql",
        "utf8",
      ),
    );
    for (const table of ["templates", "content_library"]) {
      const id = crypto.randomUUID(),
        workspace = crypto.randomUUID(),
        before = { id, name: "Before" },
        after = { id, name: "After" },
        event = { id: crypto.randomUUID() };
      await db.query(`insert into ${table} values($1,$2,$3)`, [
        id,
        workspace,
        before,
      ]);
      const call = (
        w: string,
        expected: object | null,
        value: object,
        audit: object,
      ) =>
        db.query<{ ok: boolean }>(
          "select save_studio_entity($1,$2,$3,$4,$5,$6) ok",
          [w, table, id, expected, value, audit],
        );
      expect(
        (await call(crypto.randomUUID(), before, after, event)).rows[0].ok,
      ).toBe(false);
      expect((await call(workspace, before, after, event)).rows[0].ok).toBe(
        true,
      );
      expect(
        (await call(workspace, before, after, { id: crypto.randomUUID() }))
          .rows[0].ok,
      ).toBe(false);
      await expect(call(workspace, after, before, event)).rejects.toThrow();
      expect(
        (
          await db.query<{ data: object }>(
            `select data from ${table} where id=$1`,
            [id],
          )
        ).rows[0].data,
      ).toEqual(after);
    }
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','public.save_studio_entity(uuid,text,uuid,jsonb,jsonb,jsonb)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await db.close();
  }
});
