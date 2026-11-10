import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { setup, staff } from "../tests/helpers";
import { emailTemplates } from "../src/lib/email-templates";
import { eventLabel } from "../src/lib/event-label";
import { activity, workspaceEvent } from "../src/lib/studio";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { workspaceSections } from "../src/lib/studio-v3";
import { coverText, defaultCover } from "../src/lib/cover";
import { fieldNodes } from "../src/lib/editor-fields";
import type { Template } from "../src/lib/model";
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
  for (const i of await f.repo.entities<any>("pricing_items"))
    await f.repo.put("pricing_items", {
      ...i,
      description: i.schedule
        ? "Design and build, paid over time"
        : i.interval === "one_time"
          ? "Planning and project delivery"
          : "Ongoing service and support",
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
  const people = [
    ...f.members.map((m) => ({
      ...m,
      status: "active",
      invited_at: null as string | null,
      last_sign_in_at: "2026-11-05T12:00:00Z",
    })),
    ...["invited", "deactivated"].map((status, n) => ({
      ...f.members[0],
      user_id: crypto.randomUUID(),
      display_name: n ? "Sam Example" : "Maya Example",
      name: n ? "Sam Example" : "Maya Example",
      email: n ? "sam@example.test" : "maya@example.test",
      role: "member" as const,
      status,
      invited_at: n ? null : "2026-11-01T12:00:00Z",
      last_sign_in_at: "",
    })),
  ];
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
async function capture(page: Page, name: string, fullPage = true) {
  if (process.env.STUDIO_V3_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
  }
}
test("template cards show inset preview sheets with resolved titles at every width", async ({
  page,
}) => {
  const f = await fixture(page);
  f.settings.accent_colour = "#365c4a";
  f.settings.proposal_fonts = { heading: "serif", body: "mono" };
  const templates = await f.repo.entities<Template>("templates");
  const entries = [
    {
      name: "Website proposal",
      starter_key: "website",
      title: "Website for {{client.company}}",
      heading: "Overview",
      expected: "Website for Client",
    },
    {
      name: "Care plan renewal",
      heading: "Keeping your site healthy",
      expected: "Keeping your site healthy",
    },
    {
      name: "Local visibility",
      title: "Title hidden on the cover",
      hiddenTitle: true,
      heading:
        "Be found by customers nearby with a local visibility plan that keeps your business easy to find",
      expected:
        "Be found by customers nearby with a local visibility plan that keeps your business easy to find",
    },
  ];
  for (const [index, entry] of entries.entries()) {
    await f.repo.put("templates", {
      ...templates[index],
      name: entry.name,
      starter_key: entry.starter_key,
      starter_edited: entry.starter_key ? true : undefined,
      starter_order: index,
      active: index !== 2,
      default_quote: [],
      default_items: [],
      cover: entry.title
        ? {
            ...defaultCover(),
            elements: [
              {
                id: "title",
                kind: "title",
                align: "left",
                hidden: entry.hiddenTitle,
                content: fieldNodes(coverText(entry.title)),
              },
            ],
          }
        : undefined,
      content: [
        { id: crypto.randomUUID(), type: "heading", text: entry.heading },
        ...templates[index].content.filter((block) => block.type === "heading"),
      ],
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/templates");
  const grid = page.locator(".studio-template-grid");
  const cards = grid.locator(".studio-template-card");
  await expect(cards).toHaveCount(3);
  for (const [index, entry] of entries.entries()) {
    const card = cards.nth(index);
    const band = card.locator(".template-thumbnail");
    const paper = band.locator(".template-thumbnail-paper");
    const title = paper.locator(".template-thumbnail-title");
    await expect(card).toHaveAttribute(
      "href",
      `/studio/templates/${templates[index].id}`,
    );
    await expect(band).toHaveAttribute("aria-hidden", "true");
    await expect(card).toHaveCSS("border-radius", "18px");
    await expect(band).toHaveCSS("overflow", "hidden");
    await expect(band).toHaveCSS("background-color", "rgb(244, 247, 247)");
    await expect(band).toHaveCSS("border-bottom-width", "1px");
    await expect(band).toHaveCSS("border-bottom-style", "solid");
    await expect(band).toHaveCSS("border-bottom-color", "rgb(228, 222, 210)");
    await expect(band).toHaveCSS("padding", "22px 22px 0px");
    await expect(paper).toHaveCSS("border-radius", "3px 3px 0px 0px");
    await expect(paper).toHaveCSS("padding", "20px 22px");
    await expect(card.locator(".studio-template-card-footer")).toHaveCSS(
      "padding",
      "16px 20px",
    );
    await expect(card.getByTestId("template-card-name")).toHaveCSS(
      "font-size",
      "16px",
    );
    await expect(card.getByTestId("template-card-name")).toHaveCSS(
      "font-weight",
      "600",
    );
    await expect(card.locator(".studio-template-card-footer small")).toHaveCSS(
      "font-size",
      "13px",
    );
    await expect(card.locator(".studio-template-card-footer small")).toHaveCSS(
      "font-weight",
      "400",
    );
    await expect(paper).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(paper).toHaveCSS(
      "box-shadow",
      "rgb(228, 222, 210) 0px 0px 0px 1px, rgba(19, 48, 58, 0.08) 0px 6px 16px 0px",
    );
    await expect(paper.locator(".template-thumbnail-accent")).toHaveCSS(
      "background-color",
      "rgb(54, 92, 74)",
    );
    await expect(title).toHaveText(entry.expected);
    await expect(title).toHaveCSS("font-family", /Source Serif 4/);
    await expect(title).toHaveCSS("-webkit-line-clamp", "2");
    await expect(paper.locator("[data-field]")).toHaveCount(0);
    const lines = paper.locator(".template-thumbnail-lines > span");
    await expect(lines).toHaveCount(3);
    const widths = await lines.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  }
  await expect(
    cards.first().locator('[data-starter-status="edited"]'),
  ).toContainText("Edited");
  await expect(cards.getByText("Starter", { exact: true })).toHaveCount(0);
  await expect(
    cards.last().getByText("Hidden from new proposals"),
  ).toBeVisible();
  const longTitle = cards.last().locator(".template-thumbnail-title");
  expect(
    await longTitle.evaluate((node) => ({
      clips: node.scrollHeight > node.clientHeight,
      lines: Math.round(
        node.clientHeight / parseFloat(getComputedStyle(node).lineHeight),
      ),
    })),
  ).toEqual({ clips: true, lines: 2 });

  for (const [width, columns] of [
    [1440, 3],
    [768, 2],
    [375, 1],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    const shapes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        card: node.getBoundingClientRect().toJSON(),
        band: node
          .querySelector(".template-thumbnail")!
          .getBoundingClientRect()
          .toJSON(),
        paper: node
          .querySelector(".template-thumbnail-paper")!
          .getBoundingClientRect()
          .toJSON(),
      })),
    );
    expect(new Set(shapes.map(({ card }) => card.x)).size).toBe(columns);
    expect(new Set(shapes.map(({ card }) => card.height)).size).toBe(1);
    for (const { band, paper } of shapes) {
      expect(band.height).toBe(220);
      expect(paper.height).toBe(190);
      expect(band.width - paper.width).toBeCloseTo(44, 0);
      expect(paper.x + paper.width / 2).toBeCloseTo(band.x + band.width / 2, 0);
      expect(band.bottom - paper.bottom).toBeCloseTo(1, 0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    if (width !== 768 && process.env.TEMPLATE_THUMBNAILS_CAPTURE === "1") {
      await page.evaluate(() => document.fonts.ready);
      const directory = "docs/screenshots/template-thumbnails";
      mkdirSync(directory, { recursive: true });
      await page.screenshot({
        path: `${directory}/templates-${width}.png`,
      });
    }
  }

  await page.getByRole("searchbox", { name: "Search templates" }).focus();
  await page.keyboard.press("Tab");
  await expect(cards.first()).toBeFocused();
  await expect(cards.first()).toHaveCSS("outline-style", "solid");
  await expect(cards.first()).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/studio/templates/${templates[0].id}`);

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [theme, preview] of [
    ["light", "rgb(244, 247, 247)"],
    ["dark", "rgb(36, 52, 58)"],
  ]) {
    await page.evaluate(
      (mode) => localStorage.setItem("proposal-theme", mode),
      theme,
    );
    await page.goto("/studio/templates");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(cards.first().locator(".template-thumbnail")).toHaveCSS(
      "background-color",
      preview,
    );
    await expect(cards.first().locator(".template-thumbnail-paper")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    if (process.env.CAPTURE_REPORT_POLISH === "1") {
      const directory = "docs/screenshots/reports-provider-polish";
      mkdirSync(directory, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${directory}/templates-${theme}-1440.png`,
      });
      if (theme === "light") {
        const crop = await cards.first().screenshot({ animations: "disabled" });
        const { width } = await sharp(crop).metadata();
        await sharp(crop)
          .resize(width * 2)
          .toFile(`${directory}/template-card-closeup.png`);
      }
    }
  }
});

test("Studio v3 route lists, eleven staff emails and Workspace autosave keep values on error", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/emails");
  await expect(
    page.getByRole("tab", { name: "Client emails · 9" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Staff notifications · 11" }).click();
  const list = page.locator(".studio-v3-emails");
  await expect(list.locator(".email-list-row")).toHaveCount(11);
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
    page.getByRole("heading", { name: "Stripe", level: 1, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/studio\/connections\/stripe$/);
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
    page.getByRole("link", {
      name: "● Connected · test mode · Manage",
      exact: true,
    }),
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
  await expect(
    page
      .locator(".saved-block-table .studio-table-head")
      .getByText("Used in", { exact: true }),
  ).toBeVisible();
  await page.locator(".saved-block-table .studio-table-row").first().click();
  await expect(page).toHaveURL(/studio\/blocks\//);
  await expect(
    page.getByRole("tab", { name: "Used in", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Block name")).toBeVisible();
});
test("Studio v3 Staff permissions and Team actions retain the existing endpoints", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/studio/workspace?view=team");
  await expect(
    page.getByRole("button", { name: "Invite", exact: true }),
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
    page.getByRole("button", { name: "Invite", exact: true }),
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
      for (const action of await page
        .locator(".studio-v3-shell .workspace .btn.primary")
        .all())
        await expect(action).toHaveCSS("border-radius", "999px");
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
    if (width === 768) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      const footer = page.locator(".bottom-tabs");
      await expect(footer).toBeHidden();
      await expect
        .poll(async () => {
          const bar = await footer.boundingBox(),
            last = await page
              .getByRole("link", { name: "Recent changes · Team activity" })
              .boundingBox();
          return (bar?.y ?? 1000) - last!.y - last!.height;
        })
        .toBeGreaterThanOrEqual(24);
      await capture(page, "workspace-team-768", false);
    }
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
        if (key === "team") {
          await page
            .getByRole("button", { name: "Actions for Jamie Example" })
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await capture(page, "workspace-team-menu-1440");
          await page.keyboard.press("Escape");
        }
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
        page.getByText("9 client emails · 0 edited", { exact: true }),
      ).toBeVisible();
      for (const status of await page.locator(".studio-home-list small").all())
        await expect(status).toHaveCSS("white-space", "nowrap");
      const latest = (await activity(f.repo))[0];
      await expect(
        page.getByText(`Last: ${eventLabel(latest)} · ${latest.detail}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".studio-home-list small.warning")).toHaveCSS(
        "color",
        "rgb(122, 82, 0)",
      );
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
  await page.getByRole("tab", { name: "Staff notifications · 11" }).click();
  await capture(page, "02b-staff-emails-1440");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /Account menu/ })
    .click();
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await capture(page, "02b-staff-emails-dark-1440");
  await page.goto("/studio/workspace?view=brand");
  await capture(page, "workspace-brand-dark-1440");
  await page.goto("/studio/connections");
  await expect(page.locator(".connection-state.success").first()).toBeVisible();
  await capture(page, "04-connections-dark-1440");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("owner review Studio presentation keeps semantic statuses, controls and mobile clearance", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/templates");
  const search = page.getByRole("searchbox", { name: "Search templates" });
  await expect(search).toHaveAttribute("placeholder", "Search templates");
  const preview = page.locator(".studio-saved-preview .staff-table");
  const openBlock = preview.getByRole("link", { name: /^Open / }).first();
  await expect(openBlock).toHaveCSS("width", "44px");
  await expect(openBlock).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(preview).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const active = page.locator('.sidebar nav a[aria-current="page"]');
  await expect(active).toHaveCSS("color", "rgb(242, 245, 245)");
  await expect(page.locator(".sidebar footer").getByRole("button")).toHaveCount(
    1,
  ); // Only the account row is visible in the desktop footer.
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /Account menu/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Dark mode", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/studio/emails");
  await expect(
    page.locator('.studio-email-subject [data-field="proposal.title"]').first(),
  ).toHaveText("Proposal title");
  await page.getByRole("tab", { name: "Staff notifications · 11" }).click();
  await expect(
    page.locator(".studio-email-edited").filter({ hasText: "Read-only" }),
  ).toHaveCount(8);
  const group = page.locator(".studio-email-stage").first();
  const title = await group.locator("h2").boundingBox(),
    card = await group.locator(".studio-email-rows").boundingBox();
  expect(title!.x + title!.width).toBeLessThan(card!.x);
  await page.goto("/studio/workspace?view=brand");
  await expect(
    page.locator(".workspace-section-card > header [role=status]"),
  ).toHaveCount(0);
  const toggle = page.getByRole("switch", { name: /Show.*Powered by/ });
  const control = await toggle.boundingBox(),
    label = await page.locator(".workspace-switch>span").boundingBox();
  expect(control!.x).toBeGreaterThan(label!.x + label!.width);
  await page.getByRole("button", { name: "Team", exact: true }).click();
  const description = await page.locator(".team-heading>p").boundingBox(),
    heading = await page
      .locator(".workspace-section-card>header")
      .boundingBox();
  expect(description!.y - heading!.y - heading!.height).toBeLessThanOrEqual(5);
  const row = page.locator(".team-person").filter({ hasText: "Jamie Example" });
  await expect(row.locator(".team-status")).toHaveText("Active");
  const status = await row.locator(".team-status").boundingBox(),
    role = await row.getByRole("combobox").boundingBox();
  expect(status!.x + status!.width).toBeLessThan(role!.x);
  await page.goto("/studio/products");
  await expect(page.locator(".studio-sync-meta")).toContainText(
    "Synced with Stripe · test mode",
  );
  const catalog = await f.repo.entities<any>("pricing_items");
  const stripe = catalog.find((i) => i.stripe_lookup_key);
  await page.goto(`/studio/products?item=${stripe.id}`);
  const panel = page.getByRole("complementary", { name: "Product details" });
  await expect(
    panel.getByRole("spinbutton", { name: "List price", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("combobox", { name: "Interval", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("link", { name: "Edit in Stripe" }),
  ).toBeVisible();
  await page.goto("/studio/connections");
  const connected = page
    .locator(".connection-card")
    .filter({ hasText: "Stripe" })
    .first();
  await expect(connected.locator(".connection-state")).toHaveClass(/success/);
  await expect(
    page
      .locator(".connection-card")
      .filter({ hasText: "AI assistants" })
      .locator(".connection-state"),
  ).toHaveClass(/muted/);
  const monogram = await connected
      .locator(".connection-monogram")
      .boundingBox(),
    settingsLink = await connected
      .getByRole("link", { name: "Settings" })
      .boundingBox();
  expect(settingsLink!.x).toBeGreaterThan(monogram!.x + monogram!.width);
  // Positive configured states are healthy regardless of capitalization; disconnected stays neutral/amber.
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: { stripe: true, qbo: true, email: true, mock: false, mode: "test" },
    }),
  );
  await page.route("**/api/assistants", (route) =>
    route.fulfill({
      json: [
        {
          id: crypto.randomUUID(),
          name: "Claude",
          revoked: false,
          last_used: new Date().toISOString(),
        },
      ],
    }),
  );
  await page.reload();
  const qbo = page.locator(".connection-card").filter({
    has: page.getByRole("heading", { name: "QuickBooks", exact: true }),
  });
  await expect(qbo.locator(".connection-state")).toContainText(
    "Sandbox configured",
  );
  await expect(qbo.locator(".connection-state")).toHaveCSS(
    "color",
    "rgb(30, 90, 58)",
  );
  const claude = page.locator(".connection-card").filter({
    has: page.getByRole("heading", { name: "Claude", exact: true }),
  });
  await expect(claude.locator(".connection-state")).toContainText("Connected");
  await expect(claude.locator(".connection-state")).toHaveCSS(
    "color",
    "rgb(30, 90, 58)",
  );
});

test("Studio carry-over provider pills, unwrapped status and guarded danger removal", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=billing");
  await expect(
    page.locator(".workspace-setting-row .studio-tag-stripe"),
  ).toHaveText("Stripe");
  await expect(
    page.locator(".workspace-setting-row .studio-tag-qbo"),
  ).toHaveCSS("color", "rgb(30, 90, 58)");
  await expect(page.locator(".workspace-setting-row>a").first()).toHaveCSS(
    "white-space",
    "nowrap",
  );
  await expect(
    page.getByText(
      "Project fees, including the Own It Over Time kickoff. Until QuickBooks is connected, staff record the invoice number on the proposal.",
      { exact: true },
    ),
  ).toBeVisible();
  if (process.env.STUDIO_EDITORS_CAPTURE === "1") {
    mkdirSync("docs/screenshots/studio-v3-editors", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/studio-v3-editors/billing-defaults.png",
      animations: "disabled",
    });
  }
  const person = f.members.find((m) => m.display_name === "Jamie Example")!;
  const proposal = (await f.repo.list())[0];
  proposal.owner = {
    user_id: person.user_id,
    display_name: person.display_name,
    email: person.email,
  };
  proposal.created_by = `staff:${person.user_id}`;
  await f.repo.save(proposal, proposal.revision);
  await page.goto("/studio/workspace?view=team");
  await page.getByRole("button", { name: "Actions for Jamie Example" }).click();
  const remove = page.getByRole("button", {
    name: "Remove from workspace",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await expect(remove).toContainText("Reassign proposals first");
  await expect(remove).toHaveCSS("color", "rgb(148, 40, 27)");
  if (process.env.STUDIO_EDITORS_CAPTURE === "1")
    await page.screenshot({
      path: "docs/screenshots/studio-v3-editors/team-menu.png",
      animations: "disabled",
    });
});

const stage3Shots = "docs/screenshots/ink-and-clay-editor-studio";
async function captureStage3(page: Page, shot?: string) {
  if (!shot || process.env.INK_CLAY_STAGE3_CAPTURE !== "1") return;
  mkdirSync(stage3Shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${stage3Shots}/${shot}.png`,
    animations: "disabled",
  });
}

test("all existing Workspace sections and settings stay reachable after the restyle", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace");
  const nav = page.getByRole("navigation", { name: "Workspace sections" });
  await expect(nav.getByRole("button")).toHaveText(
    workspaceSections.map(([, label]) => label),
  );
  const settings: Record<(typeof workspaceSections)[number][0], RegExp[]> = {
    brand: [
      /Workspace name/,
      /Logo · used/,
      /Logo icon · square/,
      /Brand colors/,
      /Powered by Yeswell/,
      /Owner contact name/,
      /Contact email/,
      /Phone/,
      /Address/,
      /Business state/,
    ],
    fonts: [
      /Headings/,
      /Body text/,
      /Upload a font file/,
      /licensed for PDF embedding/,
    ],
    money: [/Currency/, /Cents/, /Only when needed/, /Always/],
    styles: [
      /Body size/,
      /Page margin preset/,
      /Quote layout/,
      /Text level/,
      /Color choices/,
      /Space above/,
      /Space below/,
      /Density choices/,
      /Typography details/,
    ],
    billing: [
      /Recurring services/,
      /One-time fees/,
      /Payment methods/,
      /Collection method/,
      /Default invoice terms/,
    ],
    team: [/Invite/, /Workspace team/, /Display name/, /Change your password/],
    signatory: [
      /Signatory name/,
      /Signatory title/,
      /Signatory staff account/,
      /Can countersign on/,
      /Electronic signature consent/,
    ],
    "client-links": [
      /Default link validity/,
      /Workspace timezone/,
      /Password by default/,
    ],
    "email-sending": [
      /Verified sending domain/,
      /Reply-to/,
      /First client view · in-app note/,
      /First client view · staff email/,
      /Notify super admins about client questions/,
      /Remind staff to countersign/,
      /Automatic client reminders/,
      /Not opened days/,
      /Viewed, not signed days/,
      /Stop after reminders/,
    ],
    "pricing-references": [/Reference name/, /Source/],
  };
  for (const [key, label] of workspaceSections) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    const section = page.getByRole("region", { name: label, exact: true });
    for (const disclosure of [
      "Workspace contact details",
      "More billing settings",
    ]) {
      const trigger = section.getByText(disclosure, { exact: true });
      if (await trigger.isVisible()) await trigger.click();
    }
    for (const control of settings[key]) {
      const candidates = section
        .getByLabel(control)
        .or(section.getByText(control))
        .filter({ visible: true });
      await expect(candidates.first(), `${label}: ${control}`).toBeVisible();
    }
  }
});

for (const width of [1440, 768, 375]) {
  test(`Studio routes pass axe in light and dark at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width, height: 1000 });
    const f = await fixture(page);
    const templates = await f.repo.entities<Template>("templates");
    const blocks = await f.repo.entities<any>("content_library");
    for (const [i, title] of [
      "A website that works as hard as you do",
      "Keeping your site healthy",
      "Be found by customers nearby",
    ].entries()) {
      await f.repo.put("templates", {
        ...templates[i],
        cover: {
          ...defaultCover(),
          elements: [
            {
              id: "title",
              kind: "title",
              align: "left",
              content: coverText(title),
            },
          ],
        },
      });
    }
    await f.repo.put("content_library", {
      ...blocks[0],
      used_in: {
        templates: [
          { id: templates[0].id, name: templates[0].name, edited: false },
        ],
        drafts: [
          {
            id: f.draft.id,
            title: f.draft.title,
            status: "draft",
            owner: f.members[0].user_id,
          },
        ],
      },
    });
    const product = (await f.repo.entities<any>("pricing_items")).find(
      (item) => item.schedule,
    );
    for (const theme of ["light", "dark"]) {
      await page.addInitScript(
        (value) => localStorage.setItem("proposal-theme", value),
        theme,
      );
      const audit = async (
        name: string,
        selector: string,
        screenshot?: string,
      ) => {
        await expect(page.locator(selector).first()).toBeVisible();
        await expect(page.locator(`${selector} .skeleton`)).toHaveCount(0);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${name} fits ${width}`,
        ).toBeLessThanOrEqual(width + 1);
        const result = await new AxeBuilder({ page })
          .include(selector)
          .exclude("iframe")
          .analyze();
        expect(
          result.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]),
          `${name} · ${theme} · ${width}`,
        ).toEqual([]);
        const filled = page.locator(
          `${selector} :is(.btn.action, .btn.studio-primary):visible:not(:disabled)`,
        );
        expect(
          await filled.count(),
          `${name} has one primary action`,
        ).toBeLessThanOrEqual(1);
        if (
          width === 1440 &&
          theme === "light" &&
          screenshot === "studio-products-1440" &&
          process.env.INK_CLAY_STAGE3_CAPTURE === "1"
        ) {
          await page.setViewportSize({ width, height: 1300 });
          await captureStage3(page, screenshot);
          await page.setViewportSize({ width, height: 1000 });
        } else if (width === 1440 && theme === "light")
          await captureStage3(page, screenshot);
      };
      for (const [route, selector, screenshot] of [
        ["/studio/templates", ".studio-v3-list", "studio-templates-1440"],
        [
          "/studio/templates?view=blocks",
          ".studio-v3-list",
          "studio-saved-blocks-1440",
        ],
        ["/studio/emails", ".studio-v3-emails", "studio-emails-1440"],
        [
          "/studio/emails/proposal_sent",
          ".studio-email-editor",
          "studio-email-editor-1440",
        ],
        ["/studio/products", ".studio-products-v3", ""],
        [
          "/studio/connections",
          ".studio-connections-v3",
          "studio-connections-1440",
        ],
        ["/studio/activity", ".studio-activity-v3", "studio-activity-1440"],
      ]) {
        await page.goto(route);
        await audit(route, selector, screenshot);
        if (route === "/studio/products" && product) {
          await page.goto(`/studio/products?item=${product.id}`);
          await expect(
            page.getByRole("heading", { name: "Plan terms", exact: true }),
          ).toBeVisible();
          await expect(
            page.locator(".studio-product-client-copy"),
          ).toBeVisible();
          await audit(
            "product details",
            ".studio-products-v3",
            "studio-products-1440",
          );
        }
      }
      await page.goto(`/studio/templates/${templates[0].id}`);
      await expect(page.locator(".studio-template-editor")).toBeVisible();
      const styles = page
        .getByRole("tab", { name: "Styles", exact: true })
        .filter({ visible: true });
      if (width >= 960) await styles.click();
      else if (width >= 700)
        await page
          .getByRole("button", { name: "Open Styles", exact: true })
          .click();
      else {
        await page.getByRole("button", { name: "More editor actions" }).click();
        await styles.click();
      }
      await expect(
        page
          .locator(".proposal-styles summary")
          .filter({ hasText: /^Header$/ })
          .filter({ visible: true }),
      ).toBeVisible();
      await audit(
        "template editor",
        ".studio-template-editor",
        "studio-template-editor-1440",
      );
      await page.goto(`/studio/blocks/${blocks[0].id}`);
      await expect(page.locator(".studio-saved-block-editor")).toBeVisible();
      const usage = page.locator(".saved-block-usage");
      if (width < 960 && !(await usage.isVisible())) {
        const trigger = page.getByRole("button", {
          name: "Open Used in",
          exact: true,
        });
        if (await trigger.isVisible()) await trigger.click();
        else {
          await page
            .getByRole("button", { name: "More editor actions" })
            .click();
          await page.getByRole("tab", { name: "Used in", exact: true }).click();
        }
      }
      await expect(usage.getByText("WHEN YOU SAVE")).toBeVisible();
      await expect(usage.getByText("Updates on save")).toBeVisible();
      await audit(
        "saved block editor",
        ".studio-saved-block-editor",
        "studio-block-editor-1440",
      );
      await page.goto("/studio/connections?view=imports");
      await audit(
        "Proposify import",
        ".studio-import-summary",
        "studio-import-1440",
      );
      await page.goto("/studio/workspace");
      const workspaceShots: Partial<
        Record<(typeof workspaceSections)[number][0], string>
      > = {
        brand: "studio-brand-1440",
        fonts: "studio-fonts-1440",
        billing: "studio-billing-1440",
        "client-links": "studio-client-links-1440",
        money: "studio-money-1440",
        signatory: "studio-signatory-1440",
      };
      for (const [key, label] of workspaceSections) {
        await page
          .getByRole("navigation", { name: "Workspace sections" })
          .getByRole("button", { name: label, exact: true })
          .click();
        await audit(label, ".studio-workspace-v3", workspaceShots[key]);
        if (
          key === "team" &&
          width === 1440 &&
          theme === "light" &&
          process.env.INK_CLAY_STAGE3_CAPTURE === "1"
        ) {
          await page
            .getByRole("button", { name: "Actions for Jamie Example" })
            .click();
          await expect(
            page.getByRole("button", { name: "Edit name", exact: true }),
          ).toBeVisible();
          await captureStage3(page, "studio-team-1440");
          await page.keyboard.press("Escape");
        }
      }
    }
  });
}
