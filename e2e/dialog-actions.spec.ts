import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
for (const width of [1440, 375])
  test(`destructive actions use Cancel first and never confirm implicitly at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const id = crypto.randomUUID();
    const f = await editorFixture(page, false, {
      content: [{ id, type: "pricing_table" }],
    });
    await page.goto(`/proposals/${f.draft.id}`);
    const block = page.locator(`[data-block-id="block-${id}"]`);
    await block.locator(".flow-quote-line").first().click();
    await page
      .getByRole("button", { name: "Delete block", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Delete required block?" });
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true }),
      remove = dialog.getByRole("button", {
        name: "Delete block",
        exact: true,
      });
    await expect(cancel).toBeFocused();
    const a = (await cancel.boundingBox())!,
      b = (await remove.boundingBox())!;
    expect(a.x).toBeLessThan(b.x);
    expect(
      await dialog.locator(".dialog-actions button").allTextContents(),
    ).toEqual([" Cancel", " Delete block"]);
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    expect(f.active().content.some((b) => b.id === id)).toBe(true);
    await block.locator(".flow-quote-line").first().click();
    await page
      .getByRole("button", { name: "Delete block", exact: true })
      .click();
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => f.active().content.some((b) => b.id === id))
      .toBe(false);
  });
