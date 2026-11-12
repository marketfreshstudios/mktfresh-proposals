import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  starterTemplates,
  starterCoverLayouts,
  workspaceStarterTemplates,
} from "../seed/starter-templates";
import { starterEnglishUpdates } from "../seed/starter-english-updates";
import { starterEnglishSql } from "../scripts/starter-english-sql";
import {
  preAmericanEnglishStarter,
  preTermsMoveStarter,
} from "../seed/starter-legacy-copy";
import oldCovers from "../seed/starter-covers-pr-a.json" with { type: "json" };
import { applyCoverLayout, type Cover } from "../src/lib/cover";
import type { Template } from "../src/lib/model";
const migration =
  "supabase/migrations/20261108220213_american_english_starter_copy.sql";
it("American default copy matches the hosted trigger; exact unedited starters update once, and concurrent or customized copies stay untouched", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table workspaces(id uuid primary key);create table templates(id uuid primary key,workspace_id uuid,data jsonb);create table pricing_items(id uuid primary key,workspace_id uuid,sku text,data jsonb);",
    );
    const historical: Template[] = [];
    for (const name of [
      "20261106151436_starter_templates",
      "20261106194431_cover_brand_defaults",
      "20261106203920_cover_layout_defaults",
      "20261107225320_social_media_starter",
    ]) {
      const sql = await readFile(`supabase/migrations/${name}.sql`, "utf8");
      await db.exec(sql);
      historical.push(
        ...JSON.parse(sql.match(/\$starter\$([\s\S]*?)\$starter\$/)![1]),
      );
    }
    const ws = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [ws]);
    const rows = (
      await db.query<{ data: Template }>(
        "select data from templates where workspace_id=$1",
        [ws],
      )
    ).rows.map((r) => r.data);
    const sql = await readFile(migration, "utf8");
    await db.exec(sql);
    const definition = (
      await db.query<{ d: string }>(
        "select pg_get_functiondef('seed_new_workspace_templates()'::regprocedure) d",
      )
    ).rows[0].d;
    await db.exec(sql);
    expect(
      (
        await db.query<{ d: string }>(
          "select pg_get_functiondef('seed_new_workspace_templates()'::regprocedure) d",
        )
      ).rows[0].d,
    ).toBe(definition);
    expect(
      (
        await db.query("select data from templates where workspace_id=$1", [ws])
      ).rows.map((r: any) => r.data),
    ).toEqual(rows);
    const next = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [next]);
    const current = (
      await db.query<{ data: Template }>(
        "select data from templates where workspace_id=$1 order by(data->>'starter_order')::int",
        [next],
      )
    ).rows.map((r) => r.data);
    expect(current.map(({ id, ...t }) => t)).toEqual(
      JSON.parse(
        JSON.stringify(
          starterTemplates("00000000-0000-4000-8000-000000000000")
            .map(preTermsMoveStarter)
            .map(({ id, ...t }) => ({
              ...t,
              ...(t.starter_key! in starterCoverLayouts && {
                cover: applyCoverLayout(
                  oldCovers[t.starter_key as keyof typeof oldCovers] as Cover,
                  "editorial",
                ),
              }),
            })),
        ),
      ),
    );
    const updates = starterEnglishUpdates(ws, [], rows, historical);
    expect(updates).toHaveLength(2);
    for (const { before, after } of updates) {
      const hash = (
        await db.query<{ hash: string }>("select md5($1::jsonb::text) hash", [
          JSON.stringify(before),
        ])
      ).rows[0].hash;
      const guarded = starterEnglishSql(ws, before, hash);
      expect(
        (await db.query<{ updated: number }>(guarded)).rows[0].updated,
      ).toBe(1);
      expect(
        (await db.query<{ updated: number }>(guarded)).rows[0].updated,
      ).toBe(0);
      expect(
        (
          await db.query<{ data: Template }>(
            "select data from templates where id=$1",
            [before.id],
          )
        ).rows[0].data,
      ).toEqual(after);
      await db.query("update templates set data=$1 where id=$2", [
        JSON.stringify({ ...before, name: "Concurrent rename" }),
        before.id,
      ]);
      expect(
        (await db.query<{ updated: number }>(guarded)).rows[0].updated,
      ).toBe(0);
      expect(
        starterEnglishUpdates(
          ws,
          [],
          [{ ...before, active: false, name: "Workspace name" }],
          historical,
        ),
      ).toHaveLength(1);
      expect(
        starterEnglishUpdates(
          ws,
          [],
          [
            {
              ...before,
              content: [
                ...before.content,
                { type: "paragraph", text: "Staff edit" },
              ],
            },
          ],
          historical,
        ),
      ).toEqual([]);
      expect(
        starterEnglishUpdates(
          ws,
          [],
          [{ ...before, cover: { ...before.cover!, elements: [] } }],
          historical,
        ),
      ).toEqual([]);
    }
    for (const role of ["anon", "authenticated"])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            `select has_function_privilege('${role}','seed_new_workspace_templates()','execute') allowed`,
          )
        ).rows[0].allowed,
      ).toBe(false);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('service_role','seed_new_workspace_templates()','execute') allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
  } finally {
    await db.close();
  }
});
it("new seed copy and preserved historical comparison remain distinct", () => {
  const current = workspaceStarterTemplates(
    "00000000-0000-4000-8000-000000000001",
    [],
  );
  for (const seed of current) {
    const before = preAmericanEnglishStarter(seed);
    if (JSON.stringify(before) !== JSON.stringify(seed))
      expect(
        starterEnglishUpdates(
          "00000000-0000-4000-8000-000000000001",
          [],
          [before],
        ),
      ).toHaveLength(1);
  }
});

it("connector snapshots generate executable guarded SQL without Supabase credentials or a pre-existing output folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starter-copy-"));
  try {
    const ws = crypto.randomUUID();
    const before = preAmericanEnglishStarter(
      workspaceStarterTemplates(ws, []).find(
        (t) => t.starter_key === "website-care-hosting",
      )!,
    );
    before.name = "Workspace care plan";
    before.active = false;
    const input = join(dir, "snapshot.json"),
      output = join(dir, "nested", "copy.sql");
    await writeFile(
      input,
      JSON.stringify({
        workspaces: [{ id: ws, catalog: [], templates: [before] }],
      }),
    );
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/americanize-starters.ts",
        "--input",
        input,
        "--output",
        output,
      ],
      {
        env: {
          ...process.env,
          SUPABASE_URL: "",
          SUPABASE_ANON_KEY: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
        },
      },
    );
    expect(stdout).toContain("1 untouched starter eligible");
    expect(stdout).toContain("No hosted writes performed");
    const db = await PGlite.create();
    try {
      await db.exec(
        "create role service_role;create table public.templates(id uuid,workspace_id uuid,data jsonb);grant select,update on public.templates to service_role;",
      );
      await db.query("insert into templates values($1,$2,$3)", [
        before.id,
        ws,
        JSON.stringify(before),
      ]);
      await db.exec(await readFile(output, "utf8"));
      const after = (
        await db.query<{ data: Template }>("select data from templates")
      ).rows[0].data;
      expect(after.name).toBe(before.name);
      expect(after.active).toBe(false);
      expect(JSON.stringify(after.content)).toContain("can be canceled");
      expect(JSON.stringify(after.content)).not.toContain("cancelled");
      await db.exec(await readFile(output, "utf8"));
      expect(
        (await db.query<{ data: Template }>("select data from templates"))
          .rows[0].data,
      ).toEqual(after);
    } finally {
      await db.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
