import { expect, type Locator } from "@playwright/test";
export async function clearNeighbours(bar: Locator, owner: Locator) {
  await expect(bar).toHaveAttribute("data-toolbar-placed", "true");
  const ownerHandle = await owner.elementHandle();
  await expect
    .poll(async () =>
      bar.evaluate((el, owner) => {
        const b = el.getBoundingClientRect(),
          paper = owner!.closest(".editor-paper,.template-paged-paper")!;
        const intersects = (r: DOMRect) =>
          Math.min(b.right, r.right) - Math.max(b.left, r.left) > 1 &&
          Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 1;
        return [
          ...paper.querySelectorAll<HTMLElement>(
            ".cover-element,.tiptap,[data-page-band],[data-band-frame],.flow-quote-line",
          ),
        ]
          .filter(
            (n) =>
              !n.closest("[data-page-measurement]") &&
              (!n.closest("[data-editor-chrome]") ||
                n
                  .closest("[data-editor-chrome]")!
                  .matches(".page-band-frame")) &&
              getComputedStyle(n).visibility === "visible",
          )
          .filter((n) => intersects(n.getBoundingClientRect()))
          .map(
            (n) =>
              n.getAttribute("data-cover-kind") ??
              n.getAttribute("aria-label") ??
              n.className,
          );
      }, ownerHandle),
    )
    .toEqual([]);
  const inside = await bar.evaluate((el, owner) => {
    const b = el.getBoundingClientRect();
    const paper = owner!.closest(".editor-paper,.template-paged-paper")!;
    return [...paper.querySelectorAll(".page-sheet")].some((sheet) => {
      const r = sheet.getBoundingClientRect();
      return (
        b.left >= Math.max(0, r.left) - 1 &&
        b.right <= Math.min(innerWidth, r.right) + 1 &&
        b.top >= Math.max(0, r.top) - 1 &&
        b.bottom <= Math.min(innerHeight, r.bottom) + 1
      );
    });
  }, ownerHandle);
  expect(inside).toBe(true);
}
