import {
  preAmericanEnglishStarter,
  preTermsMoveStarter,
} from "../seed/starter-legacy-copy";
import { aiTool } from "../src/lib/ai-tools";
import { studioRevision } from "../src/lib/studio-history";
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setup, staff } from "./helpers";
import { socialCatalog } from "./social-catalog";
import {
  starterTemplates,
  starterCatalogProducts,
  starterId,
} from "../seed/starter-templates";
import { starterBrandUpdates } from "../seed/starter-brand-updates";
import { authoringErrors } from "../src/lib/authoring-guidance";
import { authoringPreview } from "../src/lib/authoring-preview";
import { blockText } from "../src/lib/editor-document";
import {
  libraryStarterAction,
  TemplateInputSchema,
} from "../src/lib/template-library";
import { validateItems } from "../src/lib/quote-model";
import type { Template, Item } from "../src/lib/model";
const ws = "00000000-0000-4000-8000-000000000001",
  migration = "supabase/migrations/20261107225320_social_media_starter.sql";
const get = (marketfresh = false, catalog: Item[] = []) =>
  starterTemplates(ws, { marketfresh, catalog }).at(-1)!;
it("seventh starter uses exact approved copy, section order, Editorial cover and shared renumbered clauses", async () => {
  const generic = get(),
    market = get(true, socialCatalog());
  expect(generic.starter_key).toBe("social-media-management");
  expect(generic.starter_order).toBe(6);
  TemplateInputSchema.parse(generic);
  expect(generic.cover?.layout).toBe("editorial");
  expect(generic.description).toBe(
    "A monthly social media plan: content, posting, replies and reporting.",
  );
  expect(JSON.stringify(generic.cover)).toContain("A social media plan for");
  expect(
    generic.content.filter((b) => b.type === "heading").map((b) => b.text),
  ).toEqual([
    "Overview",
    "Goals",
    "What's included every month",
    "Choosing a plan",
    "What to expect",
    "What we need from you",
    "Why {{workspace.name}}",
    "Investment",
    "Next steps",
    "Signatures",
  ]);
  const text = generic.content.map(blockText).join("\n"),
    filled = market.content.map(blockText).join("\n");
  for (const token of [
    "[Facebook and Instagram]",
    "[$200]",
    "[$75–150]",
    "[3]",
  ])
    expect(text).toContain(token);
  for (const token of [
    "[Facebook and Instagram]",
    "[$200]",
    "[$75–150]",
    "[3]",
  ])
    expect(filled).not.toContain(token);
  expect(filled).toContain(
    "LinkedIn $200 a month, each additional platform $200 a month, and short-form video (Reels) $75–150 each.",
  );
  expect(filled).toContain("Plans have a 3-month minimum");
  expect(filled).toContain("[two to three months]");
  expect(filled).toContain("[Case study:");
  const source = await readFile(
      "design/templates/starter-templates.md",
      "utf8",
    ),
    section = source
      .split("## Template 7: Social media management")[1]
      .split("## Terms clauses")[0];
  const copy = (
    await import("../seed/starter-copy.json", { with: { type: "json" } })
  ).default.templates.find((t) => t.number === 7)!;
  const markdown = section
    .slice(section.indexOf("**Overview**"), section.indexOf("**Terms**:"))
    .replace(/^\*\*(.*?)\*\*$/gm, "# $1")
    .trim();
  expect(copy.markdown).toBe(markdown);
  const clauses = generic.content.find((b) => b.type === "contract")!.clauses!;
  expect(clauses.map((c) => c.id)).toEqual(
    [1, 2, 3, 5, 6, 7, 8, 9, 10, 11].map((n) => `terms-${n}`),
  );
  expect(clauses.map((c) => Number(c.heading.split(".")[0]))).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(
    generic.content
      .filter((b) => b.type === "signature_block")
      .map((b) => b.role),
  ).toEqual(["client", "company"]);
  expect(generic.default_items).toEqual([]);
});
it("four SKU UUIDs form one choice group with Growth selected; prices come from catalog, not SKU text", () => {
  const catalog = socialCatalog().map((p, i) => ({
      ...p,
      id: crypto.randomUUID(),
      amount: 12345 + i,
    })),
    t = get(true, catalog);
  expect(t.default_items).toHaveLength(4);
  validateItems(t.default_items!);
  expect(t.default_items!.map((q) => q.pricing_item_id)).toEqual(
    catalog.map((p) => p.id),
  );
  expect(t.default_items!.map((q) => q.sublines[0].amount)).toEqual(
    catalog.map((p) => p.amount),
  );
  expect(t.default_items!.map((q) => q.default_selected)).toEqual([
    false,
    true,
    false,
    false,
  ]);
  expect(new Set(t.default_items!.map((q) => q.choice_group_id)).size).toBe(1);
  expect(t.default_items!.every((q) => q.optional)).toBe(true);
  for (const product of catalog)
    for (const mode of ["missing", "inactive", "legacy"]) {
      const changed = catalog.flatMap((p) =>
        p.id !== product.id
          ? [p]
          : mode === "missing"
            ? []
            : [
                {
                  ...p,
                  active: mode !== "inactive",
                  legacy: mode === "legacy",
                },
              ],
      );
      expect(get(true, changed).default_items).toEqual([]);
      expect(
        starterCatalogProducts(7, changed).find((p) => p.sku === product.sku)
          ?.issue,
      ).toBe(mode === "missing" ? "missing" : "inactive");
    }
});
it("guidance blocks readiness and the historical updater leaves the editable seventh starter alone", async () => {
  const f = await setup(),
    t = get(true, socialCatalog());
  const preview = authoringPreview(
    { ...t, quote: t.default_items! },
    { ...f.settings, business_state: { name: "North Carolina", other: "" } },
    ws,
  );
  preview.workspace_settings = {
    ...f.settings,
    business_state: { name: "North Carolina", other: "" },
  };
  expect(authoringErrors(preview).join(" ")).toContain("Overview");
  expect(authoringErrors(preview).join(" ")).toContain("Choosing a plan");
  await f.repo.put("templates", t);
  await aiTool(
    f.repo,
    { actor: "ai:Claude", workspace_id: ws, ip: "", user_agent: "test" },
    "update_template",
    {
      template_id: t.id,
      revision: studioRevision(t),
      cover: { eyebrow: "Our social plan" },
    },
    ["templates:edit"],
  );
  const edited = (await f.repo.entities<Template>("templates")).find(
    (v) => v.id === t.id,
  )!;
  expect(edited).not.toEqual(t);
  expect(edited.starter_key).toBe(t.starter_key);
  const copy = (await libraryStarterAction(f.repo, staff, t.id, "copy", {
    name: "My social plan",
  })) as Template;
  expect(copy.source_starter_key).toBe(t.starter_key);
  expect(copy.starter_key).toBeUndefined();
  expect(copy.cover).toEqual(edited.cover);
  expect(
    (await f.repo.entities<Template>("templates")).find((v) => v.id === t.id),
  ).toEqual(edited);
  expect(
    starterBrandUpdates(ws, socialCatalog(), [t, edited]).some(
      (row) => row.after.starter_key === t.starter_key,
    ),
  ).toBe(false);
});
it("hosted migration adds only seventh, keeps existing edits, is idempotent and seeds seven generic starters", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table public.workspaces(id uuid primary key);create table public.templates(id uuid primary key,workspace_id uuid references workspaces,data jsonb not null);create table public.pricing_items(id uuid primary key,workspace_id uuid,sku text,data jsonb not null);",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261106151436_starter_templates.sql",
        "utf8",
      ),
    );
    await db.query("insert into workspaces values($1)", [ws]);
    await db.exec(
      'update templates set data=data || \'{"name":"Staff renamed this","active":false}\'::jsonb',
    );
    const original = await db.query("select * from templates order by id");
    const catalog = socialCatalog();
    catalog[1] = {
      ...catalog[1],
      sublines: [
        {
          id: crypto.randomUUID(),
          amount: 81234,
          interval: "month",
          qty: 2,
          stripe_lookup_key: "exact-catalog-price",
          qbo_item_ref: null,
          list_amount: null,
        },
      ],
      schedule: {
        after_paid_invoices: 12,
        then: { amount: 20000, lookup_key: "next-price" },
      },
      plan_terms: { note: "Copied exactly" },
    };
    for (const p of catalog)
      await db.query(
        "insert into pricing_items(id,workspace_id,sku,data) values($1,$2,$3,$4)",
        [p.id, ws, p.sku, JSON.stringify(p)],
      );
    const sql = await readFile(migration, "utf8");
    await db.exec(sql);
    const added = (
      await db.query<{ data: Template }>(
        "select data from templates where data->>'starter_key'='social-media-management'",
      )
    ).rows[0].data;
    expect(added).toEqual(
      preTermsMoveStarter(preAmericanEnglishStarter(get(true, catalog))),
    );
    expect(
      await db.query(
        "select * from templates where data->>'starter_key'<>'social-media-management' order by id",
      ),
    ).toEqual(original);
    await db.exec(sql);
    expect((await db.query("select * from templates")).rows).toHaveLength(7);
    await db.query(
      'update templates set data=data||\'{"description":"Owner edit"}\'::jsonb where id=$1',
      [added.id],
    );
    await db.exec(sql);
    expect(
      (
        await db.query<{ data: Template }>(
          "select data from templates where id=$1",
          [added.id],
        )
      ).rows[0].data.description,
    ).toBe("Owner edit");
    const other = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [other]);
    const generic = (
      await db.query<{ data: Template }>(
        "select data from templates where workspace_id=$1 order by(data->>'starter_order')::int",
        [other],
      )
    ).rows.map((r) => r.data);
    expect(generic).toHaveLength(7);
    expect(generic.at(-1)!.default_items).toEqual([]);
    expect(generic.at(-1)!.starter_order).toBe(6);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','public.seed_new_workspace_templates()','execute') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await db.close();
  }
});

for (const mode of ["missing", "inactive"])
  it(`hosted backfill reports ${mode} social products by leaving the whole quote empty`, async () => {
    const db = await PGlite.create();
    try {
      await db.exec(
        "create role anon;create role authenticated;create role service_role;create table workspaces(id uuid primary key);create table templates(id uuid primary key,workspace_id uuid,data jsonb);create table pricing_items(id uuid primary key,workspace_id uuid,sku text,data jsonb);",
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261106151436_starter_templates.sql",
          "utf8",
        ),
      );
      await db.query("insert into workspaces values($1)", [ws]);
      for (const [index, p] of socialCatalog().entries()) {
        if (index === 2 && mode === "missing") continue;
        await db.query("insert into pricing_items values($1,$2,$3,$4)", [
          p.id,
          ws,
          p.sku,
          JSON.stringify({
            ...p,
            active: index === 2 && mode === "inactive" ? false : true,
          }),
        ]);
      }
      await db.exec(await readFile(migration, "utf8"));
      const social = (
        await db.query<{ data: Template }>(
          "select data from templates where data->>'starter_key'='social-media-management'",
        )
      ).rows[0].data;
      expect(social.default_items).toEqual([]);
      expect((await db.query("select * from templates")).rows).toHaveLength(7);
    } finally {
      await db.close();
    }
  });
