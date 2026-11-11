import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { editorFixture } from "./editor-fixture";

const gallery = "docs/screenshots/shared-toasts";

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"]) {
    test(`archive notification shares its shape and dismiss behavior at ${width} in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 1000 });
      await page.addInitScript((value) => {
        localStorage.setItem("proposal-theme", value);
      }, theme);
      const fixture = await editorFixture(page);
      const row = page.getByRole("link", {
        name: `Open ${fixture.draft.client.company}: ${fixture.draft.title}`,
      });
      await page.goto("/proposals?view=drafts");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const archive = page.getByRole("button", {
        name: "Archive",
        exact: true,
      });
      await archive.click();

      const toast = page
        .getByRole("status")
        .filter({ hasText: "Proposal archived." });
      const undo = toast.getByRole("button", { name: "Undo", exact: true });
      const close = toast.getByRole("button", { name: "Dismiss notification" });
      await expect(toast).toBeVisible();
      await expect(row).toHaveCount(0);
      await expect(toast).toHaveCSS("background-color", "rgb(24, 34, 38)");
      await expect(toast).toHaveCSS("color", "rgb(255, 255, 255)");
      // Owner 10 Nov: toast actions are outline pills with no underline.
      await expect(undo).toHaveCSS("color", "rgb(255, 255, 255)");
      await expect(undo).toHaveCSS("text-decoration-line", "none");
      await expect(undo).toHaveCSS("border-radius", "999px");
      await expect(undo).toHaveCSS("border-top-color", "rgb(74, 93, 101)");
      await expect(close).toHaveCSS("color", "rgb(255, 255, 255)");
      await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(close).toHaveCSS("border-width", "0px");
      await expect(close).toHaveCSS("border-radius", "50%");
      await expect(close).toHaveCSS("width", "32px");
      await expect(close).toHaveCSS("height", "32px");
      await expect(close.locator("svg.lucide-x")).toHaveAttribute(
        "width",
        "18",
      );
      const bounds = (await toast.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(16);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 16);
      if (width === 375)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(844 - 80);
      if (process.env.CAPTURE_SHARED_TOASTS === "1") {
        await mkdir(gallery, { recursive: true });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${gallery}/archive-${width}-${theme}.png`,
          animations: "disabled",
        });
      }
      await close.hover();
      await expect(close).toHaveCSS(
        "background-color",
        "rgba(255, 255, 255, 0.12)",
      );
      await page.mouse.move(0, 0);
      await undo.focus();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await expect(close).toHaveCSS(
        "background-color",
        "rgba(255, 255, 255, 0.34)",
      );
      await undo.click();
      await expect(row).toBeVisible();
      await expect(toast).toHaveCount(0);
      await archive.click();
      await expect(toast).toBeVisible();
      await close.click();
      await expect(toast).toHaveCount(0);
      await expect(row).toHaveCount(0);
    });
  }
}
