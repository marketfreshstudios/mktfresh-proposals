import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { setup, staff, companyConsent } from "../tests/helpers";
import { syncStripeCatalog, type StripeTransport } from "../src/lib/catalog";
import type { Item, Template } from "../src/lib/model";
test("sync-deactivated defaults warn on templates and Pricing settings and clear after repair", async ({
  page,
}) => {
  const { repo, draft, settings, members } = await setup();
  const template = (await repo.entities<Template>("templates")).find(
    (t) => t.id === draft.template_id,
  )!;
  const item = (await repo.entities<Item>("pricing_items")).find(
    (i) => i.id === template.default_quote[0].pricing_item_id,
  )!;
  await repo.put("pricing_items", {
    ...item,
    stripe_lookup_key: "fixture-plan",
  });
  await syncStripeCatalog(repo, {
    get: async () => ({
      data: [
        {
          id: "price_fixture",
          lookup_key: "fixture-plan",
          unit_amount: item.amount,
          nickname: "Retired default",
          recurring: { interval: "month" },
          product: {
            id: "prod_fixture",
            name: "Retired service",
            active: true,
          },
          metadata: { legacy: "yes" },
        },
      ],
      has_more: false,
    }),
    post: async () => {
      throw Error("Unexpected Stripe write");
    },
  } as unknown as StripeTransport);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let value: unknown = [];
    if (path === "/api/auth/session")
      value = {
        user: staff,
        settings,
        staff: members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: companyConsent(0, settings).signatory_version,
      };
    else if (path === "/api/proposals") value = { items: [], total: 0 };
    else if (path === "/api/pricing_items")
      value = await repo.entities("pricing_items");
    else if (path === "/api/templates")
      value = await repo.entities("templates");
    await route.fulfill({ json: value });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir(".data/evidence/screens", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const [name, url] of [
      ["template-inactive-defaults", `/templates/${template.id}/edit`],
      ["pricing-template-warnings", "/studio/catalog"],
    ]) {
      await page.goto(url);
      const warning = page.getByRole("region", {
        name: "Inactive template defaults",
      });
      await expect(warning).toContainText(template.name);
      await expect(warning).toContainText("Retired service (inactive)");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `.data/evidence/screens/${name}-desktop-${theme}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto(`/templates/${template.id}/edit`);
  const warning = page.getByRole("region", {
    name: "Inactive template defaults",
  });
  await expect(warning).toBeVisible();
  await repo.put("pricing_items", { ...item, active: true });
  await page.reload();
  await expect(warning).toHaveCount(0);
  await page.goto("/studio/catalog");
  await expect(
    page.getByRole("region", { name: "Inactive template defaults" }),
  ).toHaveCount(0);
});
