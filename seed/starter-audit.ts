import type { Block, Item, Proposal, Template } from "../src/lib/model";
import { starterCatalogProducts } from "./starter-templates";

/** Read-only owner report: never repairs existing templates, proposals or versions. */
export function starterClauseAudit(
  templates: Template[],
  proposals: Proposal[],
  catalog: Item[],
) {
  const expected = starterCatalogProducts(1, catalog)[1]?.item?.id;
  const rows: {
    kind: string;
    id: string;
    condition: string;
    product: string;
    status: string;
  }[] = [];
  const inspect = (kind: string, id: string, content: Block[]) => {
    for (const block of content)
      for (const clause of block.clauses ?? []) {
        if (clause.id !== "payment-plan" && !/^4\.4\b/.test(clause.heading))
          continue;
        const target = clause.show_when?.pricing_item_id;
        const item = catalog.find((i) => i.id === target);
        rows.push({
          kind,
          id,
          condition: target ?? "none (stored unconditional clause)",
          product: item?.sku ?? (target ? "missing product" : "—"),
          status: !target
            ? "no predicate to change"
            : !item
              ? "missing product"
              : target === expected
                ? "matches Own It Over Time"
                : "different from current Own It Over Time",
        });
      }
  };
  for (const t of templates) inspect(`template: ${t.name}`, t.id, t.content);
  for (const p of proposals) {
    inspect(`proposal (${p.status})`, p.id, p.content);
    for (const v of p.versions)
      inspect(
        `version ${v.version_no}${v.frozen ? " (frozen)" : ""}`,
        p.id,
        v.content,
      );
  }
  return rows;
}
