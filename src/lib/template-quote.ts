import { catalogLine, type Item, type Template } from "./model";

export function inactiveTemplateItems(
  template: Pick<Template, "default_quote">,
  catalog: Item[],
) {
  return template.default_quote.flatMap((q) => {
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
  return {
    quote: template.default_quote.flatMap((q) => {
      const item = catalog.find((i) => i.id === q.pricing_item_id);
      return item && item.active && !item.legacy ? [catalogLine(item, q)] : [];
    }),
    warnings: unavailable.map(
      (i) => `Skipped ${i.state} template default: ${i.name} (${i.id})`,
    ),
  };
}
