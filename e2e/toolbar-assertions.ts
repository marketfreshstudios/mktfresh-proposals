import { expect, type Locator } from "@playwright/test";
/** Owner review 5: full-size and attached/sticky, not collision avoidance. */
export async function attachedBar(bar: Locator, owner: Locator) {
  await expect(bar).toHaveAttribute("data-toolbar-placed", "true");
  const handle = await owner.elementHandle();
  await expect
    .poll(() =>
      bar.evaluate((el, owner) => {
        const b = el.getBoundingClientRect(),
          a = owner!.getBoundingClientRect();
        const region = owner!
          .closest(".editor-document-region,.studio-template-main")
          ?.getBoundingClientRect();
        const ceiling = Math.max(8, region?.top ?? 0);
        return (
          b.left >= -1 &&
          b.right <= innerWidth + 1 &&
          b.top >= ceiling - 1 &&
          (b.bottom <= a.top + 1 || Math.abs(b.top - ceiling) <= 1) &&
          el.scrollWidth <= el.clientWidth + 1
        );
      }, handle),
    )
    .toBe(true);
}
