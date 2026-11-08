import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { emptyEngagement } from "../src/lib/engagement";
it("engagement SQL denies anon/authenticated tables and RPC; service-only CAS is scoped, deduped and durably rate-limited", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create table workspaces(id uuid primary key);create table proposals(id uuid primary key,workspace_id uuid,state jsonb);grant select,update on proposals to service_role;",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261108201349_proposal_engagement.sql",
        "utf8",
      ),
    );
    const workspace = crypto.randomUUID(),
      proposal = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [workspace]);
    await db.query("insert into proposals values($1,$2,$3)", [
      proposal,
      workspace,
      JSON.stringify({ status: "sent", token: "example", archived_at: null }),
    ]);
    const s = {
      id: crypto.randomUUID(),
      proposal_id: proposal,
      seq: 1,
      started_at: new Date().toISOString(),
      count_view: true,
    };
    const summary = { ...emptyEngagement(proposal), revision: 1, views: 1 };
    const call = () =>
      db.query<{ result: string }>(
        "select record_proposal_engagement($1,0,$2,$3) as result",
        [workspace, JSON.stringify(s), JSON.stringify(summary)],
      );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of [
        "proposal_engagement",
        "proposal_engagement_totals",
      ]) {
        await expect(db.query(`select * from ${table}`)).rejects.toMatchObject({
          code: "42501",
        });
        await expect(db.query(`delete from ${table}`)).rejects.toMatchObject({
          code: "42501",
        });
        await expect(
          db.query(
            `insert into ${table}(id,workspace_id,data) values($1,$2,'{}')`,
            [s.id, workspace],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      }
      await expect(call()).rejects.toMatchObject({ code: "42501" });
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    expect((await call()).rows[0].result).toBe("saved");
    expect((await call()).rows[0].result).toBe("stale");
    expect(
      (
        await db.query<{ data: any }>(
          "select data from proposal_engagement_totals",
        )
      ).rows[0].data.views,
    ).toBe(1);
    const other = await db.query<{ result: string }>(
      "select record_proposal_engagement($1,1,$2,$3) as result",
      [
        crypto.randomUUID(),
        JSON.stringify({ ...s, seq: 2 }),
        JSON.stringify({ ...summary, revision: 2 }),
      ],
    );
    expect(other.rows[0].result).toBe("stale");
    await db.query(
      "update proposal_engagement_totals set rate_count=600 where id=$1",
      [proposal],
    );
    expect((await call()).rows[0].result).toBe("limited");
    expect(
      (await db.query("select * from proposal_engagement")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ data: any }>(
          "select data from proposal_engagement_totals",
        )
      ).rows[0].data,
    ).toEqual(summary);
    await db.exec("reset role");
    expect(
      (
        await db.query<{ relrowsecurity: boolean }>(
          "select relrowsecurity from pg_class where relname in ('proposal_engagement','proposal_engagement_totals')",
        )
      ).rows.every((r) => r.relrowsecurity),
    ).toBe(true);
  } finally {
    await db.close();
  }
});
