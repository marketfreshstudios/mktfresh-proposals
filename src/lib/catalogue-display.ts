import type { Item } from "./model";
export function itemDisplayName(item: Item) {
  return item.display_name?.trim() || item.name;
}
export function sellableCatalogue(items: Item[]) {
  return items
    .filter((i) => i.active && !i.legacy)
    .sort(
      (a, b) =>
        itemDisplayName(a).localeCompare(itemDisplayName(b), "en", {
          sensitivity: "base",
        }) || a.id.localeCompare(b.id),
    );
}
