/** Regenerate the checked-in migration payload after an approved wording change. */
import { readFile, writeFile } from "node:fs/promises";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
import { starterTemplates } from "../seed/starter-templates";
const path =
  process.argv[2] ??
  "supabase/migrations/20261107225320_social_media_starter.sql";
const sql = await readFile(path, "utf8");
const payload = starterTemplates("00000000-0000-4000-8000-000000000000").map(
  ({ id, ...t }) => t,
);
let generated = sql.replace(
  /-- BEGIN STARTER PAYLOAD[\s\S]*?-- END STARTER PAYLOAD/,
  `-- BEGIN STARTER PAYLOAD\n$starter$${JSON.stringify(payload)}$starter$::jsonb\n-- END STARTER PAYLOAD`,
);
if (generated.includes("-- BEGIN SOCIAL PAYLOAD")) {
  const social = starterTemplates(LOCAL_WORKSPACE_ID, {
    marketfresh: true,
  }).find((t) => t.starter_key === "social-media-management")!;
  generated = generated.replace(
    /-- BEGIN SOCIAL PAYLOAD[\s\S]*?-- END SOCIAL PAYLOAD/,
    `-- BEGIN SOCIAL PAYLOAD\n$social$${JSON.stringify(social)}$social$::jsonb\n-- END SOCIAL PAYLOAD`,
  );
}
await writeFile(path, generated);
