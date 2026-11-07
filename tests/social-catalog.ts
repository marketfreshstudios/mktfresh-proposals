import { ItemSchema, type Item } from "../src/lib/model";
import { starterId } from "../seed/starter-templates";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
/** Local fixtures only. Production always copies the actual SKU-matched catalog. */
export function socialCatalog(): Item[] {
  return [
    ["social-starter-595", "Starter", 59500],
    ["social-growth-995", "Growth", 99500],
    ["social-pro-1650", "Pro", 165000],
    ["social-premium-2200", "Premium", 220000],
  ].map(([sku, plan, amount]) =>
    ItemSchema.parse({
      id: starterId(LOCAL_WORKSPACE_ID, String(sku)),
      sku,
      name: `Social Media Management ${plan}`,
      amount,
      interval: "month",
      stripe_lookup_key: sku,
      description: `Monthly social media management — ${plan}`,
      active: true,
      min_term_months: 3,
    }),
  );
}
