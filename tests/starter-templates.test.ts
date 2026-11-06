import { validateItems } from "../src/lib/quote-model";
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  starterTemplates,
  paymentPlanClause,
  starterId,
} from "../seed/starter-templates";
import { setup } from "./helpers";
import { seedIds } from "../seed/marketfresh";
import { CoverSchema, coverElements } from "../src/lib/cover";
import { variables } from "../src/lib/presentation";
import { readiness } from "../src/lib/quote";
import { BusinessStateSchema, businessState } from "../src/lib/business-state";
import { authoringErrors } from "../src/lib/authoring-guidance";
import type { Item, Template } from "../src/lib/model";
const workspace = "00000000-0000-4000-8000-000000000001";

it("six exact starters, order, covers, renumbered terms and both signatures without generic default prices", () => {
  const templates = starterTemplates(workspace);
  expect(templates.map((t) => t.starter_key)).toEqual([
    "general-project",
    "website-design-build",
    "website-care-hosting",
    "local-visibility-seo",
    "website-ai-audit",
    "monthly-marketing",
  ]);
  for (const t of templates) {
    expect(t.active).toBe(true);
    expect(t.default_items).toEqual([]);
    expect(t.default_quote).toEqual([]);
    CoverSchema.parse(t.cover);
    expect(
      coverElements(t.cover!, "A project").filter((x) => x.kind === "logo"),
    ).toHaveLength(1);
    expect(JSON.stringify(t.cover)).toContain('"path":"client.full_name"');
    expect(JSON.stringify(t.cover)).toContain('"path":"sender.name"');
    expect(JSON.stringify(t.cover)).not.toContain(
      "Valid until {{proposal.validity}}",
    );
    expect(t.content[0].type).toBe("page_break");
    expect(
      t.content.filter((b) => b.type === "signature_block").map((b) => b.role),
    ).toEqual(["client", "company"]);
    const terms = t.content.find((b) => b.type === "contract")!;
    expect(terms.text).toBe("Terms");
    expect(terms.clauses!.map((c) => Number(c.heading.split(".")[0]))).toEqual(
      terms.clauses!.map((_, i) => i + 1),
    );
    expect(
      terms.clauses!.some((c) => c.body.includes("{{workspace.state}}")),
    ).toBe(true);
    expect(terms.clauses!.find((c) => c.id === "payment-plan")).toBeUndefined();
  }
  const website = templates[1];
  expect(JSON.stringify(website.content)).toContain("Discovery and plan");
  expect(JSON.stringify(website.content)).toContain('"type":"bold"');
  expect(JSON.stringify(website)).not.toContain("(pricing_table)");
});
it("MarketFresh defaults resolve to existing items; care has no default, 4.4 stays byte-identical", async () => {
  const { repo } = await setup();
  const catalog = await repo.entities<Item>("pricing_items");
  const templates = starterTemplates(workspace, { marketfresh: true, catalog });
  expect(templates.map((t) => t.default_items!.length)).toEqual([
    0, 3, 3, 2, 1, 0,
  ]);
  for (const t of templates) validateItems(t.default_items!);
  for (const t of templates)
    for (const item of t.default_items!)
      expect(catalog.some((i) => i.id === item.pricing_item_id)).toBe(true);
  expect(templates[1].default_items![2]).toMatchObject({
    optional: true,
    selected: false,
    default_selected: false,
  });
  expect(
    templates[2].default_items!.every(
      (i) => !i.selected && !i.default_selected,
    ),
  ).toBe(true);
  const old = (await repo.entities<Template>("templates")).find(
    (t) => t.id === seedIds.template,
  )!;
  expect(
    templates[1].content
      .find((b) => b.type === "contract")!
      .clauses!.find((c) => c.id === "payment-plan"),
  ).toEqual(
    old.content
      .find((b) => b.type === "contract")!
      .clauses!.find((c) => c.id === "payment-plan"),
  );
  expect(paymentPlanClause.show_when.pricing_item_id).toBe(
    catalog.find((i) => i.sku === "oiot-monthly")?.id,
  );
  expect(
    starterTemplates(workspace, { marketfresh: true, catalog: [] }).every(
      (t) => !t.default_items!.length,
    ),
  ).toBe(true);
});
it("workspace creation trigger seeds six; backfill is idempotent, atomic and preserves edited starters and old clause", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create table public.workspaces(id uuid primary key);create table public.templates(id uuid primary key,workspace_id uuid references public.workspaces,data jsonb not null);`,
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261106151436_starter_templates.sql",
        "utf8",
      ),
    );
    await db.query("insert into workspaces values ($1)", [workspace]);
    const rows = await db.query<{ data: Template }>(
      "select data from templates order by (data->>'starter_order')::int",
    );
    expect(rows.rows.map((r) => r.data.name)).toEqual(
      starterTemplates(workspace).map((t) => t.name),
    );
    expect(rows.rows.every((r) => r.data.default_items?.length === 0)).toBe(
      true,
    );
    const reference = starterTemplates("00000000-0000-4000-8000-000000000000");
    expect(rows.rows.map(({ data: { id, ...t } }) => t)).toEqual(
      reference.map(({ id, ...t }) => t),
    );
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','public.provision_starter_templates(uuid,jsonb,boolean)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('service_role','public.provision_starter_templates(uuid,jsonb,boolean)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
    // Existing workspaces get the owner-run backfill, including real catalogue snapshots.
    const existingWorkspace = "00000000-0000-4000-8000-000000000099";
    await db.exec(
      "alter table public.workspaces disable trigger new_workspace_starter_templates",
    );
    await db.query("insert into workspaces values ($1)", [existingWorkspace]);
    await db.exec(
      "alter table public.workspaces enable trigger new_workspace_starter_templates",
    );
    const seeded = await setup();
    const existingPayload = starterTemplates(existingWorkspace, {
      marketfresh: true,
      catalog: await seeded.repo.entities<Item>("pricing_items"),
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select provision_starter_templates($1,$2,false) n",
          [existingWorkspace, JSON.stringify(existingPayload)],
        )
      ).rows[0].n,
    ).toBe(6);
    const defaults = await db.query<{ data: Template }>(
      "select data from templates where workspace_id=$1 order by (data->>'starter_order')::int",
      [existingWorkspace],
    );
    expect(defaults.rows.map((r) => r.data.default_items!.length)).toEqual([
      0, 3, 3, 2, 1, 0,
    ]);
    const id = starterId(workspace, "general-project");
    await db.query(
      "update templates set data=jsonb_set(data,'{name}', '\"Edited by staff\"') where id=$1",
      [id],
    );
    const { repo } = await setup();
    const old = (await repo.entities<Template>("templates"))[0];
    await db.query("insert into templates values ($1,$2,$3)", [
      old.id,
      workspace,
      JSON.stringify(old),
    ]);
    const payload = starterTemplates(workspace, {
      marketfresh: true,
      catalog: await repo.entities<Item>("pricing_items"),
    });
    for (let i = 0; i < 2; i++)
      expect(
        (
          await db.query<{ n: number }>(
            "select provision_starter_templates($1,$2,true) as n",
            [workspace, JSON.stringify(payload)],
          )
        ).rows[0].n,
      ).toBe(0);
    const edited = (
      await db.query<{ data: Template }>(
        "select data from templates where id=$1",
        [id],
      )
    ).rows[0].data;
    expect(edited.name).toBe("Edited by staff");
    const retired = (
      await db.query<{ data: Template }>(
        "select data from templates where id=$1",
        [old.id],
      )
    ).rows[0].data;
    expect(retired).toEqual({
      ...old,
      name: "Website proposal sample (old)",
      active: false,
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from templates where workspace_id='00000000-0000-4000-8000-000000000001'",
        )
      ).rows[0].n,
    ).toBe(7);
  } finally {
    await db.close();
  }
});
it("Business state resolves its full name or outside-US text; sending blocks only when the field is used", async () => {
  expect(
    businessState({
      business_state: BusinessStateSchema.parse({ name: "North Carolina" }),
    }),
  ).toBe("North Carolina");
  expect(
    businessState({
      business_state: BusinessStateSchema.parse({
        name: "other",
        other: " Ontario ",
      }),
    }),
  ).toBe("Ontario");
  expect(() => BusinessStateSchema.parse({ name: "NC" })).toThrow();
  const { draft } = await setup();
  const p = structuredClone(draft);
  p.content.push({ type: "paragraph", text: "State: {{workspace.state}}" });
  expect(readiness(p, []).errors).toContain(
    "Add your business state in Workspace settings",
  );
  expect(readiness(p, []).errors).not.toContain(
    "Unresolved variable: workspace.state",
  );
  p.workspace_settings = {
    ...p.workspace_settings!,
    business_state: { name: "New York", other: "" },
  };
  expect(variables(p)["workspace.state"]).toBe("New York");
  expect(authoringErrors(p)).toEqual([]);
});
it("bracket guard names every section, ignores chips, hyperlinks and numeric prices, then passes after editing", async () => {
  const { draft } = await setup();
  const p = structuredClone(draft);
  p.content = [
    { type: "heading", text: "Overview" },
    { type: "paragraph", text: "[Write this]" },
    { type: "heading", text: "Goals" },
    {
      type: "paragraph",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "[A goal]" }] },
        ],
      },
    },
  ];
  expect(authoringErrors(p)).toEqual([
    "Replace bracketed guidance in: Overview, Goals",
  ]);
  p.content = [
    {
      type: "paragraph",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "variable", attrs: { path: "client.company" } },
              {
                type: "text",
                text: "[link]",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.test/[link]" },
                  },
                ],
              },
              {
                type: "text",
                text: "[$2,750] [25/mo] {{quote.item.[sku].price}}",
              },
            ],
          },
        ],
      },
    },
  ];
  expect(authoringErrors(p)).toEqual([]);
  p.content = [
    {
      type: "paragraph",
      text: "[read the brief](https://example.test) costs [$25/mo]",
    },
  ];
  expect(authoringErrors(p)).toEqual([]);
});

it("numeric square-bracket placeholders are guidance, not prices", async () => {
  const { draft } = await setup();
  draft.content = [
    { type: "heading", text: "Delivery" },
    { type: "paragraph", text: "Within [10] days, after [3] months." },
  ];
  expect(authoringErrors(draft)).toEqual([
    "Replace bracketed guidance in: Delivery",
  ]);
});
