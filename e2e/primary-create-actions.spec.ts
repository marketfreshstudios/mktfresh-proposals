import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import type { Item } from "../src/lib/model";

const evidence = "docs/screenshots/primary-create-actions";
async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_PRIMARY_ACTIONS !== "1") return;
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${evidence}/${name}-1440.png`,
    animations: "disabled",
  });
}

test("staff create pages have one clay action and keep secondary actions outlined", async ({
  page,
}) => {
  const { repo, draft, settings, members } = await setup();
  let emptyClients = false;
  const catalog = await repo.entities<Item>("pricing_items");
  await page.route("**/api/**", async (route) => {
    const [, , resource] = new URL(route.request().url()).pathname.split("/");
    const response =
      resource === "auth"
        ? {
            user: staff,
            settings,
            staff: members,
            app_url: "http://127.0.0.1:3100",
          }
        : resource === "proposals"
          ? {
              items: emptyClients ? [] : [draft],
              total: emptyClients ? 0 : 1,
            }
          : resource === "clients"
            ? emptyClients
              ? []
              : [draft.client]
            : resource === "pricing_items"
              ? catalog
              : resource === "connections"
                ? { stripe: true, mode: "test" }
                : resource === "team"
                  ? { members, recent: [] }
                  : [
                        "templates",
                        "content_library",
                        "workspace_documents",
                        "custom_families",
                      ].includes(resource)
                    ? await repo.entities(resource as "templates")
                    : [];
    await route.fulfill({ json: response });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const filled = page.locator(
    "main :is(.btn.action,.btn.studio-primary):visible",
  );
  async function primary(name: string) {
    const button = page
      .getByRole("main")
      .getByRole("button", { name, exact: true });
    await expect(button).toHaveClass(/\baction\b/);
    await expect(button).toHaveCSS("background-color", "rgb(180, 83, 42)");
    await expect(filled).toHaveCount(1);
  }
  await page.goto("/clients");
  await expect(page.locator(".client-table-row")).toBeVisible();
  await primary("New client");
  await capture(page, "clients");
  emptyClients = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No clients yet" }),
  ).toBeVisible();
  await primary("New client");
  await expect(
    page.getByRole("link", { name: "Import from Proposify" }),
  ).not.toHaveClass(/\baction\b/);
  await capture(page, "clients-empty");
  await page.getByRole("button", { name: "New client", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  emptyClients = false;

  await page.goto("/studio/workspace?view=fonts");
  await expect(
    page.getByRole("button", { name: "Upload font" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I confirm this font is licensed for PDF embedding.",
    })
    .check();
  await primary("Upload font");
  await capture(page, "proposal-fonts");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload font", exact: true }).click();
  expect((await chooser).isMultiple()).toBe(false);

  await page.goto("/studio/products");
  await expect(
    page.getByRole("button", { name: "New billing category", exact: true }),
  ).toBeEnabled();
  await primary("New billing category");
  await expect(
    page.getByRole("button", { name: "Add one-time product" }),
  ).not.toHaveClass(/\baction\b/);
  await page.goto(`/studio/products?item=${catalog[0].id}`);
  await expect(
    page.getByRole("button", { name: "Save item and terms" }),
  ).toBeVisible();
  await primary("New billing category");
  await expect(
    page.getByRole("button", { name: "Save item and terms" }),
  ).not.toHaveClass(/\b(action|studio-primary)\b/);
  await capture(page, "products-custom-family");

  for (const [url, name] of [
    ["/", "New proposal"],
    ["/proposals", "New proposal"],
    ["/studio/templates", "New template"],
    ["/studio/templates?view=blocks", "New block"],
    ["/studio/workspace?view=team", "Invite"],
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("main").getByRole("status", { name: /^Loading / }),
    ).toHaveCount(0);
    await primary(name);
  }
});
