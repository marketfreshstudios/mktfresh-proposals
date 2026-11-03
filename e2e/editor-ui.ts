import { expect, type Page } from "@playwright/test";
/** Public editor entry points shared by pre-v2 interaction regressions. */
export async function openEditorPanel(
  page: Page,
  tab: "Quote" | "Fields" | "Styles" | "Send",
) {
  const phone = page.locator(".editor-phone-header");
  if (await phone.isVisible()) {
    if (tab === "Fields") {
      const insert = page
        .getByRole("button", { name: "Insert field", exact: true })
        .filter({ visible: true });
      if (await insert.count()) {
        await insert.click();
        return;
      }
    }
    const done = phone.getByRole("button", { name: "Done", exact: true });
    if (await done.isVisible()) await done.click();
  }
  const current = page
    .getByRole("tab", { name: tab, exact: true })
    .filter({ visible: true });
  if (await current.count()) {
    await current.first().click();
    return;
  }
  await page.getByRole("button", { name: `Open ${tab}`, exact: true }).click();
}
export async function reviewEditorSections(page: Page) {
  await openEditorPanel(page, "Send");
  await page
    .getByRole("checkbox", { name: /I've reviewed these AI-written sections/ })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: /I've reviewed these AI-written sections/,
    }),
  ).toHaveCount(0);
  if (await page.locator("dialog.tools-sheet[open]").count())
    await page.keyboard.press("Escape");
}
export async function openQuoteRow(page: Page, name: string | number) {
  await openEditorPanel(page, "Quote");
  const rows = page.locator(".quote-row").filter({ visible: true });
  const row =
    typeof name === "number"
      ? rows.nth(name)
      : rows
          .filter({
            has: page.locator(".quote-row-caption strong", { hasText: name }),
          })
          .first();
  const toggle = row.locator(".quote-row-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  return row;
}
