import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import {
  businessDetailsUrl,
  businessStateUrl,
} from "../src/lib/business-state";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";

const shots = "docs/screenshots/business-details";
async function capture(page: Page, state: string) {
  if (process.env.CAPTURE_BUSINESS_DETAILS !== "1") return;
  await mkdir(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize()!;
  const { height, scroll } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    scroll: window.scrollY,
  }));
  await page.setViewportSize({ width: viewport.width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${shots}/${state}-${viewport.width}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize(viewport);
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
}

for (const width of [1440, 768, 375]) {
  test(`Business details, the Home step and Profile at ${width}`, async ({
    page,
  }) => {
    const f = await setup();
    let settings: typeof f.settings = {
      ...f.settings,
      company_name: "Example Studio",
      business_name: "",
      business_state: undefined,
    };
    let owner = true;
    let writes = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session") {
        return route.fulfill({
          json: {
            settings,
            user: { ...staff, staff_role: owner ? "owner" : "member" },
            staff: f.members,
            app_url: "http://127.0.0.1:3100",
            account: {
              first_name: "Alex",
              last_name: "Morgan",
              job_title: "",
              phone: "",
              timezone: null,
              date_format: "medium",
              theme: null,
              notifications: {},
              own_proposals_only: false,
              photo_url: null,
            },
          },
        });
      }
      if (path === "/api/connections") {
        return route.fulfill({
          json: { stripe: false, qbo: false, email: true, mock: false },
        });
      }
      if (path === "/api/proposals")
        return route.fulfill({ json: { items: [], total: 0 } });
      if (
        path === "/api/workspace_settings" &&
        route.request().method() === "POST"
      ) {
        writes++;
        settings = WorkspaceSettingsSchema.parse(
          route.request().postDataJSON(),
        );
        return route.fulfill({ json: settings });
      }
      return route.fulfill({ json: [] });
    });
    await page.setViewportSize({ width, height: width === 375 ? 844 : 1050 });
    await page.goto(businessDetailsUrl);
    const nav = page.getByRole("navigation", { name: "Workspace sections" });
    await expect(nav.getByRole("button").first()).toHaveText(
      "Business details",
    );
    const section = page.getByRole("region", {
      name: "Business details",
      exact: true,
    });
    const state = section.getByRole("combobox", {
      name: "State (required)",
      exact: true,
    });
    const name = section.getByRole("textbox", {
      name: "Legal business name",
      exact: true,
    });
    await expect(name).toHaveValue("");
    await expect(state).not.toHaveAttribute("aria-invalid", "true");
    await expect(section.locator("[required]")).toHaveCount(1);
    expect(writes).toBe(0);
    await capture(page, "business-empty");
    const accessibility = await new AxeBuilder({ page })
      .include("#business-details")
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.goto("/");
    const step = page
      .getByRole("region", { name: "Needed before you send" })
      .getByRole("listitem")
      .first();
    const link = step.getByRole("link", { name: "Set up: Business details" });
    await expect(link).toHaveAttribute("href", businessStateUrl);
    await step.scrollIntoViewIfNeeded();
    await capture(page, "home-setup");
    await link.click();
    await expect(state).toBeFocused();
    const fieldBox = (await state.boundingBox())!;
    expect(fieldBox.y).toBeGreaterThan(0);
    expect(fieldBox.y + fieldBox.height).toBeLessThan(
      page.viewportSize()!.height - (width < 700 ? 80 : 0),
    );
    await expect(state).toHaveAttribute("aria-invalid", "true");
    await expect(
      section.getByText("Add your business state before sending a proposal."),
    ).toBeVisible();
    await capture(page, "business-state-missing");
    await state.selectOption("North Carolina");
    await expect
      .poll(() => settings.business_state?.name)
      .toBe("North Carolina");
    const toast = page
      .getByRole("status")
      .filter({ has: page.getByRole("button", { name: "Undo", exact: true }) });
    await expect(toast).toContainText("Saved");
    await toast.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => settings.business_state).toBeUndefined();
    await expect(state).toHaveValue("");
    await state.selectOption("North Carolina");
    for (const [label, value] of [
      ["Legal business name", "Example Studio LLC"],
      ["Street address", "128 Harbor Avenue"],
      ["Address line 2", "Suite 200"],
      ["City", "Charlotte"],
      ["ZIP / postal code", "28202"],
      ["Business phone", "(704) 555-0123"],
      ["Website", "example.test"],
    ]) {
      const field = section.getByRole("textbox", { name: label, exact: true });
      await field.fill(value);
      await field.press("Tab");
    }
    await expect.poll(() => settings.phone).toBe("+17045550123");
    await expect
      .poll(() => settings.business_website)
      .toBe("https://example.test/");
    await page.goto(businessDetailsUrl);
    await expect(state).toHaveValue("North Carolina");
    await expect(name).toHaveValue("Example Studio LLC");
    await expect(
      section.getByRole("textbox", { name: "Address line 2" }),
    ).toHaveValue("Suite 200");
    await capture(page, "business-filled");
    await nav.getByRole("button", { name: "Brand", exact: true }).click();
    const brand = page.getByRole("region", { name: "Brand", exact: true });
    await expect(
      brand.getByRole("heading", { name: "Brand colors" }),
    ).toBeVisible();
    await expect(
      brand.getByRole("link", { name: "Manage proposal fonts" }),
    ).toBeVisible();
    await expect(
      brand.getByRole("textbox", { name: "Legal business name" }),
    ).toHaveCount(0);
    await expect(brand.locator("#workspace-business-state")).toHaveCount(0);
    await capture(page, "brand");
    await page.goto(width < 700 ? "/account?view=profile" : "/account");
    const card = page.getByRole("region", { name: "Your business" });
    await expect(card).toContainText("Example Studio LLC | North Carolina");
    await expect(
      card.getByRole("link", { name: "Edit business details" }),
    ).toHaveAttribute("href", businessDetailsUrl);
    await capture(page, "profile-super-admin");
    owner = false;
    await page.reload();
    await expect(card).toContainText("Example Studio LLC | North Carolina");
    await expect(card.getByRole("link")).toHaveCount(0);
    await capture(page, "profile-staff");
    await page.goto(businessStateUrl);
    await expect(state).toBeDisabled();
    await expect(name).toHaveAttribute("readonly", "");
  });
}
