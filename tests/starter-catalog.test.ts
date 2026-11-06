import { expect, it } from "vitest";
import { setup } from "./helpers";
import {
  starterTemplates,
  starterId,
  starterCatalogProducts,
} from "../seed/starter-templates";
import { starterClauseAudit } from "../seed/starter-audit";
import { selectedContent } from "../src/lib/quote-model";
import { authoringErrors } from "../src/lib/authoring-guidance";
import { blockText } from "../src/lib/editor-document";
import type { Item } from "../src/lib/model";

const workspace = "00000000-0000-4000-8000-000000000001";
async function hostedCatalog() {
  const f = await setup();
  const skus: Record<string, string> = {
    "oiot-monthly": "oiot-monthly-175",
    "hosting-essentials": "hosted-essentials-25",
    "care-lite": "care-lite-49",
    "care-standard": "care-standard-85",
    "care-pro": "care-pro-149",
    "visibility-core": "retainer-core-295",
    "visibility-growth": "retainer-growth-495",
  };
  const catalog = (await f.repo.entities<Item>("pricing_items")).map((i) =>
    skus[i.sku]
      ? { ...i, id: starterId(workspace, i.sku), sku: skus[i.sku] }
      : i,
  );
  return { ...f, catalog };
}
it("hosted SKUs resolve UUID products, correct groups/defaults, and the live 4.4 predicate", async () => {
  const { catalog } = await hostedCatalog();
  const templates = starterTemplates(workspace, { marketfresh: true, catalog });
  expect(templates.map((t) => t.default_items!.length)).toEqual([
    0, 3, 3, 2, 1, 0,
  ]);
  expect(
    templates[1].default_items!.map(
      (q) => catalog.find((c) => c.id === q.pricing_item_id)?.sku,
    ),
  ).toEqual(["build", "oiot-monthly-175", "hosted-essentials-25"]);
  const website = templates[1].default_items!;
  expect(website[0].choice_group_id).toBe(website[1].choice_group_id);
  expect(website[0].default_selected).toBe(true);
  expect(website[1].default_selected).toBe(false);
  expect(website[2]).toMatchObject({
    optional: true,
    default_selected: false,
    selected: false,
    choice_group_id: null,
  });
  expect(templates[2].default_items!.every((q) => !q.default_selected)).toBe(
    true,
  );
  expect(templates[3].default_items!.every((q) => !q.default_selected)).toBe(
    true,
  );
  const oi = catalog.find((c) => c.sku === "oiot-monthly-175")!;
  const clause = templates[1].content
    .flatMap((b) => b.clauses ?? [])
    .find((c) => c.id === "payment-plan")!;
  expect(clause.show_when!.pricing_item_id).toBe(oi.id);
  expect(
    selectedContent(templates[1].content, website)
      .flatMap((b) => b.clauses ?? [])
      .some((c) => c.id === "payment-plan"),
  ).toBe(false);
  const chosen = website.map((q) => ({
    ...q,
    selected: q.pricing_item_id === oi.id,
  }));
  expect(
    selectedContent(templates[1].content, chosen).flatMap(
      (b) => b.clauses ?? [],
    ),
  ).toContainEqual({ ...clause, show_when: null });
});
it("SKU takes priority over a stale seed row; missing or inactive members leave the whole quote empty and report the exact SKU", async () => {
  const { catalog, repo } = await hostedCatalog();
  const seed = await repo.entities<Item>("pricing_items");
  const oi = catalog.find((i) => i.sku === "oiot-monthly-175")!;
  const stale = seed.find((i) => i.id.endsWith("103"))!;
  expect(
    starterTemplates(workspace, {
      marketfresh: true,
      catalog: [...catalog, stale],
    })[1].default_items![1].pricing_item_id,
  ).toBe(oi.id);
  for (const mode of ["missing", "inactive", "legacy"]) {
    for (const [number, index] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]) {
      const product = starterCatalogProducts(number, catalog)[0].item!;
      const changed = catalog.flatMap((i) =>
        i.id !== product.id
          ? [i]
          : mode === "missing"
            ? []
            : [
                {
                  ...i,
                  active: mode !== "inactive",
                  legacy: mode === "legacy",
                },
              ],
      );
      expect(
        starterTemplates(workspace, { marketfresh: true, catalog: changed })[
          index
        ].default_items,
      ).toEqual([]);
      expect(
        starterCatalogProducts(number, changed).find(
          (p) => p.sku === product.sku,
        )?.issue,
      ).toBe(mode === "missing" ? "missing" : "inactive");
    }
  }
  const inactive = catalog.map((i) =>
    i.id === oi.id ? { ...i, active: false } : i,
  );
  expect(
    starterTemplates(workspace, {
      marketfresh: true,
      catalog: [...inactive, stale],
    })[1].default_items,
  ).toEqual([]);
  // Older local catalogs retain their ID fallback, even though their SKUs predate Stripe sync.
  expect(
    starterTemplates(workspace, { marketfresh: true, catalog: seed }).map(
      (t) => t.default_items!.length,
    ),
  ).toEqual([0, 3, 3, 2, 1, 0]);
});
it("kickoff guidance is directly after the Investment sentence and blocks until staff remove it; no blank quote amounts", async () => {
  const { draft, catalog } = await hostedCatalog();
  const t = starterTemplates(workspace, { marketfresh: true, catalog })[1];
  const note =
    "[If the client chooses Own It Over Time, add the kickoff as a one-time Custom line with its amount, then delete this note.]";
  const index = t.content.findIndex((b) => blockText(b) === note);
  expect(index).toBeGreaterThan(0);
  expect(blockText(t.content[index - 1])).toContain(
    "Own It Over Time is a smaller kickoff payment",
  );
  expect(
    t.default_items![1].sublines.every((s) => s.interval !== "one_time"),
  ).toBe(true);
  const heading = { type: "heading" as const, text: "Investment" };
  const p = {
    ...draft,
    content: [heading, t.content[index]],
    quote: t.default_items!,
  };
  expect(authoringErrors(p)).toEqual([
    "Replace bracketed guidance in: Investment",
  ]);
  expect(authoringErrors({ ...p, content: [heading] })).toEqual([]);
  expect(
    t.default_items!.every((q) =>
      q.sublines.every((s) => typeof s.amount === "number"),
    ),
  ).toBe(true);
});
it("existing sample, proposals and frozen conditions are audited without mutation", async () => {
  const { repo, draft, catalog } = await hostedCatalog();
  const templates = await repo.entities<any>("templates");
  const p = {
    ...draft,
    content: structuredClone(templates[0].content),
    versions: [
      {
        id: "v",
        version_no: 1,
        content: structuredClone(templates[0].content),
        quote: [],
        variables_resolved: {},
        content_hash: "unchanged",
        created_at: "2026-01-01",
        frozen: true,
      },
    ],
  };
  const before = JSON.stringify({ templates, p });
  const rows = starterClauseAudit(templates, [p], catalog);
  expect(rows).toHaveLength(3);
  expect(
    rows.every(
      (r) => r.condition.endsWith("103") && r.status === "missing product",
    ),
  ).toBe(true);
  expect(rows.some((r) => r.kind === "version 1 (frozen)")).toBe(true);
  expect(JSON.stringify({ templates, p })).toBe(before);
});
