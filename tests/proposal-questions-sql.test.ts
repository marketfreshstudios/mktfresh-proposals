import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

it("keeps question tables and functions private and enforces the workspace and hourly limit", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;" +
        "create table workspaces(id uuid primary key); create table proposals(id uuid primary key,workspace_id uuid,state jsonb);" +
        "grant select,update on proposals to service_role;",
    );
    for (const migration of [
      "20261108201349_proposal_engagement",
      "20261109020015_proposal_questions",
    ])
      await db.exec(
        await readFile(`supabase/migrations/${migration}.sql`, "utf8"),
      );
    const workspace = crypto.randomUUID(),
      proposal = crypto.randomUUID();
    const state = {
      status: "sent",
      token: "test-token",
      source: "native",
      revision: 9,
      signers: [],
      valid_until: null,
    };
    await db.query("insert into workspaces values($1)", [workspace]);
    await db.query("insert into proposals values($1,$2,$3)", [
      proposal,
      workspace,
      state,
    ]);
    const thread = () => ({
      proposal_id: proposal,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: "open",
      revision: 0,
    });
    const question = thread();
    const mail = [
      { id: crypto.randomUUID(), snapshot: { template_key: "staff_question" } },
    ];
    const write = (
      data = question,
      tenant = workspace,
      previous: number | null = null,
      revision = 9,
      outgoing: object[] = [],
    ) =>
      db.query<{ result: string }>(
        "select public.write_proposal_question($1,$2,$3,$4,$5) as result",
        [tenant, previous, revision, data, JSON.stringify(outgoing)],
      );
    const claim = () =>
      db.query("select * from public.claim_proposal_question_mail($1,$2)", [
        workspace,
        proposal,
      ]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of ["proposal_questions", "proposal_question_mail"]) {
        await expect(db.query(`select * from ${table}`)).rejects.toMatchObject({
          code: "42501",
        });
        await expect(db.query(`delete from ${table}`)).rejects.toMatchObject({
          code: "42501",
        });
      }
      await expect(write()).rejects.toMatchObject({ code: "42501" });
      await expect(claim()).rejects.toMatchObject({ code: "42501" });
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    expect((await write(question, crypto.randomUUID())).rows[0].result).toBe(
      "closed",
    );
    expect((await write(question, workspace, null, 8)).rows[0].result).toBe(
      "stale",
    );
    expect(
      (await write(question, workspace, null, 9, mail)).rows[0].result,
    ).toBe("saved");
    expect((await write()).rows[0].result).toBe("stale");
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
    expect(
      (
        await write(
          { ...question, status: "answered", revision: 1 },
          workspace,
          0,
        )
      ).rows[0].result,
    ).toBe("saved");
    for (let i = 0; i < 9; i++)
      expect((await write(thread())).rows[0].result).toBe("saved");
    expect((await write(thread())).rows[0].result).toBe("limited");
    expect(
      (await db.query("select data from proposal_engagement")).rows,
    ).toHaveLength(10);
    expect(
      (await db.query("select * from proposal_engagement_totals")).rows,
    ).toHaveLength(0);
    expect((await db.query("select state from proposals")).rows).toEqual([
      { state },
    ]);
    await db.query("update proposals set state=$2 where id=$1", [
      proposal,
      { ...state, status: "expired" },
    ]);
    expect((await write(thread())).rows[0].result).toBe("closed");
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname in ('proposal_questions','proposal_question_mail')",
    );
    expect(rls.rows).toEqual([
      { relrowsecurity: true },
      { relrowsecurity: true },
    ]);
  } finally {
    await db.close();
  }
});
