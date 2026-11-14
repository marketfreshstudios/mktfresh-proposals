import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../tests/helpers";

const out = process.env.CAPTURE_SEATS;
async function seats(page: Page, value: object) {
  await page.unroute("**/api/billing/seats");
  await page.route("**/api/billing/seats", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: value })
      : r.fulfill({ json: { people: 4 } }),
  );
}

test("team: seats line, full plan adds a person before inviting, full trial points to plans", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  await setup();
  await context.addCookies([
    {
      name: "proposal_session",
      value: "e2e-staff-secret-only",
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seats(page, { limit: 4, in_use: 3, trial: false, can_add: true });
  await page.goto("/settings/team");
  await expect(page.getByText("3 of 4 people on your plan")).toBeVisible();
  await expect(
    page.locator(".team-seats").getByRole("link", { name: "Change plan" }),
  ).toHaveAttribute("href", "/billing");
  if (out)
    await page
      .locator(".team-studio")
      .screenshot({ path: `${out}/seat-free.png` });
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Invite user" })).toBeVisible();
  await page.keyboard.press("Escape");

  await seats(page, { limit: 4, in_use: 4, trial: false, can_add: true });
  let added = false;
  await page.route("**/api/billing/seats/preview", (r) =>
    r.fulfill({
      json: {
        plan: "studio",
        interval: "month",
        people_now: 4,
        people_after: 5,
        due_today_cents: 750,
        currency: "usd",
      },
    }),
  );
  await page.reload();
  await expect(page.getByText("4 of 4 people on your plan")).toBeVisible();
  page.on("request", (req) => {
    if (req.url().endsWith("/api/billing/seats") && req.method() === "POST")
      added = true;
  });
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add a person to your plan" });
  await expect(
    sheet.getByText("All 4 people on your Studio plan are in use."),
  ).toBeVisible();
  await expect(sheet.getByText("$7.50")).toBeVisible();
  await expect(sheet.getByText("$15/mo")).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".add-seat-sheet").analyze())
      .violations,
  ).toEqual([]);
  if (out) await page.screenshot({ path: `${out}/add-seat.png` });
  expect(added).toBe(false);
  await sheet.getByRole("button", { name: "Add a person" }).click();
  await expect(page.getByRole("dialog", { name: "Invite user" })).toBeVisible();
  expect(added).toBe(true);
  await page.keyboard.press("Escape");

  await seats(page, { limit: 5, in_use: 5, trial: true, can_add: false });
  await page.reload();
  await expect(page.getByText("5 of 5 people during your trial")).toBeVisible();
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const full = page.getByRole("dialog", { name: "Your trial is full" });
  await expect(
    full.getByText("Your trial includes 5 people, and all are in use."),
  ).toBeVisible();
  await expect(
    full.getByRole("link", { name: "Choose a plan" }),
  ).toHaveAttribute("href", "/billing");
  if (out) await page.screenshot({ path: `${out}/trial-full.png` });

  await seats(page, { limit: null, in_use: 2, trial: false, can_add: false });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Invite", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".team-seats")).toHaveCount(0);
});
