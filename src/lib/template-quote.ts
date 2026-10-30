import { draftItems, catalogQuoteItem } from "./quote-model";
import { type Item, type Template } from "./model";

export function inactiveTemplateItems(
  template: Pick<Template, "default_quote" | "default_items">,
  catalog: Item[],
) {
  return (template.default_items ?? template.default_quote).flatMap((q) => {
    if (!q.pricing_item_id) return [];
    const item = catalog.find((i) => i.id === q.pricing_item_id);
    return !item || !item.active || item.legacy
      ? [
          {
            id: q.pricing_item_id,
            name: item?.name ?? q.pricing_item_id,
            state: item ? "inactive" : "missing",
          },
        ]
      : [];
  });
}
export function templateDefaultQuote(template: Template, catalog: Item[]) {
  const unavailable = inactiveTemplateItems(template, catalog);
  if (template.default_items)
    return {
      quote: draftItems(
        template.default_items.filter(
          (i) =>
            !i.pricing_item_id ||
            !unavailable.some((v) => v.id === i.pricing_item_id),
        ),
      ),
      warnings: unavailable.map(
        (i) => `Skipped ${i.state} template default: ${i.name} (${i.id})`,
      ),
    };
  return {
    quote: template.default_quote.flatMap((q, n) => {
      const item = catalog.find((i) => i.id === q.pricing_item_id);
      if (!item || !item.active || item.legacy) return [];
      const value = catalogQuoteItem(
        item,
        n,
        item.id,
        item.sublines?.map((s) => s.id) ?? [item.id],
      );
      return [
        {
          ...value,
          optional: q.optional,
          default_selected: q.optional ? q.selected : true,
          selected: q.optional ? q.selected : true,
          sublines: value.sublines.map((s) => ({ ...s, qty: q.qty })),
        },
      ];
    }),
    warnings: unavailable.map(
      (i) => `Skipped ${i.state} template default: ${i.name} (${i.id})`,
    ),
  };
}
