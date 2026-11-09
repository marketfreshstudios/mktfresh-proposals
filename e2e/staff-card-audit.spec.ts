import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { emailTemplates } from "../src/lib/email-templates";
import { listViews, viewKey } from "../src/lib/proposal-state";
import {
  reportDateRange,
  reportFiltersSchema,
} from "../src/lib/report-filters";
import {
  buildReport,
  reportCandidateRows,
  reportDimensions,
  reportRows,
} from "../src/lib/report-metrics";
import { activity, providerActivity, workspaceEvent } from "../src/lib/studio";
import { workspaceSections } from "../src/lib/studio-v3";
import { staff } from "../tests/helpers";
import {
  sampleFacts,
  sampleNames,
  sampleNow,
  sampleProposals,
  sampleZone,
} from "../tests/report-fixture";
import { editorFixture } from "./editor-fixture";

const evidence = "docs/screenshots/staff-card-audit";
const capture = process.env.CAPTURE_STAFF_CARD_AUDIT === "1";
const white = "rgb(255, 255, 255)";

async function fixture(page: Page) {
  const f = await editorFixture(page);
  const templates = await f.repo.entities<{ id: string }>("templates");
  const products = await f.repo.entities<{ id: string }>("pricing_items");
  const emails = await emailTemplates(f.repo);
  const story = {
    id: crypto.randomUUID(),
    type: "paragraph",
    text: "A website refresh made registration easier for new families.",
  };
  await f.repo.put("content_library", {
    id: crypto.randomUUID(),
    name: "School website case study",
    block: story,
    type: "group",
    blocks: [
      {
        id: crypto.randomUUID(),
        type: "heading",
        text: "School website case study",
        level: 2,
      },
      story,
    ],
  });
  await f.repo.put("content_library", {
    id: crypto.randomUUID(),
    name: "Monthly support introduction",
    block: {
      ...story,
      id: crypto.randomUUID(),
      text: "Here is how we’ll support your team after launch.",
    },
  });
  await workspaceEvent(f.repo, staff, "catalog_synced", {
    provider: "stripe",
    detail: "Synced the workspace product catalog",
  });
  await page.route("**/api/email-templates", (route) =>
    route.fulfill({ json: emails }),
  );
  await page.route("**/api/workspace_events", async (route) =>
    route.fulfill({ json: await activity(f.repo) }),
  );
  await f.repo.put("workspace_documents", {
    id: crypto.randomUUID(),
    name: "Pricing guide",
    version: "November 2026",
    source_type: "pasted",
    content: "Use approved product prices for new proposals.",
    format: "text",
  });
  await page.route("**/api/connections/stripe/activity", async (route) =>
    route.fulfill({ json: await providerActivity(f.repo, "stripe") }),
  );
  await page.route("**/api/proposals/*/emails", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: {
        stripe: true,
        stripe_webhooks_configured: true,
        qbo: false,
        qbo_connection: { state: "not_connected", available: true },
        email: true,
        mock: false,
        mode: "test",
      },
    }),
  );
  const filters = reportFiltersSchema.parse({ range: "last-90" });
  const range = reportDateRange(filters, sampleZone, sampleNow);
  const report = buildReport(
    reportRows(
      reportCandidateRows(sampleProposals, filters, range),
      range,
      sampleNow,
      sampleFacts,
    ),
    range,
    reportDimensions(sampleProposals, sampleNames),
  );
  await page.route("**/api/reports?*", (route) =>
    route.fulfill({ json: report }),
  );
  return { ...f, templates, products, emails };
}

async function screenshot(page: Page, name: string) {
  if (!capture) return;
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${evidence}/${name}.png`,
    animations: "disabled",
    fullPage: true,
  });
}

async function surface(locator: Locator, color = white) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS("background-color", color);
}

async function table(locator: Locator, color = white) {
  await surface(locator, color);
  await expect(locator).toHaveCSS("border-top-width", "1px");
  await expect(locator).toHaveCSS("border-radius", "18px");
  const header = locator.locator(":scope > .staff-table-head");
  await surface(header, color);
  await expect(header).toHaveCSS("text-transform", "uppercase");
  const firstRow = locator
    .locator(":scope > :is(.staff-table-row, .empty-copy)")
    .first();
  await expect(firstRow).toHaveCSS("border-top-width", "1px");
}

test.describe("Staff content surfaces", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("Home, proposal views, record, Clients, Reports and account surfaces", async ({
    page,
  }) => {
    const f = await fixture(page);
    await page.goto("/");
    await table(page.locator(".proposal-rows.staff-table"));
    await surface(page.locator(".home-expiring"));
    const attention = page.getByRole("region", {
      name: "Needs your attention",
    });
    const attentionCard = attention.locator(".home-attention-list");
    await surface(attentionCard);
    await expect(attentionCard).toHaveCSS("border-top-width", "1px");
    await expect(attentionCard).toHaveText(
      "You’re all caught up. Drafts to review, signatures to countersign and billing problems will appear here.",
    );
    await screenshot(page, "home-recent-1440");

    for (const view of listViews) {
      await page.goto(`/proposals?view=${viewKey(view)}`);
      await table(page.locator(".proposal-rows.staff-table"));
    }
    await screenshot(page, "proposals-empty-1440");
    await page.goto("/proposals?view=all");
    await table(page.locator(".proposal-rows.staff-table"));
    await expect(page.getByText("1 proposal", { exact: true })).toBeVisible();
    await screenshot(page, "proposals-1440");

    await page.goto(`/proposals/${f.draft.id}?view=record`);
    await surface(page.locator(".record-sheet"));
    await expect(
      page.locator(".proposal-email-table .empty-copy"),
    ).toContainText("No saved email copies yet.");
    await screenshot(page, "proposal-record-1440");
    await page.goto(`/proposals/${f.draft.id}?view=evidence`);
    await surface(page.locator(".table-wrap.staff-table"));
    await screenshot(page, "proposal-evidence-1440");

    await page.goto("/clients");
    await table(page.locator(".client-table.staff-table"));
    await screenshot(page, "clients-1440");
    await page.getByLabel("Search clients").fill("missing");
    await expect(page.locator(".client-table .empty-copy")).toHaveText(
      "No clients match this view.",
    );
    await screenshot(page, "clients-filter-empty-1440");
    await page.goto(`/clients/${f.draft.client.id}`);
    for (const name of [
      "billing",
      "proposals",
      "notes",
      "activity",
      "contact-card",
    ])
      await surface(page.locator(`.client-${name}`));
    await expect(
      page.locator(".client-activity-table .staff-table-head"),
    ).toBeVisible();
    await screenshot(page, "client-detail-1440");

    await page.goto("/reports?range=last-90");
    await surface(page.locator(".report-metric").first());
    for (const card of await page.locator(".report-card").all())
      await surface(card);
    await expect(page.locator(".report-card")).toHaveCount(6);

    await page.setViewportSize({ width: 375, height: 900 });
    await page.route("**/api/content_library", async (route) => {
      const blocks = await f.repo.entities("content_library");
      await route.fulfill({ json: blocks.slice(0, 1) });
    });
    await page.goto("/studio");
    const studioNav = page.getByRole("navigation", {
      name: "Studio navigation",
    });
    await expect(
      studioNav.getByText("1 template · 1 saved block"),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.goto("/login");
    await surface(page.locator(".account-frame .card"));
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await surface(page.locator(".account-frame .card"));
    await page.goto("/set-password");
    await surface(page.locator(".account-frame .card"));
  });

  test("Studio record lists and editor panels", async ({ page }) => {
    const f = await fixture(page);
    await page.goto("/studio/templates");
    await surface(page.locator(".studio-template-card").first());
    await table(page.locator(".studio-saved-preview .staff-table"));
    await screenshot(page, "templates-1440");
    await page
      .getByRole("searchbox", { name: "Search templates" })
      .fill("nothing matches");
    await surface(page.locator(".staff-empty"));
    await screenshot(page, "templates-search-empty-1440");

    await page.goto("/studio/templates?view=blocks");
    const blocks = page.locator(".saved-block-table.staff-table");
    await table(blocks);
    await expect(blocks.locator(".staff-table-head")).toHaveText(
      "NameBlocksUsed inUpdatedActions",
    );
    await screenshot(page, "saved-blocks-1440");
    const open = blocks.getByRole("link", { name: /^Open / }).first();
    await expect(open).toHaveCSS("border-top-width", "0px");
    await expect(open).toHaveCSS("width", "44px");
    await expect(open).toHaveCSS("height", "44px");
    await open.focus();
    await expect(blocks.getByRole("tooltip").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/studio\/blocks\//);
    await surface(page.locator(".editor-sidepanel"));
    await surface(page.locator(".saved-block-footer"));
    await screenshot(page, "saved-block-editor-1440");
    await page.goto(`/studio/templates/${f.templates[0].id}`);
    await surface(page.locator(".editor-sidepanel"));
    await page.goto(`/proposals/${f.draft.id}?action=edit`);
    await surface(page.locator(".editor-sidepanel"));

    await page.goto("/studio/templates?view=blocks");
    await page
      .getByRole("searchbox", { name: "Search blocks" })
      .fill("nothing matches");
    await expect(blocks.locator(".empty-copy")).toHaveText(
      "No matching blocks.",
    );
    await screenshot(page, "saved-blocks-filter-empty-1440");

    await page.goto("/studio/emails");
    await table(page.locator(".studio-email-rows.staff-table").first());
    await screenshot(page, "emails-client-1440");
    await page.getByRole("tab", { name: /Staff notifications/ }).click();
    await table(page.locator(".studio-email-rows.staff-table").first());
    await screenshot(page, "emails-staff-1440");
    await page.goto(`/studio/emails/${f.emails[0].key}`);
    await surface(page.locator(".editor-sidepanel"));

    await page.goto("/studio/products");
    await table(page.locator(".product-table.staff-table"));
    await screenshot(page, "products-1440");
    await page.goto(`/studio/products?item=${f.products[0].id}`);
    await surface(page.locator(".studio-product-detail"));
    await screenshot(page, "product-detail-1440");
    await page
      .getByRole("searchbox", { name: "Search products" })
      .fill("nothing matches");
    await expect(page.locator(".product-table .empty-copy")).toHaveText(
      "No matching products.",
    );

    await page.goto("/studio/activity");
    await table(page.locator(".activity-day-rows.staff-table").first());
    await screenshot(page, "activity-1440");
    await page
      .getByRole("searchbox", { name: "Search activity" })
      .fill("nothing matches");
    await expect(page.locator(".activity-day-rows .empty-copy")).toHaveText(
      "No activity matches these filters.",
    );
    await screenshot(page, "activity-empty-1440");
  });

  test("Workspace and connection screens keep one surface layer", async ({
    page,
  }) => {
    await fixture(page);
    await page.goto("/studio/connections");
    await surface(page.locator(".connection-card").first());
    for (const provider of [
      "stripe",
      "quickbooks",
      "email",
      "assistants",
      "imports",
    ]) {
      await page.goto(`/studio/connections/${provider}`);
      await surface(page.locator(".connection-panel").first());
      if (provider === "stripe") {
        await expect(
          page.locator(".connection-activity .staff-table-head"),
        ).toBeVisible();
        await screenshot(page, "stripe-activity-1440");
      }
      if (provider === "quickbooks") {
        await surface(page.locator(".connection-setup-note"));
        await screenshot(page, "quickbooks-start-1440");
      }
    }
    for (const [view] of workspaceSections) {
      await page.goto(`/studio/workspace?view=${view}`);
      await surface(page.locator(`.workspace-section-card[id="${view}"]`));
      if (view === "team") {
        await expect(page.locator(".team-table")).toHaveClass(
          /staff-table-inline/,
        );
        await expect(page.locator(".team-table")).toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
        await surface(page.locator(".team-table-head"));
        await screenshot(page, "workspace-team-1440");
      }
      if (view === "pricing-references") {
        await expect(
          page.getByRole("region", { name: "Pricing reference status" }),
        ).toBeVisible();
        await expect(page.locator(".workspace-section-card .card")).toHaveCount(
          0,
        );
        await screenshot(page, "workspace-pricing-references-1440");
      }
    }
  });

  test("Studio table rows use dark surfaces and preserve 44px phone actions", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("proposal-theme", "dark"),
    );
    await fixture(page);
    await page.goto("/studio/templates?view=blocks");
    await table(page.locator(".saved-block-table"), "rgb(24, 34, 38)");
    await screenshot(page, "saved-blocks-dark-1440");
    await page.setViewportSize({ width: 375, height: 812 });
    for (const [route, selector] of [
      ["/studio/templates?view=blocks", ".saved-block-table"],
      ["/studio/emails", ".studio-email-rows"],
      ["/studio/activity", ".activity-day-rows"],
    ]) {
      await page.goto(route);
      const list = page.locator(selector).first();
      await surface(list, "rgb(24, 34, 38)");
      const link = list.locator(".staff-table-open").first();
      await expect(link).toBeVisible();
      await expect(link).toHaveCSS("width", "44px");
      await expect(link).toHaveCSS("height", "44px");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(375);
    }
  });
});
