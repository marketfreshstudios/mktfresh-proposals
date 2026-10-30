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
      company_name: "MarketFresh Studios",
      owner: "Jonathan Garces",
      company_signatory: {
        user_id: null,
        name: "Jonathan Garces",
        title: "Owner",
        email: "owner@example.test",
        image: null,
        authorized_user_ids: [],
      },
      email: "owner@example.test",
      phone: "",
      address: "",
      logo: null,
      accent_colour: "#365C4A",
      sending_domain: "",
      consent_text: CONSENT,
      reminder_days: [3, 7],
      default_validity_days: 30,
      timezone: "America/New_York",
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
        ...(sku === "oiot-monthly"
          ? {
              display_name: "Website Build — Own It Over Time",
              sublines: [
                {
                  id: "00000000-0000-4000-8000-000000009001",
                  label: "Kickoff",
                  amount: 50000,
                  interval: "one_time",
                  qty: 1,
                  qbo_item_ref: mockMappings ? "mock_item_oiot-kickoff" : null,
                },
                {
                  id: "00000000-0000-4000-8000-000000009002",
                  label: "Monthly",
                  amount: 17500,
                  interval: "month",
                  qty: 1,
                  stripe_lookup_key: mockMappings ? "oiot-monthly-175" : null,
                },
              ],
              min_term_months: 18,
              schedule: {
                after_paid_invoices: 30,
                then: { amount: 10000, lookup_key: "hosted-standard-100" },
              },
            }
          : {}),
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
      {
        type: "contract",
        text: "Statement of Work & Contract",
        clauses: [
          {
            id: "scope",
            heading: "1. Scope of work",
            body: "The agreed scope is described in this proposal. Changes require written agreement.",
            show_when: null,
          },
          {
            id: "payment-plan",
            heading: "4.4 Own It Over Time",
            body: "If you choose Own It Over Time, you agree to a minimum commitment of 18 monthly payments. The website is paid off after 30 monthly payments of $175; billing then continues at $100/month for hosting and care. If payments stop before the 30th payment, {{workspace.name}} may take the website offline.",
            show_when: {
              kind: "item_selected",
              pricing_item_id: "00000000-0000-4000-8000-000000000103",
            },
            draft: true,
          },
        ],
      },
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
