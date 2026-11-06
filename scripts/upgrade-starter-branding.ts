import { runtime } from "../src/lib/runtime";
import { supabase } from "../src/lib/repository";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
import { starterBrandUpdates } from "../seed/starter-brand-updates";
import type { Item, Template } from "../src/lib/model";
const rt = runtime(LOCAL_WORKSPACE_ID);
const rows = starterBrandUpdates(
  LOCAL_WORKSPACE_ID,
  await rt.repo.entities<Item>("pricing_items"),
  await rt.repo.entities<Template>("templates"),
);
for (const row of rows) console.log(`${row.name}: ${row.reason}`);
if (!process.argv.includes("--confirm"))
  console.log(
    "Dry run. Add --confirm to update only unchanged MarketFresh starters. Proposals and versions are never updated.",
  );
else
  for (const row of rows.filter((r) => r.eligible)) {
    if (process.env.APP_MODE === "local") {
      const current = (await rt.repo.entities<Template>("templates")).find(
        (t) => t.id === row.before!.id,
      );
      if (JSON.stringify(current) !== JSON.stringify(row.before))
        throw new Error("Template changed; rerun the dry run");
      await rt.repo.put("templates", row.after);
    } else {
      const { data, error } = await supabase().rpc(
        "upgrade_seed_template_branding",
        {
          p_workspace: LOCAL_WORKSPACE_ID,
          p_id: row.before!.id,
          p_expected: row.before,
          p_cover: row.after.cover,
          p_bands: row.after.header_footer,
        },
      );
      if (error) throw error;
      if (!data)
        throw new Error(
          `${row.name} changed; no update made. Rerun the dry run.`,
        );
    }
    console.log(`Updated ${row.name}`);
  }
