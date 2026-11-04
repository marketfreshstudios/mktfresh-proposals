/** Shared authoring copy for a count of pages, including the empty state. */
export const pageCountLabel = (count: number) =>
  `${count} ${count === 1 ? "page" : "pages"}`;
export const sharedPagesLabel = (count: number) =>
  `Shared on ${pageCountLabel(count)}`;
export const sharedChangesLabel = (count: number) =>
  count === 1
    ? "Changes show on this page only"
    : `Changes show on${count > 1 ? " all" : ""} ${pageCountLabel(count)}`;
