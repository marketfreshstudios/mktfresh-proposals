import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
test("panel rows expand one at a time, retain prices/mappings, fields insert safely and Styles keeps all controls", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const panel = page.locator(".editor-v2-panel");
  const rows = panel.locator(".quote-row");
  await expect(rows).toHaveCount(f.active().quote.length);
  await expect(
    rows.locator("[aria-expanded=true].quote-row-toggle"),
  ).toHaveCount(1);
  await rows.nth(1).locator(".quote-row-toggle").click();
  await expect(rows.nth(0).locator(".quote-row-body")).toHaveCount(0);
  await expect(rows.nth(1).locator(".quote-row-body")).toBeVisible();
  await expect(
    panel.getByRole("textbox", { name: "Item name", exact: true }),
  ).toHaveCount(1);
  await rows
    .nth(1)
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await expect(rows.nth(1).getByLabel("Stripe lookup key")).toBeVisible();
  await expect(rows.nth(1).getByLabel("QuickBooks item")).toBeVisible();
  await expect(
    panel.getByText("Plan terms come from Products.", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator("footer > .totals")).toContainText("One-time");
  await expect(panel.locator("footer > .totals")).toContainText("Monthly");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(
    panel.getByRole("searchbox", { name: "Search fields" }),
  ).toHaveCSS("height", "40px");
  await expect(panel.locator(".fields-hint")).toHaveText(
    "Click into a paragraph, then choose a field…",
  );
  const field = panel.getByRole("button", {
    name: "Client first name — {{client.first_name}}",
    exact: true,
  });
  await expect(field.locator("code")).toHaveText("{{client.first_name}}");
  await field.click();
  await expect(
    page.getByText("Click into a paragraph first, then choose a field", {
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByRole("tab", { name: "Styles", exact: true }).click();
  await expect(
    panel.getByRole("group", { name: "Color", exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Colour", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(panel.getByLabel("Custom color", { exact: true })).toBeVisible();
  await panel.getByText("Typography details", { exact: true }).click();
  await expect(
    panel.getByRole("combobox", { name: "Letter case", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("spinbutton", { name: /letter spacing/ }),
  ).toBeVisible();
  await panel.getByRole("tab", { name: "Send", exact: true }).click();
  await expect(
    panel.getByRole("combobox", { name: "From", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Send to / })).toBeVisible();
  await expect(page.locator(".ai-review-banner")).toHaveCount(0);
});
