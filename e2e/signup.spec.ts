import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const out = process.env.CAPTURE_SIGNUP;
async function mockAddress(page: Page) {
  await page.route("**/api/signup/address?*", (route) => {
    const slug = new URL(route.request().url()).searchParams.get("slug")!;
    route.fulfill({
      json:
        slug === "northstar"
          ? { available: false, valid: true, suggestion: "northstar-2" }
          : /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)
            ? { available: true, valid: true }
            : { available: false, valid: false },
    });
  });
}

test("signup: one card, live address check, confirmation screen", async ({
  page,
}) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await mockAddress(page);
    let sent: Record<string, string> | undefined;
    await page.route("**/api/signup", async (route) => {
      sent = route.request().postDataJSON();
      route.fulfill({
        json: {
          email: "dana@example.test",
          address: `${sent!.slug}.yeswell.co`,
        },
      });
    });
    await page.goto("/start");
    await expect(
      page.getByRole("heading", { name: "Start your free trial" }),
    ).toBeVisible();
    await page.getByLabel("Business name").fill("North Star");
    const address = page.getByLabel("Your address");
    await expect(address).toHaveValue("north-star");
    await expect(page.getByText("Available")).toBeVisible();
    // Taken: the suggestion is one tap away and submit waits for a free address.
    await address.fill("northstar");
    await expect(page.getByText("northstar is taken.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start free trial" }),
    ).toBeDisabled();
    if (out)
      await page.screenshot({
        path: `${out}/signup-taken-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("button", { name: "Use northstar-2" }).click();
    await expect(address).toHaveValue("northstar-2");
    await expect(page.getByText("Available")).toBeVisible();
    // Editing the business name no longer rewrites a chosen address.
    await page.getByLabel("Business name").fill("North Star Creative");
    await expect(address).toHaveValue("northstar-2");
    await page.getByLabel("First name").fill("Dana");
    await page.getByLabel("Last name").fill("Ruiz");
    await page.getByLabel("Work email").fill("dana@example.test");
    await page.getByLabel("Password").fill("correct horse");
    expect(
      (await new AxeBuilder({ page }).include(".account-frame").analyze())
        .violations,
    ).toEqual([]);
    if (out)
      await page.screenshot({
        path: `${out}/signup-form-${width}.png`,
        fullPage: true,
      });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Start free trial" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page.getByText("northstar-2.yeswell.co")).toBeVisible();
    expect(sent).toMatchObject({
      business_name: "North Star Creative",
      slug: "northstar-2",
      first_name: "Dana",
      last_name: "Ruiz",
      email: "dana@example.test",
    });
    if (out)
      await page.screenshot({
        path: `${out}/signup-sent-${width}.png`,
        fullPage: true,
      });
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("signup: existing email points to sign in; bad links say so", async ({
  page,
}) => {
  await mockAddress(page);
  await page.route("**/api/signup", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "That email already has a workspace. Sign in instead.",
        code: "email_has_workspace",
      },
    }),
  );
  await page.goto("/start");
  await page.getByLabel("Business name").fill("Acme");
  await expect(page.getByText("Available")).toBeVisible();
  await page.getByLabel("First name").fill("A");
  await page.getByLabel("Last name").fill("B");
  await page.getByLabel("Work email").fill("a@example.test");
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(
    page.getByText("That email already has a workspace."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .or(page.locator(".banner"))
      .getByRole("link", { name: "Sign in" }),
  ).toBeVisible();

  await page.route("**/api/signup/confirm", (route) =>
    route.fulfill({
      status: 410,
      json: {
        error: "This link is invalid or expired. Start over to get a new one.",
      },
    }),
  );
  await page.goto("/start/confirm#token_hash=nope");
  await expect(
    page.getByRole("heading", { name: "Link expired" }),
  ).toBeVisible();
  await expect(page.getByText("Start over to get a new one.")).toBeVisible();
  expect(page.url()).not.toContain("token_hash");
  if (out)
    await page.screenshot({
      path: `${out}/signup-expired-1440.png`,
      fullPage: true,
    });
});
