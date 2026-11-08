import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { setup, staff } from "./helpers";
import { prepareLinkedSave } from "../src/lib/saved-blocks";
import { stampSavedBlocks } from "../src/lib/linked-blocks";
import type { SavedBlock, Template } from "../src/lib/model";
it("hosted save is service-only, workspace scoped, atomic across templates/drafts/history, and refuses a stale or signed participant", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table workspaces(id uuid primary key);create table templates(id uuid primary key,workspace_id uuid,data jsonb);create table content_library(id uuid primary key,workspace_id uuid,data jsonb);create table proposals(id uuid primary key,workspace_id uuid,state jsonb);create table workspace_events(id uuid primary key,workspace_id uuid,data jsonb);",
    );
    await db.exec(
      "create function public.save_proposal(doc jsonb,expected integer) returns void language plpgsql as $$ begin update public.proposals set state=doc where id=(doc->>'id')::uuid and (state->>'revision')::int=expected; if not found then raise exception 'Revision conflict';end if;end $$;",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261108015810_linked_saved_blocks.sql",
        "utf8",
      ),
    );
    const f = await setup(),
      row: SavedBlock = {
        id: crypto.randomUUID(),
        name: "Shared",
        block: { id: crypto.randomUUID(), type: "paragraph", text: "Before" },
      },
      template = (await f.repo.entities<Template>("templates"))[0];
    template.content = stampSavedBlocks(row);
    f.draft.content = stampSavedBlocks(row);
    await f.repo.put("templates", template);
    await f.repo.put("content_library", row);
    await f.repo.save(f.draft, f.draft.revision);
    const ws = f.repo.workspaceId;
    await db.query("insert into workspaces values($1)", [ws]);
    await db.query("insert into templates values($1,$2,$3)", [
      template.id,
      ws,
      JSON.stringify(template),
    ]);
    await db.query("insert into content_library values($1,$2,$3)", [
      row.id,
      ws,
      JSON.stringify(row),
    ]);
    await db.query("insert into proposals values($1,$2,$3)", [
      f.draft.id,
      ws,
      JSON.stringify(f.draft),
    ]);
    const change = await prepareLinkedSave(
        f.repo,
        row,
        { ...row, block: { ...row.block, text: "After" } },
        staff,
        true,
      ),
      audit = {
        id: crypto.randomUUID(),
        ...staff,
        type: "content_library_saved",
        created_at: new Date().toISOString(),
        metadata: { name: row.name },
      };
    const call = async (c = change, a = audit) =>
      (
        await db.query<{ saved: boolean }>(
          "select save_linked_block($1,$2,$3) as saved",
          [ws, JSON.stringify(c), JSON.stringify(a)],
        )
      ).rows[0].saved;
    await db.query(
      "update proposals set state=jsonb_set(state,'{revision}','999') where id=$1",
      [f.draft.id],
    );
    expect(await call()).toBe(false);
    expect(
      (await db.query<{ data: SavedBlock }>("select data from content_library"))
        .rows[0].data,
    ).toEqual(row);
    expect(
      (await db.query("select * from workspace_events")).rows,
    ).toHaveLength(0);
    await db.query("update proposals set state=$2 where id=$1", [
      f.draft.id,
      JSON.stringify(f.draft),
    ]);
    expect(await call()).toBe(true);
    expect(
      (await db.query<{ data: SavedBlock }>("select data from content_library"))
        .rows[0].data,
    ).toEqual(change.after);
    expect(
      (await db.query<{ state: any }>("select state from proposals")).rows[0]
        .state,
    ).toEqual(change.proposals[0].after);
    expect(
      (await db.query("select * from workspace_events")).rows,
    ).toHaveLength(1);
    expect(await call()).toBe(false);
    // A late audit failure also rolls back a source write, not just stale CAS.
    await expect(
      call({
        before: change.after,
        after: { ...change.after!, name: "Must roll back" },
        templates: [],
        proposals: [],
        events: [],
      }),
    ).rejects.toThrow(/duplicate key/);
    expect(
      (await db.query<{ data: SavedBlock }>("select data from content_library"))
        .rows[0].data,
    ).toEqual(change.after);
    await db.exec("set role authenticated");
    await expect(call()).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    const other = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [other]);
    expect(
      (
        await db.query<{ saved: boolean }>(
          "select save_linked_block($1,$2,$3) as saved",
          [
            other,
            JSON.stringify(change),
            JSON.stringify({ ...audit, id: crypto.randomUUID() }),
          ],
        )
      ).rows[0].saved,
    ).toBe(false);
    const signed = {
      ...change.proposals[0].after,
      status: "signed_by_client",
      signers: [{ role: "client" }],
    };
    await db.query("update proposals set state=$2 where id=$1", [
      signed.id,
      JSON.stringify(signed),
    ]);
    const invalid = {
      ...change,
      before: change.after,
      proposals: [{ before: signed, after: { ...signed, content: [] } }],
      templates: [],
    };
    await expect(
      call(invalid as any, { ...audit, id: crypto.randomUUID() }),
    ).rejects.toThrow(/Only unsigned unsent drafts/);
  } finally {
    await db.close();
  }
});
