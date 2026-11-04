import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { mkdirSync, writeFileSync } from "node:fs";
const shots = "docs/screenshots/owner-review3";
test("review3 before evidence", async ({ page }) => {
  test.skip(process.env.REVIEW3_BEFORE !== "1", "One-time before evidence");
  mkdirSync(shots, { recursive: true });
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .click();
  await page.getByRole("button", { name: "Align", exact: true }).click();
  await page.screenshot({ path: `${shots}/cover-menu-before.png` });
  await page.goto(`/p/${f.draft.id}?preview=1`);
  const insets: any[] = [];
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".document-cover")).toBeVisible();
    insets.push(
      await page.locator(".document-cover").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: innerWidth, left: r.left, right: innerWidth - r.right };
      }),
    );
    if (width === 375) {
      await page.screenshot({ path: `${shots}/client-intro-before.png` });
      await page.locator(".flow-quote").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/client-pricing-before.png` });
    }
  }
  writeFileSync(
    ".data/review3-insets-before.json",
    JSON.stringify(insets, null, 2),
  );
});
test("edit popovers use application typography inside the cover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .click();
  const styles = [];
  for (const name of ["Align", "Spacing", "More cover actions"]) {
    await page.getByRole("button", { name, exact: true }).click();
    const menu = page.locator(".cover-controls-popover");
    styles.push(
      await menu.evaluate((el) => {
        const s = getComputedStyle(el);
        return [
          s.fontSize,
          s.fontFamily,
          s.fontWeight,
          s.lineHeight,
          s.textAlign,
        ];
      }),
    );
    await page.keyboard.press("Escape");
  }
  expect(styles[0][0]).toBe("14px");
  expect(styles[0][1]).toContain("Instrument Sans");
  expect(styles[1]).toEqual(styles[0]);
  expect(styles[2]).toEqual(styles[0]);
});
