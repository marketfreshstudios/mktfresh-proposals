import { runtime } from "../src/lib/runtime";
import { supabase } from "../src/lib/repository";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
import { starterTemplates } from "../seed/starter-templates";
import type { Item, Template } from "../src/lib/model";
// Workspace 1 only; this script is an owner-run backfill, never an app startup action.
const rt = runtime(LOCAL_WORKSPACE_ID);
const catalog = await rt.repo.entities<Item>("pricing_items");
const templates = starterTemplates(LOCAL_WORKSPACE_ID, {
  marketfresh: true,
  catalog,
});
const existing = await rt.repo.entities<Template>("templates");
const missing = templates.filter(
  (t) => !existing.some((e) => e.starter_key === t.starter_key),
);
console.log(
  `${missing.length} starter templates to add; existing starters will be kept. The old sample will be hidden, not deleted.`,
);
for (const t of templates)
  console.log(
    `${t.name}: ${t.default_items?.length ?? 0} default quote items${["website-design-build", "website-care-hosting", "local-visibility-seo", "website-ai-audit"].includes(t.starter_key!) && !t.default_items?.length ? " (catalog items missing; quote left empty)" : ""}`,
  );
if (!process.argv.includes("--confirm"))
  console.log("Dry run. Add --confirm to apply.");
else if (process.env.APP_MODE === "local") {
  for (const t of missing) await rt.repo.put("templates", t);
  const old = existing.find(
    (t) =>
      t.id === "00000000-0000-4000-8000-000000000020" &&
      t.name === "Website proposal sample",
  );
  if (old)
    await rt.repo.put("templates", {
      ...old,
      name: "Website proposal sample (old)",
      active: false,
    });
} else {
  const { data, error } = await supabase().rpc("provision_starter_templates", {
    p_workspace: LOCAL_WORKSPACE_ID,
    p_templates: templates,
    p_retire_sample: true,
  });
  if (error) throw error;
  console.log(`Added ${data} starter templates.`);
}
