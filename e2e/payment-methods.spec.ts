import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { emailEditorFixture } from "./email-editor-fixture";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { billingFixture } from "../tests/billing-confirmation-fixture";
import { mutate } from "../src/lib/repository";
import { publicResult } from "../src/lib/service";

async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_PAYMENT_METHODS === "1") {
    const dir = "docs/screenshots/payment-methods";
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${name}.png`,
      animations: "disabled",
      fullPage: false,
    });
  }
}
test("Payment methods autosave for Super admins and are read-only for Staff, at desktop and phone widths", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  await page.route("**/api/workspace_settings", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    Object.assign(
      f.settings,
      WorkspaceSettingsSchema.parse(route.request().postDataJSON()),
    );
    await f.repo.put("workspace_settings", f.settings);
    await route.fulfill({ json: f.settings });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=billing");
  const input = page.getByRole("combobox", {
    name: "Payment methods",
    exact: true,
  });
  await expect(input).toHaveValue("card");
  await expect(
    page.getByText(/US bank payments take a few business days/),
  ).toBeVisible();
  await shot(page, "billing-card-1440");
  await input.selectOption("card_ach");
  await expect.poll(() => f.settings.payment_methods).toBe("card_ach");
  await expect(page.locator(".workspace-section [role=status]")).toHaveText(
    "Saved",
  );
  await shot(page, "billing-ach-1440");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(input).toHaveValue("card_ach");
  await page.setViewportSize({ width: 375, height: 900 });
  await input.scrollIntoViewIfNeeded();
  await shot(page, "billing-methods-375");
  expect(
    await input.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  f.member(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(input).toHaveValue("card_ach");
  await expect(input).toBeDisabled();
  await shot(page, "billing-staff-readonly-1440");
});
test("client return shows ACH processing or failure without claiming subscription success or offering duplicate Checkout", async ({
  page,
}) => {
  const f = await billingFixture("subscription");
  await mutate(f.repo, f.p.id, (p) => {
    const link = p.billing_links[0];
    link.metadata = {
      ...link.metadata,
      requires_checkout: false,
      bank_payments: {
        [f.id]: { state: "processing", subscription_ids: ["sub_fixture"] },
      },
    };
  });
  await page.route("**/api/public/**", async (route) =>
    route.fulfill({ json: publicResult((await f.repo.get(f.p.id))!) }),
  );
  await page.goto(`/p/${f.p.token}?billing=returned&session_id=${f.id}`);
  await expect(
    page.getByRole("heading", {
      name: "Your bank payment is processing",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/few business days to clear/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /billing is set up/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Continue to secure|Save a card/ }),
  ).toHaveCount(0);
  await mutate(f.repo, f.p.id, (p) => {
    (p.billing_links[0].metadata!.bank_payments as any)[f.id].state = "failed";
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Try another way to pay", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
