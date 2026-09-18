import { type Item, type Template } from "./model";
import { type Repository } from "./repository";
export const seedIds = {
  client: "00000000-0000-4000-8000-000000000010",
  template: "00000000-0000-4000-8000-000000000020",
};
export async function seed(repo: Repository, mockMappings = false) {
  const definitions: [
    string,
    string,
    number,
    "one_time" | "monthly",
    boolean,
  ][] = [
    ["audit", "AI Search Readiness Audit", 29500, "one_time", true],
    ["build", "Website Build — Own It Now", 275000, "one_time", true],
    ["oiot-kickoff", "Own It Over Time Kickoff", 50000, "one_time", true],
    ["oiot-monthly", "Own It Over Time", 17500, "monthly", true],
    ["hosting-essentials", "Hosting + Essentials", 2500, "monthly", true],
    ["care-lite", "Care Lite", 4900, "monthly", true],
    ["care-standard", "Care Standard", 8500, "monthly", true],
    ["care-pro", "Care Pro", 14900, "monthly", true],
    ["hosting", "Hosting for care clients", 1500, "monthly", true],
    ["visibility-core", "Local Visibility Core", 29500, "monthly", true],
    ["visibility-growth", "Local Visibility Growth", 49500, "monthly", true],
    ["hosted-standard", "Hosted Standard", 10000, "monthly", true],
    ["legacy-audit", "Legacy Audit", 75000, "one_time", false],
    ["legacy-build", "Legacy Build", 250000, "one_time", false],
  ];
  const existing = await repo.entities<Item>("pricing_items");
  for (const [
    index,
    [sku, name, unit_price, billing, active],
  ] of definitions.entries()) {
    const id = `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
    if (existing.some((i) => i.sku === sku)) continue;
    await repo.put("pricing_items", {
      id,
      sku,
      name,
      unit_price,
      billing,
      active,
      description: "",
      qbo_item_id:
        mockMappings && billing === "one_time" ? "mock_item_" + sku : null,
      stripe_price_id:
        mockMappings && billing === "monthly" ? "mock_price_" + sku : null,
    });
  }
  const template: Template = {
    id: seedIds.template,
    name: "Website proposal sample",
    active: true,
    content: [
      { type: "heading", text: "{{proposal.title}}" },
      {
        type: "paragraph",
        text: "Prepared for {{client.company}}. Your investment is {{quote.one_time_total}} and {{quote.monthly_total}} per month.",
      },
      { type: "pricing_table" },
      { type: "signature_block", role: "client" },
      { type: "signature_block", role: "company" },
    ],
    default_quote: [
      {
        pricing_item_id: "00000000-0000-4000-8000-000000000101",
        qty: 1,
        optional: false,
        selected: true,
      },
      {
        pricing_item_id: "00000000-0000-4000-8000-000000000104",
        qty: 1,
        optional: true,
        selected: true,
      },
    ],
  };
  if (
    !(await repo.entities<Template>("templates")).some(
      (t) => t.id === template.id,
    )
  )
    await repo.put("templates", template);
}
