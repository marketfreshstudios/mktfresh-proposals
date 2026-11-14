import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../tests/helpers";

const out = process.env.CAPTURE_BILLING;
const day = 86400000;
const trialPlan = {
  status: "trial",
  mode: "full",
  notice: "trial",
  days_left: 10,
  trial_ends_at: new Date(Date.now() + 10 * day).toISOString(),
  grace_ends_at: null,
};
const base = {
  owner: true,
  owners: ["Dana Ruiz"],
  plan: trialPlan,
  people_in_use: 3,
  subscribed: false,
  not_billed: false,
  subscription: null,
  launch_price: false,
  launch_spots_left: 20,
  card: null,
  billing_ready: true,
};
async function mock(page: Page, overview: object) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const previews: any[] = [];
  await page.route("**/api/billing", (r) => r.fulfill({ json: overview }));
  await page.route("**/api/billing/preview", (r) => {
    const s = r.request().postDataJSON();
    previews.push(s);
    // Stripe's answer, faked: what the fixture prices would total.
    const cents =
      {
        studio: { month: 3900, year: 39000 },
        agency: { month: 8900, year: 89000 },
      }[s.plan as "studio"][s.interval as "month"] +
      Math.max(0, s.people - (s.plan === "studio" ? 2 : 5)) *
        (s.interval === "month" ? 1500 : 15000) +
      (s.domain ? (s.interval === "month" ? 1000 : 10000) : 0);
    r.fulfill({
      json: {
        total_cents: cents,
        currency: "usd",
        interval: s.interval,
        lines: [],
      },
    });
  });
  return previews;
}

test("billing: choose a plan with Stripe's total, then current plan and member views", async ({
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
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    const previews = await mock(page, base);
    let checkout: any;
    await page.route("**/api/billing/checkout", (r) => {
      checkout = r.request().postDataJSON();
      r.fulfill({
        json: { url: "http://127.0.0.1:3100/billing?checkout=fake" },
      });
    });
    await page.goto("/billing");
    // Three people already in the workspace: Studio starts at 3 with one extra.
    await expect(page.locator(".billing-stepper output")).toHaveText("3");
    await expect(page.locator(".billing-total strong")).toHaveText("$54/mo");
    await expect(
      page.getByText("Launch price, locked in while you stay subscribed"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Fewer people" }),
    ).toBeDisabled();
    await expect(
      page.getByText("You won't be charged until your trial ends."),
    ).toBeVisible();
    await expect(
      page.getByText("You'll enter your card on Stripe"),
    ).toHaveCount(0);
    if (out)
      await page.screenshot({
        path: `${out}/choose-${width}.png`,
        fullPage: true,
      });
    await page.getByText("Yearly", { exact: true }).click();
    await page.getByRole("switch").check();
    await expect(page.locator(".billing-total strong")).toHaveText("$640/yr");
    await page.locator(".billing-plan").filter({ hasText: "Agency" }).click();
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(page.locator(".billing-stepper output")).toHaveText("5");
    await expect(page.locator(".billing-total strong")).toHaveText("$890/yr");
    expect(previews.at(-1)).toEqual({
      plan: "agency",
      interval: "year",
      people: 5,
      domain: false,
    });
    expect(
      (await new AxeBuilder({ page }).include(".billing-page").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect
      .poll(() => checkout)
      .toEqual({ plan: "agency", interval: "year", people: 5, domain: false });

    await mock(page, {
      ...base,
      plan: { ...trialPlan, status: "active", notice: null, days_left: null },
      subscribed: true,
      launch_price: true,
      subscription: {
        plan: "studio",
        interval: "month",
        people: 3,
        domain: false,
        current_period_end: "2026-12-14T00:00:00.000Z",
        cancel_at_period_end: false,
      },
      card: { brand: "visa", last4: "4242" },
    });
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "Manage billing" }),
    ).toBeVisible();
    await expect(page.getByText("Monthly | Launch price")).toBeVisible();
    await expect(page.getByText("3 of 3 in use")).toBeVisible();
    await expect(page.getByText("Visa ending 4242")).toBeVisible();
    if (out)
      await page.screenshot({
        path: `${out}/current-${width}.png`,
        fullPage: true,
      });

    await mock(page, { owner: false, owners: ["Dana Ruiz"] });
    await page.goto("/billing");
    await expect(
      page.getByText("Dana Ruiz manages billing for this workspace."),
    ).toBeVisible();
    if (out && width === 1440)
      await page.screenshot({ path: `${out}/member-${width}.png` });

    await mock(page, {
      ...base,
      plan: { ...trialPlan, status: "active", notice: null },
      not_billed: true,
    });
    await page.goto("/billing");
    await expect(
      page.getByText("This workspace isn't charged for Yeswell."),
    ).toBeVisible();
  }
});
