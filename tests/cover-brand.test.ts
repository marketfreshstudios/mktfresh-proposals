import { expect, it } from "vitest";
import { setup } from "./helpers";
import { starterBrandUpdates } from "../seed/starter-brand-updates";
import { starterTemplates } from "../seed/starter-templates";
import oldBands from "../seed/starter-bands-v83.json";
import previousCovers from "../seed/starter-covers-pr-a.json";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { pageBandHtml } from "../src/lib/page-band-render";
import { brandIconHeight, coverBrand } from "../src/lib/workspace-brand";
import { editableCoverHtml } from "../src/lib/cover-render";
import type { Item, Template } from "../src/lib/model";
const wide = "data:image/png;base64,V0lERQ==",
  icon = "data:image/png;base64,SUNPTg==";
it("new header and cover logo prefer wide, then icon plus name, then name; explicit authored combinations remain", () => {
  for (const [logo, logoIcon, name, src] of [
    [wide, icon, "", wide],
    [undefined, icon, "Example Studio", icon],
    [undefined, undefined, "Example Studio", undefined],
  ] as const) {
    const html = pageBandHtml({
      hf: defaultHeaderFooter(),
      kind: "header",
      page: 2,
      pageCount: 3,
      values: {
        "workspace.name": "Example Studio",
        "proposal.title": "A proposal",
      },
      logo,
      logoIcon,
      print: true,
    });
    if (src) expect(html).toContain(src);
    else expect(html).not.toContain("<img");
    if (name) expect(html).toContain(name);
    else expect(html).not.toContain("Example Studio");
    expect(
      coverBrand({ logo_mode: "brand" }, logo, logoIcon, "Example Studio"),
    ).toEqual({ src, name });
  }
  const cover = {
    workspace: "",
    eyebrow: "",
    byline: "",
    logo_mode: "brand" as const,
    elements: [{ id: "logo", kind: "logo" as const, align: "left" as const }],
  };
  expect(
    editableCoverHtml(
      cover,
      "Title",
      { "workspace.name": "Example Studio" },
      wide,
      icon,
    ),
  ).not.toContain("Example Studio");
  expect(
    editableCoverHtml(
      cover,
      "Title",
      { "workspace.name": "Example Studio" },
      undefined,
      icon,
    ),
  ).toContain("Example Studio");
  const old: import("../src/lib/cover").Cover = { ...cover };
  delete old.logo_mode;
  expect(
    editableCoverHtml(
      old,
      "Title",
      { "workspace.name": "Example Studio" },
      undefined,
      icon,
    ),
  ).toBe("");
  expect(
    coverBrand({ ...cover, logo: null }, wide, icon, "Example Studio"),
  ).toEqual({ src: undefined, name: "" });
});
it("opt-in updates only complete unchanged starter seeds and preserves every other row", async () => {
  const f = await setup(),
    catalog = await f.repo.entities<Item>("pricing_items");
  const current = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog,
  });
  const old = current.map((t) => {
    const v = structuredClone(t);
    v.cover = structuredClone(
      previousCovers[t.starter_key as keyof typeof previousCovers],
    ) as Template["cover"];
    v.header_footer = oldBands as Template["header_footer"];
    delete v.cover!.logo_mode;
    return v;
  });
  expect(
    starterBrandUpdates(f.repo.workspaceId, catalog, old).every(
      (r) => r.eligible,
    ),
  ).toBe(true);
  old[1].name += " edited";
  old[2].content[0].text = "An owner change";
  const before = JSON.stringify(old);
  expect(
    starterBrandUpdates(f.repo.workspaceId, catalog, old).map(
      (r) => r.eligible,
    ),
  ).toEqual([true, false, false, true, true, true]);
  expect(JSON.stringify(old)).toBe(before);
  expect(
    starterBrandUpdates(f.repo.workspaceId, catalog, current).every(
      (r) => !r.eligible,
    ),
  ).toBe(true);
  const fromPrA = current.map((t) => ({
    ...structuredClone(t),
    cover: structuredClone(
      previousCovers[t.starter_key as keyof typeof previousCovers],
    ) as Template["cover"],
  }));
  expect(
    starterBrandUpdates(f.repo.workspaceId, catalog, fromPrA).every(
      (r) => r.eligible,
    ),
  ).toBe(true);
  fromPrA[0].cover!.eyebrow = "An owner's edit";
  expect(
    starterBrandUpdates(f.repo.workspaceId, catalog, fromPrA)[0].eligible,
  ).toBe(false);
});
it("hosted updater compares the entire expected row and cannot overwrite a concurrent edit", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table workspaces(id uuid primary key);create table templates(id uuid primary key,workspace_id uuid,data jsonb);",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261106151436_starter_templates.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261106194431_cover_brand_defaults.sql",
        "utf8",
      ),
    );
    const f = await setup(),
      catalog = await f.repo.entities<Item>("pricing_items"),
      after = starterTemplates(f.repo.workspaceId, {
        marketfresh: true,
        catalog,
      })[1];
    const before = structuredClone(after);
    before.header_footer = oldBands as Template["header_footer"];
    delete before.cover!.logo_mode;
    await db.query("insert into templates values($1,$2,$3)", [
      before.id,
      f.repo.workspaceId,
      before,
    ]);
    const update = () =>
      db.query<{ changed: boolean }>(
        "select upgrade_seed_template_branding($1,$2,$3,$4,$5) changed",
        [
          f.repo.workspaceId,
          before.id,
          before,
          after.cover,
          after.header_footer,
        ],
      );
    expect((await update()).rows[0].changed).toBe(true);
    expect((await update()).rows[0].changed).toBe(false);
    await db.query("update templates set data=$1 where id=$2", [
      { ...before, name: "Owner edit" },
      before.id,
    ]);
    expect((await update()).rows[0].changed).toBe(false);
    expect(
      (
        await db.query<{ data: Template }>(
          "select data from templates where id=$1",
          [before.id],
        )
      ).rows[0].data.name,
    ).toBe("Owner edit");
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','upgrade_seed_template_branding(uuid,uuid,jsonb,jsonb,jsonb)','execute') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await db.close();
  }
});

it("automatic icon defaults fit the name while deliberate resized heights are preserved", () => {
  expect(brandIconHeight("cover")).toBe(26);
  expect(brandIconHeight("cover", 60)).toBe(26);
  expect(brandIconHeight("cover", 48)).toBe(48);
  expect(brandIconHeight("band", 18)).toBe(16);
  expect(brandIconHeight("band", 32)).toBe(32);
});
