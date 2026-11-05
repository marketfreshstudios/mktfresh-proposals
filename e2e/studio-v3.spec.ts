import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { setup, staff } from "../tests/helpers";
import { emailTemplates } from "../src/lib/email-templates";
import { activity, workspaceEvent } from "../src/lib/studio";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { workspaceSections } from "../src/lib/studio-v3";
async function fixture(page: Page) {
  const f = await setup();
  let member = false,
    fail = false;
  let writes = 0;
  const saved = await f.repo.entities<any>("templates");
  for (let n = 1; n < 3; n++)
    await f.repo.put("templates", {
      ...saved[0],
      id: crypto.randomUUID(),
      name: ["Care agreement", "Marketing scope"][n - 1],
    });
  for (let n = 0; n < 9; n++)
    await f.repo.put("content_library", {
      id: crypto.randomUUID(),
      name: [
        "About us",
        "Our process",
        "Care plan terms",
        "Team photo",
        "Website timeline",
        "What we need",
        "Hosting and care",
        "Next steps",
        "Project approach",
      ][n],
      block: {
        id: crypto.randomUUID(),
        type: n === 2 ? "contract" : n === 3 ? "image" : "paragraph",
        text: "A reusable introduction for {{client.company}}.",
      },
    });
  await workspaceEvent(f.repo, staff, "templates_saved", {
    name: saved[0].name,
    entity_id: saved[0].id,
  });
  await workspaceEvent(f.repo, staff, "catalog_synced", { provider: "stripe" });
  f.members.push({
    ...f.members[0],
    user_id: crypto.randomUUID(),
    display_name: "Jamie Example",
    name: "Jamie Example",
    email: "jamie@example.test",
    role: "member",
  });
  const people = f.members.map((m) => ({
    ...m,
    status: "active",
    last_sign_in_at: "2026-11-05T12:00:00Z",
  }));
  const requests: { path: string; body: any }[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    let value: unknown = [],
      status = 200;
    try {
      if (parts[0] === "auth")
        value = {
          user: member ? { ...staff, staff_role: "member" } : staff,
          settings: f.settings,
          staff: people,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "connections")
        value = {
          stripe: true,
          qbo: false,
          email: true,
          mock: false,
          mode: "test",
        };
      else if (parts[0] === "workspace_settings" && req.method() === "POST") {
        writes++;
        if (fail) {
          status = 503;
          value = { error: "Settings are temporarily unavailable" };
        } else {
          Object.assign(
            f.settings,
            WorkspaceSettingsSchema.parse(req.postDataJSON()),
          );
          value = f.settings;
        }
      } else if (parts[0] === "workspace_events")
        value = await activity(f.repo);
      else if (parts[0] === "email-templates")
        value = await emailTemplates(f.repo);
      else if (parts[0] === "team") {
        if (req.method() === "GET") value = { members: people, recent: [] };
        else {
          requests.push({ path: req.url(), body: req.postDataJSON() });
          value = {};
        }
      } else if (parts[0] === "proposals")
        value = parts[1]
          ? await f.repo.get(parts[1])
          : { items: await f.repo.list(), total: (await f.repo.list()).length };
      else if (req.method() === "POST") {
        const input = req.postDataJSON();
        value = { ...input, id: input.id ?? crypto.randomUUID() };
        await f.repo.put(parts[0] as any, value as any);
      } else value = await f.repo.entities(parts[0] as any);
    } catch (e) {
      status = 400;
      value = { error: (e as Error).message };
    }
    await route.fulfill({ status, json: value });
  });
  return {
    ...f,
    requests,
    member: (v: boolean) => (member = v),
    fail: (v: boolean) => (fail = v),
    writes: () => writes,
  };
}
const shots = "docs/screenshots/studio-v3-phase1";
async function capture(page: Page, name: string) {
  if (process.env.STUDIO_V3_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  }
}
test("Studio v3 route lists, nine staff emails and Workspace autosave keep values on error", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/emails");
  await expect(
    page.getByRole("tab", { name: "Client emails · 8" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Staff notifications · 9" }).click();
  const list = page.locator(".studio-v3-emails");
  await expect(list.locator(".email-list-row")).toHaveCount(9);
  for (const label of [
    "Client activity",
    "Signatures",
    "Billing",
    "Team and jobs · editable",
  ])
    await expect(
      list.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
  await expect(
    list.getByRole("link", { name: /Billing needs attention/ }),
  ).toHaveCount(0);
  await page.goto("/studio/connections?view=stripe");
  await expect(
    page.getByRole("dialog", { name: "Stripe", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/studio/workspace?view=brand");
  const name = page.getByRole("textbox", {
    name: "Workspace name",
    exact: true,
  });
  await name.fill("Revised workspace");
  await expect.poll(() => f.settings.company_name).toBe("Revised workspace");
  await expect(
    page.locator(".workspace-section-card [role=status]"),
  ).toHaveText("Saved");
  f.fail(true);
  await name.fill("Keep this local value");
  await expect(
    page.getByText("Settings are temporarily unavailable"),
  ).toBeVisible();
  await expect(name).toHaveValue("Keep this local value");
  f.fail(false);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect
    .poll(() => f.settings.company_name)
    .toBe("Keep this local value");
  await page
    .getByRole("button", { name: "Billing defaults", exact: true })
    .click();
  await expect(
    page.getByText("Connected · test mode · Manage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Existing Stripe subscribers", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Collection method")).not.toBeVisible();
  await page.getByText("More billing settings", { exact: true }).click();
  await expect(page.getByLabel("Collection method")).toBeVisible();
  await page.goto("/studio/connections?view=reference");
  await expect(page).toHaveURL(/studio\/workspace\?view=pricing-references/);
  await expect(
    page.getByRole("heading", { name: "Pricing references", exact: true }),
  ).toBeVisible();
  await page.goto("/library");
  await expect(page).toHaveURL(/studio\/templates\?view=blocks/);
  await expect(
    page.locator(".saved-block-table .studio-table-row"),
  ).toHaveCount(9);
  await expect(page.getByText("Used in", { exact: true })).toHaveCount(0);
  await page.locator(".saved-block-table .studio-table-row").first().click();
  await expect(page).toHaveURL(/studio\/blocks\//);
  await expect(page.getByLabel("Block name")).toBeVisible();
});
test("Studio v3 Staff permissions and Team actions retain the existing endpoints", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/studio/workspace?view=team");
  await expect(
    page.getByRole("button", { name: "Invite user", exact: true }),
  ).toBeVisible();
  const other = f.members.find((m) => `staff:${m.user_id}` !== staff.actor)!;
  await page
    .getByRole("button", { name: `Actions for ${other.display_name}` })
    .click();
  for (const action of [
    "Set password",
    "Reassign their proposals…",
    "Send password reset",
    "Deactivate",
    "Remove from workspace",
  ])
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(action) }),
    ).toBeVisible();
  await page.keyboard.press("Escape");
  f.member(true);
  await page.goto("/studio/workspace?view=brand");
  await expect(
    page.getByRole("switch", { name: /Show.*Powered by Yeswell/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Signatory", exact: true }).click();
  await expect(page.getByLabel("Signatory name")).toBeDisabled();
  await page
    .getByRole("button", { name: "Email sending", exact: true })
    .click();
  await expect(page.getByLabel("Verified sending domain")).toBeDisabled();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Invite user", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: /Role for/ }).first(),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: /Actions for/ })).toHaveCount(
    0,
  );
});
test("Studio v3 responsive list pages and ten Workspace sections", async ({
  page,
}) => {
  test.setTimeout(240000);
  const f = await fixture(page);
  const routes = [
    ["01-templates", "/studio/templates"],
    ["01b-saved-blocks", "/studio/templates?view=blocks"],
    ["02-emails", "/studio/emails"],
    ["03-products", "/studio/products"],
    ["04-connections", "/studio/connections"],
    ["06-activity", "/studio/activity"],
  ];
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path] of routes) {
      await page.goto(path);
      await expect(page.locator(".studio-v3-shell")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(0);
      if (width === 1440 || (width === 375 && name === "02-emails"))
        await capture(page, `${name}-${width}`);
    }
    await page.goto("/studio/workspace?view=team");
    await expect(
      page.getByRole("table", { name: "Workspace team" }),
    ).toBeVisible();
    if (width === 768) await capture(page, "workspace-team-768");
    if (width === 1440) {
      for (const [key] of workspaceSections) {
        await page
          .getByRole("navigation", { name: "Workspace sections" })
          .getByRole("button", {
            name: workspaceSections.find(([k]) => k === key)![1],
            exact: true,
          })
          .click();
        await expect(page.locator(".workspace-section-card")).toBeVisible();
        await capture(page, `workspace-${key}-1440`);
      }
    }
    if (width !== 1440) {
      for (const [key, label] of workspaceSections) {
        await page
          .getByRole("navigation", { name: "Workspace sections" })
          .getByRole("button", { name: label, exact: true })
          .click();
        await expect
          .poll(
            () =>
              page.evaluate(
                () => document.documentElement.scrollWidth - innerWidth,
              ),
            key + " fits",
          )
          .toBe(0);
      }
    }
    if (width === 375) {
      await page.goto("/studio");
      await expect(page.locator(".studio-home-list>a")).toHaveCount(6);
      await expect(
        page.getByText("3 templates · 9 saved blocks", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("8 client emails · 0 edited", { exact: true }),
      ).toBeVisible();
      for (const status of await page.locator(".studio-home-list small").all())
        await expect(status).toHaveCSS("white-space", "nowrap");
      await capture(page, "studio-home-375");
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const catalog = await f.repo.entities<any>("pricing_items");
  const scheduled = catalog.find((i) => i.schedule) ?? catalog[0];
  await page.goto(`/studio/products?item=${scheduled.id}`);
  await expect(
    page.getByRole("complementary", { name: "Product details" }),
  ).toBeVisible();
  await capture(page, "03-product-detail-1440");
  const family = {
    id: crypto.randomUUID(),
    name: "Custom retainer",
    active: true,
  };
  await f.repo.put("custom_families", family);
  await page.goto(`/studio/products?item=${family.id}`);
  await expect(page.getByLabel("Family name")).toHaveValue(family.name);
  await capture(page, "03-product-custom-1440");
  await page.goto("/studio/emails");
  await page.getByRole("tab", { name: "Staff notifications · 9" }).click();
  await capture(page, "02b-staff-emails-1440");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Dark mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await capture(page, "02b-staff-emails-dark-1440");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
