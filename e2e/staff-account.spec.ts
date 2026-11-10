import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import type {
  StaffAccount,
  StaffAccountPatch,
} from "../src/lib/staff-account-model";
import { signatoryVersion } from "../src/lib/company-signatory";

const gallery = "docs/screenshots/r22-account";
async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_R22_ACCOUNT !== "1") return;
  await mkdir(gallery, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${gallery}/${name}.png`,
    animations: "disabled",
  });
}

test("account pages save edits, keep alerts scoped, and follow R22 at 1440, 768 and 375", async ({
  page,
}) => {
  const { settings, members } = await setup();
  settings.engagement_notifications = { in_app: true, email: true };
  let account: StaffAccount = {
    first_name: "Alex",
    last_name: "Morgan",
    job_title: "Owner",
    phone: "(305) 555-0142",
    timezone: "America/New_York",
    date_format: "medium",
    theme: null,
    notifications: {},
    own_proposals_only: false,
    photo_url: null,
  };
  let signatory = true;
  const requests: StaffAccountPatch[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") {
      const user = signatory
        ? staff
        : {
            ...staff,
            actor: "staff:00000000-0000-4000-8000-000000000016",
            staff_name: "Jamie Weber",
            staff_email: "jamie@example.test",
            staff_role: "member",
          };
      return route.fulfill({
        json: {
          account,
          settings,
          user,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: signatoryVersion(settings),
        },
      });
    }
    if (path === "/api/account" && route.request().method() === "PATCH") {
      const patch: StaffAccountPatch = route.request().postDataJSON();
      requests.push(patch);
      if (patch.first_name === "")
        return route.fulfill({
          status: 400,
          json: { error: "Enter your first name." },
        });
      account = {
        ...account,
        ...patch,
        notifications: { ...account.notifications, ...patch.notifications },
      };
      return route.fulfill({ json: account });
    }
    if (path === "/api/account/signature") {
      const input = route.request().postDataJSON();
      expect(input.version).toBe(signatoryVersion(settings));
      expect(input.image).toMatch(/^data:image\/png;base64,/);
      settings.company_signatory!.image = input.image;
      return route.fulfill({
        json: {
          signature: settings.company_signatory,
          version: signatoryVersion(settings),
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar nav [aria-current]")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "Alex",
  );
  await expect(page.getByRole("button", { name: "Change email" })).toHaveCount(
    0,
  );
  await capture(page, "1a-profile-1440");
  await page.getByRole("button", { name: /Account menu/ }).click();
  const menu = page.getByRole("dialog", { name: "Account" });
  await expect(menu.getByRole("link", { name: "Your account" })).toBeVisible();
  await expect(menu.getByText("Switch workspace")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).include(".account-menu-r22").analyze())
      .violations,
  ).toEqual([]);
  await capture(page, "1c-menu-1440");
  await page.keyboard.press("Escape");
  const first = page.getByRole("textbox", { name: "First name" });
  await first.fill("");
  await first.blur();
  await expect(first).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter your first name.")).toBeVisible();
  await page.locator("#account-first_name-error").waitFor();
  await page.locator('input[autocomplete="given-name"]').fill("Taylor");
  await page.locator('input[autocomplete="given-name"]').blur();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("button", { name: /Taylor Morgan.*Account menu/ }),
  ).toBeVisible();
  expect(requests.at(-1)).toEqual({ first_name: "Taylor" });
  await page.goto("/account/notifications");
  const question = page.getByRole("switch", {
    name: "Client asked a question",
  });
  await expect(question).toBeChecked();
  await expect(page.getByText("In app", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/needs countersign|billing needs attention/i),
  ).toHaveCount(0);
  await question.click();
  await expect(question).not.toBeChecked();
  await expect(
    page.getByRole("status").getByText("Saved", { exact: true }),
  ).toBeVisible();
  await capture(page, "1b-notifications-1440");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(question).toBeChecked();
  const ownOnly = page.getByRole("switch", {
    name: "Only for proposals I own",
  });
  await ownOnly.click();
  await expect(ownOnly).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Only for proposals I own" }),
  ).toBeChecked();
  await page.goto("/account/preferences");
  await expect(page.getByRole("combobox", { name: "Time zone" })).toHaveValue(
    "America/New_York",
  );
  await capture(page, "1b4-preferences-1440");
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("combobox", { name: "Time zone" })
    .selectOption("Pacific/Honolulu");
  await page.getByRole("combobox", { name: "Date format" }).selectOption("iso");
  await expect(page.getByRole("combobox", { name: "Date format" })).toHaveValue(
    "iso",
  );
  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/account/signature");
  await expect(
    page.getByRole("button", { name: "Save signature" }),
  ).toBeVisible();
  await capture(page, "1b3-signature-1440");
  await page.getByRole("button", { name: "Save signature" }).click();
  await expect(
    page.getByRole("status").getByText("Saved", { exact: true }),
  ).toBeVisible();
  signatory = false;
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Stored company signature" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save signature" }),
  ).toHaveCount(0);
  await expect(page.getByText(/audit trail records who applies/)).toBeVisible();
  await capture(page, "1b2-read-only-signature-1440");
  signatory = true;

  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1024 });
    await page.goto("/account/notifications");
    await expect(
      page.getByRole("switch", { name: "Client asked a question" }),
    ).toBeChecked();
    if (width === 375) {
      await expect(
        page.getByRole("heading", { name: "Notifications", level: 1 }),
      ).toHaveCSS("color", "rgb(242, 245, 245)");
    }
    const main = page.locator(".staff-account-page");
    expect(
      await main.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const axe = await new AxeBuilder({ page })
      .include(".staff-account-page")
      .analyze();
    expect(
      axe.violations.map(({ id, nodes }) => [
        id,
        nodes.map((node) => node.target),
      ]),
    ).toEqual([]);
    await capture(
      page,
      width === 768 ? "1f-notifications-768" : "1g-notifications-375",
    );
    if (width === 375) {
      await page
        .getByRole("link", { name: "Your account", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Your account pages" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Alex Morgan.*staff@example.test/ }),
      ).toBeVisible();
      await capture(page, "1g-index-375");
      await page.getByRole("link", { name: "Signature", exact: true }).click();
      await page.getByRole("button", { name: "Draw", exact: true }).click();
      const canvas = page.getByLabel("Draw company signature");
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + 30, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + 50, { steps: 5 });
      await page.mouse.up();
      await expect(
        page.getByRole("button", { name: "Save signature" }),
      ).toBeEnabled();
      await capture(page, "1g-signature-375");
    }
  }
});

test("account pages and API require a session, and updates target the signed-in staff member", async ({
  page,
  context,
  request,
}) => {
  await context.clearCookies();
  for (const route of [
    "/account",
    "/account/security",
    "/account/notifications",
    "/account/signature",
    "/account/preferences",
  ]) {
    const result = await page.request.get(route, { maxRedirects: 0 });
    expect(result.status()).toBe(307);
    expect(result.headers().location).toContain("/login?next=");
  }
  expect((await page.request.get("/api/account")).status()).toBe(401);
  const headers = {
    Authorization: "Bearer e2e-staff-secret-only",
    Origin: "http://127.0.0.1:3100",
  };
  const account = await request.get("/api/account", { headers });
  expect(account.ok(), await account.text()).toBe(true);
  const invalid = await request.patch("/api/account", {
    headers,
    data: { user_id: crypto.randomUUID(), job_title: "Wrong user" },
  });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await request.patch("/api/account", {
    headers: { ...headers, Origin: "https://untrusted.example.test" },
    data: { job_title: "Wrong origin" },
  });
  expect(crossOrigin.status()).toBe(403);
  const missingPhoto = await request.get(
    `/api/account/photo/${crypto.randomUUID()}`,
    { headers },
  );
  expect(missingPhoto.status()).toBe(404);
});
