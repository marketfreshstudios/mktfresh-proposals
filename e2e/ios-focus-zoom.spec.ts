import { devices, expect, test } from "@playwright/test";
const { defaultBrowserType: _a, ...iphone } = devices["iPhone 13"];
const { defaultBrowserType: _b, ...pixel } = devices["Pixel 7"];
const metas = (page: import("@playwright/test").Page) =>
  page
    .locator('meta[name="viewport"]')
    .evaluateAll((m) => m.map((x) => (x as HTMLMetaElement).content));
test("iPhone and iPad do not zoom into focused fields", async ({ browser }) => {
  const page = await (await browser.newContext(iphone)).newPage();
  await page.goto("/login");
  await expect
    .poll(async () => {
      const c = await metas(page);
      return c.length > 0 && c.every((x) => x.includes("maximum-scale=1"));
    })
    .toBe(true);
});
test("Android keeps pinch zoom (no maximum-scale)", async ({ browser }) => {
  const page = await (await browser.newContext(pixel)).newPage();
  await page.goto("/login");
  await page.waitForLoadState("load");

  expect((await metas(page)).join()).not.toContain("maximum-scale");
});
