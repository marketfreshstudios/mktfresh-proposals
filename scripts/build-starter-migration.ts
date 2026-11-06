/** Regenerate the checked-in migration payload after an approved wording change. */
import { readFile, writeFile } from "node:fs/promises";
import { starterTemplates } from "../seed/starter-templates";
const path =
  process.argv[2] ??
  "supabase/migrations/20261106203920_cover_layout_defaults.sql";
const sql = await readFile(path, "utf8");
const payload = starterTemplates("00000000-0000-4000-8000-000000000000").map(
  ({ id, ...t }) => t,
);
await writeFile(
  path,
  sql.replace(
    /-- BEGIN STARTER PAYLOAD[\s\S]*?-- END STARTER PAYLOAD/,
    `-- BEGIN STARTER PAYLOAD\n$starter$${JSON.stringify(payload)}$starter$::jsonb\n-- END STARTER PAYLOAD`,
  ),
);
