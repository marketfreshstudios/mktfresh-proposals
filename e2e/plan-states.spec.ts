import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../tests/helpers";

const out = process.env.CAPTURE_PLAN;
const day = 86400000;
const plans = {
  trial: {
    status: "trial",
    mode: "full",
    notice: "trial",
    days_left: 11,
    trial_ends_at: new Date(Date.now() + 11 * day).toISOString(),
    grace_ends_at: null,
  },
  ending: {
    status: "trial",
    mode: "full",
    notice: "trial_ending",
    days_left: 3,
    trial_ends_at: new Date(Date.now() + 2.5 * day).toISOString(),
    grace_ends_at: null,
  },
  failed: {
    status: "past_due",
    mode: "full",
    notice: "payment_failed",
    days_left: null,
    trial_ends_at: null,
    grace_ends_at: new Date(Date.now() + 5 * day).toISOString(),
  },
  ended: {
    status: "trial",
    mode: "read_only",
    notice: "trial_ended",
    days_left: 0,
    trial_ends_at: new Date(Date.now() - day).toISOString(),
    grace_ends_at: null,
  },
};
let current: object = {};
async function withPlan(page: Page, plan: object) {
  current = plan;
  if ((page as any).__planRouted) return;
  (page as any).__planRouted = true;
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), plan: current },
    });
  });
}

test("plan states: trial note, warning banners and read-only home", async ({
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
    await page.setViewportSize({ width, height: 900 });
    // Trial with time left: a three-line note, no banner.
    await withPlan(page, plans.trial);
    await page.goto("/");
    const note = width > 900 ? page.locator(".sidebar .plan-note") : null;
    if (note) {
      await expect(note.getByText("Free trial")).toBeVisible();
      await expect(note.getByText("11 days left")).toBeVisible();
      await expect(
        note.getByRole("link", { name: "Choose a plan" }),
      ).toHaveAttribute("href", "/billing");
      // Each line stays on one line.
      for (const el of await note.locator("strong, span, a").all()) {
        const lines = await el.evaluate((n) => {
          const r = document.createRange();
          r.selectNodeContents(n);
          return new Set([...r.getClientRects()].map((x) => Math.round(x.top)))
            .size;
        });
        expect(lines).toBe(1);
        expect(
          await el.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
        ).toBe(true);
      }
      if (out) await note.screenshot({ path: `${out}/trial-note.png` });
    }
    await expect(page.locator(".plan-banner .banner")).toHaveCount(0);
    if (out) await page.screenshot({ path: `${out}/trial-${width}.png` });

    for (const [key, title, action] of [
      ["ending", /^Your trial ends /, "Choose a plan"],
      ["failed", "Your last payment didn't go through", "Update card"],
    ] as const) {
      await withPlan(page, plans[key]);
      await page.goto("/");
      const banner = page.locator(".plan-banner .banner");
      await expect(banner.getByText(title)).toBeVisible();
      await expect(banner.getByRole("link", { name: action })).not.toHaveClass(
        /\baction\b/,
      );
      await expect(
        width > 900
          ? page
              .locator(".home-intro")
              .getByRole("button", { name: "New proposal" })
          : page.locator(".bottom-new"),
      ).toBeEnabled();
      if (out) await page.screenshot({ path: `${out}/${key}-${width}.png` });
    }

    await withPlan(page, plans.ended);
    await page.goto("/");
    const banner = page.locator(".plan-banner .banner");
    await expect(banner.getByText("Your trial has ended")).toBeVisible();
    await expect(
      banner.getByRole("link", { name: "Choose a plan" }),
    ).toHaveClass(/\baction\b/);
    await expect(
      width > 900
        ? page
            .locator(".home-intro")
            .getByRole("button", { name: "New proposal" })
        : page.locator(".bottom-new"),
    ).toBeDisabled();
    expect(
      (await new AxeBuilder({ page }).include(".plan-banner").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (out) await page.screenshot({ path: `${out}/ended-${width}.png` });
  }
});
