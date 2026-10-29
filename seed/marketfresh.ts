import { CONSENT } from "../src/lib/content";
import { ItemSchema, type Item, type Template } from "../src/lib/model";
import { type Repository } from "../src/lib/repository";
export const seedIds = {
  client: "00000000-0000-4000-8000-000000000010",
  template: "00000000-0000-4000-8000-000000000020",
};
export async function seed(repo: Repository, mockMappings = false) {
  if (!(await repo.entities("workspace_settings")).length)
    await repo.put("workspace_settings", {
      id: repo.workspaceId,
      company_name: "MarketFresh",
      owner: "Jonathan",
      email: "owner@example.test",
      phone: "",
      address: "",
      logo: null,
      accent_colour: "#365C4A",
      email_sender_name: "MarketFresh",
      email_sender_address: "proposals@example.test",
      consent_text: CONSENT,
      reminder_days: [3, 7],
      default_validity_days: 30,
      timezone: "America/New_York",
      client_url: "http://127.0.0.1:3000",
      qbo_custom_item_ref: mockMappings ? "mock-custom-services" : null,
      collection_method: "charge_automatically",
    });
  const definitions: [string, string, number, "one_time" | "month", boolean][] =
    [
      ["audit", "AI Search Readiness Audit", 29500, "one_time", true],
      ["build", "Website Build — Own It Now", 275000, "one_time", true],
      ["oiot-kickoff", "Own It Over Time Kickoff", 50000, "one_time", true],
      ["oiot-monthly", "Own It Over Time", 17500, "month", true],
      ["hosting-essentials", "Hosting + Essentials", 2500, "month", true],
      ["care-lite", "Care Lite", 4900, "month", true],
      ["care-standard", "Care Standard", 8500, "month", true],
      ["care-pro", "Care Pro", 14900, "month", true],
      ["hosting", "Hosting for care clients", 1500, "month", true],
      ["visibility-core", "Local Visibility Core", 29500, "month", true],
      ["visibility-growth", "Local Visibility Growth", 49500, "month", true],
      ["hosted-standard", "Hosted Standard", 10000, "month", true],
      ["legacy-audit", "Legacy Audit", 75000, "one_time", false],
      ["legacy-build", "Legacy Build", 250000, "one_time", false],
    ];
  const existing = await repo.entities<Item>("pricing_items");
  for (const [
    index,
    [sku, name, amount, interval, active],
  ] of definitions.entries()) {
    const id = `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
    if (existing.some((i) => i.sku === sku)) continue;
    await repo.put(
      "pricing_items",
      ItemSchema.parse({
        id,
        sku,
        name,
        amount,
        interval,
        active,
        description: "",
        qbo_item_ref:
          mockMappings && interval === "one_time" ? "mock_item_" + sku : null,
        stripe_lookup_key:
          mockMappings && interval === "month"
            ? sku + "-" + amount / 100
            : null,
      }),
    );
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
