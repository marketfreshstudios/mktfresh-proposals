/** Display-only table decorations. Source rows and the PagePlan remain untouched. */
export function placeQuoteTableBreak(row: HTMLElement, top: number) {
  const table = row.closest("table.quote-table"),
    head = table?.querySelector("thead tr");
  if (!head || row.tagName !== "TR") return false;
  const repeat = head.cloneNode(true) as HTMLElement;
  repeat.className = "quote-table-repeat";
  repeat.dataset.paginationSpacer = "true";
  repeat.setAttribute("aria-hidden", "true");
  const gap = row.ownerDocument.createElement("tr");
  gap.className = "quote-table-gap";
  gap.dataset.paginationSpacer = "true";
  gap.setAttribute("aria-hidden", "true");
  const cell = row.ownerDocument.createElement("td");
  cell.colSpan = 5;
  gap.append(cell);
  let height = Math.max(0, top - row.getBoundingClientRect().top);
  cell.style.height = `${height}px`;
  row.before(gap, repeat);
  // Account for table border/row rounding using the actual rendered header edge.
  height += top - repeat.getBoundingClientRect().top;
  cell.style.height = `${Math.max(0, height)}px`;
  return true;
}
export function copyQuoteTableBreaks(
  clone: HTMLElement,
  root: HTMLElement,
  live: WeakMap<HTMLElement, HTMLElement>,
) {
  root
    .querySelectorAll(".quote-table [data-pagination-spacer]")
    .forEach((el) => el.remove());
  clone.querySelectorAll<HTMLElement>(".quote-table-gap").forEach((gap) => {
    const head = gap.nextElementSibling as HTMLElement | null;
    const row = head?.nextElementSibling as HTMLElement | null;
    const target = row && live.get(row);
    if (target && head)
      target.before(gap.cloneNode(true), head.cloneNode(true));
  });
}
