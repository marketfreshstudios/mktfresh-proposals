/** Read-only hosted dry run: emit compact checksum-guarded SQL for Claude to review/apply. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { runtime } from "../src/lib/runtime";
import { supabase, SupabaseRepository } from "../src/lib/repository";
import { starterEnglishSql } from "./starter-english-sql";
import { starterEnglishUpdates } from "../seed/starter-english-updates";
import type { Item, Template } from "../src/lib/model";
const historical: Template[] = [];
for (const file of [
  "20261106151436_starter_templates.sql",
  "20261106194431_cover_brand_defaults.sql",
  "20261106203920_cover_layout_defaults.sql",
  "20261107225320_social_media_starter.sql",
]) {
  const sql = await readFile(`supabase/migrations/${file}`, "utf8");
  historical.push(
    ...JSON.parse(sql.match(/\$starter\$([\s\S]*?)\$starter\$/)![1]),
  );
}
const workspaces =
  process.env.APP_MODE === "local"
    ? ["00000000-0000-4000-8000-000000000001"]
    : (
        await supabase().from("workspaces").select("id").throwOnError()
      ).data!.map((w) => w.id as string);
const db = await PGlite.create();
const updates: string[] = [
  "-- Apply BEFORE deploy, after the starter-copy migration. No new grants.",
  "begin;",
  "set local role service_role;",
];
let total = 0;
for (const workspace of workspaces) {
  const repo =
    process.env.APP_MODE === "local"
      ? runtime(workspace).repo
      : new SupabaseRepository(supabase(), workspace);
  const rows = starterEnglishUpdates(
    workspace,
    await repo.entities<Item>("pricing_items"),
    await repo.entities<Template>("templates"),
    historical,
  );
  console.log(
    `${workspace}: ${rows.length} untouched starters eligible (0–2 expected).`,
  );
  for (const row of rows) {
    const result = await db.query<{ hash: string }>(
      "select md5($1::jsonb::text) as hash",
      [JSON.stringify(row.before)],
    );
    updates.push(
      `-- ${row.before.starter_key}; exactly 1 row expected, or 0 if already applied/concurrently edited.`,
      starterEnglishSql(workspace, row.before, result.rows[0].hash),
    );
    total++;
  }
}
updates.push("commit;");
await db.close();
await mkdir(".data", { recursive: true });
await writeFile(
  ".data/american-english-starters.sql",
  updates.join("\n") + "\n",
);
console.log(
  `${total} updates prepared in .data/american-english-starters.sql. No hosted writes performed. Review and apply through the Supabase connector; rerun to verify 0 eligible.`,
);
