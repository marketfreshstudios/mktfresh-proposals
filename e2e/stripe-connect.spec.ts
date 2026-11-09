import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { StripeConnectionStatus } from "../src/lib/stripe-connect-status";
import { editorFixture } from "./editor-fixture";

const detail = "/studio/connections/stripe";
const directory = "docs/screenshots/redesign-21-stripe-connect";
const notConnected = {
  state: "not_connected",
  available: true,
  eventsConfigured: true,
} as const;
const inProgress = {
  ...notConnected,
  state: "setting_up",
  setupRunning: true,
  accountName: "Harbor Studio",
  accountSuffix: "bor1",
  actorName: "Alex Morgan",
  connectedAt: "2026-11-09T17:00:00Z",
  dashboardUrl: "https://dashboard.stripe.com/acct_Harbor1/test",
  products: { count: 4, at: "2026-11-09T17:01:00Z" },
} as const;
const completed = {
  ...inProgress,
  state: "connected",
  setupRunning: false,
  customers: { checked: 6, linked: 5, review: 1 },
} as const;

test("another workspace connects in test mode, sees progress and can disconnect", async ({
  page,
}) => {
  const capture = process.env.CAPTURE_STRIPE_CONNECT === "1";
  if (capture) mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editorFixture(page);
  let connection: StripeConnectionStatus = notConnected;
  let disconnects = 0;
  let platform = false;
  await page.route("**/api/connections", async (route) => {
    await route.fulfill({
      json: {
        stripe:
          connection.state === "setting_up" || connection.state === "connected",
        qbo: false,
        email: true,
        stripe_platform: platform,
        stripe_connect: platform ? undefined : connection,
        stripe_webhooks_configured: true,
        mode: "test",
        mock: false,
      },
    });
  });
  await page.route("**/api/connections/stripe/activity", async (route) => {
    await route.fulfill({ json: { rows: [] } });
  });
  await page.route("**/api/connections/stripe/authorize", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ mode: "test" });
    await route.fulfill({
      json: { url: "https://connect.stripe.com/oauth/authorize?fixture=1" },
    });
  });
  await page.route(
    "https://connect.stripe.com/oauth/authorize?fixture=1",
    async (route) => {
      connection = inProgress;
      await route.fulfill({
        status: 303,
        headers: { location: "http://127.0.0.1:3100" + detail },
      });
    },
  );
  await page.route("**/api/connections/stripe/disconnect", async (route) => {
    disconnects++;
    connection = notConnected;
    await route.fulfill({ json: connection });
  });
  await page.goto(detail);
  await expect(page.getByRole("radio", { name: /Test mode/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Live mode/ })).toBeDisabled();
  if (capture)
    await page.screenshot({ path: directory + "/3c-connect-1440.png" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Connect Stripe", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up Stripe" }),
  ).toBeVisible();
  await expect(page.getByText("Matching customers by email")).toBeVisible();
  await expect(page.getByText("4 prices synced")).toBeVisible();
  if (capture)
    await page.screenshot({ path: directory + "/3d-setup-1440.png" });
  connection = completed;
  const open = page
    .getByRole("link", { name: "Open Stripe", exact: true })
    .first();
  await expect(
    page.getByText("Connected · test mode", { exact: true }),
  ).toBeVisible();
  await expect(open).toHaveAttribute("href", completed.dashboardUrl);
  await expect(page.getByText("Harbor Studio · ending in bor1")).toBeVisible();
  if (capture)
    await page.screenshot({ path: directory + "/3a-connected-1440.png" });
  await page.getByRole("button", { name: "Stripe actions" }).click();
  await expect(
    page.getByRole("button", { name: /Switch to live mode/ }),
  ).toBeDisabled();
  if (capture)
    await page.screenshot({ path: directory + "/3b-actions-1440.png" });
  await page.getByRole("button", { name: "Disconnect Stripe…" }).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect Stripe?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  if (capture)
    await page.screenshot({ path: directory + "/disconnect-1440.png" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(disconnects).toBe(0);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole("button", { name: "Stripe actions" }).click();
  if (capture) await page.screenshot({ path: directory + "/actions-375.png" });
  await page.getByRole("button", { name: "Disconnect Stripe…" }).click();
  await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect Stripe", exact: true }),
  ).toBeEnabled();
  expect(disconnects).toBe(1);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  if (capture) await page.screenshot({ path: directory + "/connect-375.png" });

  platform = true;
  await page.reload();
  await expect(
    page.getByText("Stripe is set up by your Yeswell administrator."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Stripe", exact: true }),
  ).toHaveCount(0);
});
