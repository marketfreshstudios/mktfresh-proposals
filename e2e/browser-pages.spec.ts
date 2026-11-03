import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
for (const width of [1440, 375])
  test(`browser font metrics own all sheets at ${width}`, async ({ page }) => {
    const f = await editorFixture(page, true);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    if (width === 375) {
      await page
        .locator(".phone-section-list")
        .getByRole("button", { name: /First section/ })
        .click();
      await page
        .getByRole("button", { name: "Full document", exact: true })
        .click();
    }
    const paper = page.locator(".editor-paper"),
      sheets = paper.locator(".page-sheet");
    await expect.poll(() => sheets.count()).toBeGreaterThan(3);
    const original = await sheets.count();
    await page.addStyleTag({
      content:
        ".editor-paper .tiptap{letter-spacing:1px!important;line-height:2.2!important}",
    });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect.poll(() => sheets.count()).toBeGreaterThan(original);
    await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
      "data-layout-mode",
      "browser",
    );
    await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
      "data-approximate",
      "false",
    );
    expect(f.calls).toHaveLength(0);
    expect(JSON.stringify(f.active().content)).not.toContain(
      "pagination-spacer",
    );
  });
