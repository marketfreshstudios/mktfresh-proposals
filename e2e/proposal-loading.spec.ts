import { devices, expect, test } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

for (const phone of [false, true]) {
  test(`the editor and details pages load with their own placeholders (${phone ? "phone" : "desktop"})`, async ({
    browser,
  }) => {
    const context = await browser.newContext(
      phone
        ? {
            viewport: { width: 390, height: 844 },
            userAgent: devices["iPhone 13"].userAgent,
            hasTouch: true,
            isMobile: true,
          }
        : { viewport: { width: 1440, height: 900 } },
    );
    const page = await context.newPage();
    const f = await editorFixture(page, false, {});
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/clients**", async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(
      page.getByRole("status", { name: "Loading the editor", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".editor-loading-header")).toBeVisible();
    await expect(page.locator(".page-header")).toHaveCount(0);
    await page.goto(`/proposals/${f.draft.id}?view=record`);
    await expect(
      page.getByRole("status", { name: "Loading the proposal", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".details-loading-hero")).toBeVisible();
    await expect(page.locator(".page-header")).toHaveCount(0);
    release();
    await expect(page.locator(".details-loading")).toHaveCount(0);
    await context.close();
  });
}
