import { expect, test } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

test("the editor shows the client beside the title and in Send, and both change it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const f = await editorFixture(page, false, {});
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const header = page.getByRole("button", {
    name: `Client: ${f.draft.client.company}. Change client`,
  });
  await expect(header).toBeVisible();
  await header.click();
  const dialog = page.getByRole("dialog", { name: "Change client" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Review & send" }).first().click();
  await page.locator(".send-change-client").click();
  await expect(dialog).toBeVisible();
});
