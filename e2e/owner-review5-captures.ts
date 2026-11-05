import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
export async function captureReview5(page: Page, name: string) {
  if (process.env.REVIEW5_CAPTURE !== "1") return;
  mkdirSync("docs/screenshots/owner-review5", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/screenshots/owner-review5/${name}.png`,
    animations: "disabled",
  });
}
