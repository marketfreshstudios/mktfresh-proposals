import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultCover } from "../src/lib/cover";
test("a tiny logo retains every image action at intrinsic toolbar width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  const src = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    c.getContext("2d")!.fillRect(0, 0, 24, 24);
    return c.toDataURL("image/png");
  });
  await f.editRemote({
    cover: { ...defaultCover(), logo: src, logo_height: 24 },
  });
  await page.goto(`/proposals/${f.draft.id}`);
  const image = page.locator('.document-cover [data-image-kind="cover"] img');
  await image.click();
  const bar = page.getByRole("toolbar", { name: "Image actions" });
  await expect(bar).toBeVisible();
  const b = (await bar.boundingBox())!,
    i = (await image.boundingBox())!;
  expect(i.width).toBe(24);
  expect(b.width).toBeGreaterThan(200);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(1440);
  for (const button of await bar.getByRole("button").all()) {
    await expect(button).toBeVisible();
    const r = (await button.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(b.x);
    expect(r.x + r.width).toBeLessThanOrEqual(b.x + b.width + 1);
  }
  await bar.getByRole("button", { name: "Alt text", exact: true }).click();
  await expect(page.getByLabel("Alt text", { exact: true })).toBeVisible();
});
test("Quote disclosures point right/down with a distinct heavy 10px icon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  const row = page.locator(".quote-row-toggle").first(),
    chevron = row.locator(".disclosure-chevron");
  await expect(chevron).toHaveAttribute("data-open", "true");
  await expect(chevron).toHaveCSS("width", "10px");
  await expect(chevron).toHaveAttribute("viewBox", "0 0 320 512");
  await expect(chevron).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
  await row.click();
  await expect(chevron).toHaveAttribute("data-open", "false");
  await expect(chevron).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Text styles", { exact: true }).click();
  const dropdown = page.locator(".proposal-styles select").first();
  const snapshot = await dropdown.evaluate((el) => ({
    image: getComputedStyle(el).backgroundImage,
    width: getComputedStyle(el).backgroundSize,
  }));
  expect(snapshot.image).toContain("viewBox='0 0 512 512'");
  expect(snapshot.width).toContain("12px");
});
