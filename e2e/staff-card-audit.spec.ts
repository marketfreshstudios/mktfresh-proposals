import { cssColorToken } from "./css-color-token";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { starterTemplates } from "../seed/starter-templates";
import { accountSections } from "../src/lib/staff-account-model";
import { emailStudioPreview } from "../src/lib/email-studio";
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
  await page.route("**/api/email-templates/*/preview", async (route) => {
    const request = route.request();
    const preview = await emailStudioPreview(
      f.repo,
      { put: async () => {}, get: async () => new Uint8Array() },
      staff,
      new URL(request.url()).pathname.split("/").at(-2)!,
      request.postDataJSON(),
    );
    await route.fulfill({
      json: { ...preview.result, values: preview.values, context: {} },
    });
  });
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
    await surface(page.locator(".home-expiring-card"));
    const attention = page.getByRole("region", {
      name: "Needs your attention",
    });
    const attentionCard = attention.locator(".home-attention-empty");
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
    for (const selector of [
      ".record-details-values",
      ".record-quote-card",
      ".record-ready-list",
      ".record-timeline-list",
    ])
      await surface(page.locator(selector));
    // Sent emails are Timeline entries now; none exist for this draft.
    await expect(page.locator(".timeline-email")).toHaveCount(0);
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
    for (const name of ["billing", "notes", "contact-card"])
      await surface(page.locator(`.client-${name}`));
    await table(page.locator(".client-proposals .staff-table"));
    await table(page.locator(".client-activity-table"));
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
      studioNav.getByText("1 template | 1 saved block"),
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

const ownerReviewEvidence = "docs/screenshots/staff-loading-and-hover";
async function captureOwnerReview(page: Page, name: string) {
  if (process.env.CAPTURE_STAFF_LOADING !== "1") return;
  await mkdir(ownerReviewEvidence, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${ownerReviewEvidence}/${name}.png`,
    animations: "disabled",
  });
}

test("staff routes show their heading and static controls before data arrives", async ({
  page,
}) => {
  const f = await fixture(page);
  const savedBlock = (
    await f.repo.entities<{ id: string }>("content_library")
  )[0];
  const cases = [
    { url: "/", heading: "Home", control: "New proposal" },
    { url: "/proposals", heading: "Proposals", control: "Proposal views" },
    { url: `/proposals/${f.draft.id}?view=record`, heading: "Proposal" },
    { url: "/reports", heading: "Reports", control: "Export CSV" },
    { url: "/clients", heading: "Clients", control: "Billing in Stripe" },
    {
      url: `/clients/${f.draft.client.id}`,
      heading: "Client record",
      control: "Edit client",
    },
    { url: "/studio", heading: "Studio" },
    {
      url: "/studio/templates",
      heading: "Templates & blocks",
      control: "Templates and saved blocks",
    },
    {
      url: "/studio/templates?view=blocks",
      heading: "Templates & blocks",
      control: "Search blocks",
    },
    {
      url: `/studio/templates/${f.templates[0].id}`,
      heading: "Templates & blocks",
    },
    { url: `/studio/blocks/${savedBlock.id}`, heading: "Studio" },
    {
      url: "/studio/products",
      heading: "Products",
      control: "Search products",
    },
    { url: "/studio/emails", heading: "Emails", control: "Email audiences" },
    { url: `/studio/emails/${f.emails[0].key}`, heading: "Emails" },
    {
      url: "/studio/activity",
      heading: "Activity log",
      control: "Search activity",
    },
    {
      url: "/studio/workspace?view=team",
      heading: "Workspace",
      control: "Workspace sections",
    },
    { url: "/studio/connections", heading: "Connections" },
    { url: "/studio/connections/stripe", heading: "Stripe" },
    { url: "/studio/connections/quickbooks", heading: "QuickBooks" },
    {
      url: "/studio/connections?view=email",
      heading: "Email sending",
      control: "Open sending domain",
    },
    { url: "/studio/connections?view=assistants", heading: "AI assistants" },
    {
      url: "/studio/connections?view=imports",
      heading: "Import from Proposify",
      control: "View imported proposals",
    },
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const { url, heading, control } of cases) {
    const hold = Promise.withResolvers<void>();
    const session = "**/api/auth/session";
    const reports = "**/api/reports?*";
    const waitForRelease = async (route: import("@playwright/test").Route) => {
      await hold.promise;
      await route.fallback();
    };
    await page.route(session, waitForRelease);
    await page.route(reports, waitForRelease);
    try {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: heading, level: 1, exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("main")
          .getByRole("status", { name: /^Loading / })
          .first(),
      ).toBeVisible();
      if (control)
        await expect(
          page
            .getByRole("main")
            .getByLabel(control, { exact: true })
            .or(
              page
                .getByRole("main")
                .getByRole("button", { name: control, exact: true }),
            )
            .or(
              page
                .getByRole("main")
                .getByRole("link", { name: control, exact: true }),
            ),
        ).toBeVisible();
    } finally {
      hold.resolve();
      await page.unroute(session, waitForRelease);
      await page.unroute(reports, waitForRelease);
    }
  }
});

test("Reports and Clients keep their header and filter positions during loading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page);
  for (const [company, first_name, last_name] of [
    ["Pine & Paper", "Kim", "Rivera"],
    ["Harbor Dental", "Maya", "Chen"],
    ["Northwind Studio", "Sam", "Lee"],
  ]) {
    await f.repo.put("clients", {
      ...f.draft.client,
      id: crypto.randomUUID(),
      company,
      first_name,
      last_name,
      email: `${first_name.toLowerCase()}@example.test`,
    });
  }
  for (const { title, endpoint, filters, loaded, captureName } of [
    {
      title: "Reports",
      endpoint: "**/api/reports?*",
      filters: ".report-filterbar",
      loaded: ".report-metric",
      captureName: "reports",
    },
    {
      title: "Clients",
      endpoint: "**/api/clients",
      filters: ".clients-directory-v4 .list-tools",
      loaded: ".client-table-row",
      captureName: "clients",
    },
  ]) {
    const hold = Promise.withResolvers<void>();
    const waitForRelease = async (route: import("@playwright/test").Route) => {
      await hold.promise;
      await route.fallback();
    };
    await page.route(endpoint, waitForRelease);
    const heading = page.getByRole("heading", {
      name: title,
      level: 1,
      exact: true,
    });
    const controls = page.locator(filters);
    try {
      await page.goto(
        title === "Reports" ? "/reports?range=last-90" : "/clients",
      );
      await expect(heading).toBeVisible();
      await expect(controls).toBeVisible();
      await expect(
        page
          .getByRole("main")
          .getByRole("status", { name: /^Loading / })
          .first(),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const titleY = (await heading.boundingBox())!.y;
      const filtersY = (await controls.boundingBox())!.y;
      await captureOwnerReview(page, `${captureName}-loading-1440`);
      hold.resolve();
      await expect(page.locator(loaded).first()).toBeVisible();
      expect((await heading.boundingBox())!.y).toBeCloseTo(titleY, 0);
      expect((await controls.boundingBox())!.y).toBeCloseTo(filtersY, 0);
      await captureOwnerReview(page, `${captureName}-loaded-1440`);
    } finally {
      hold.resolve();
      await page.unroute(endpoint, waitForRelease);
    }
  }
});

test("staff data tables hover in Mist in light mode and preserve dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  for (const [url, rowSelector] of [
    ["/proposals", ".proposal-row"],
    ["/", ".proposal-row"],
    ["/clients", ".client-table-row"],
    ["/studio/templates?view=blocks", ".saved-block-table .staff-table-row"],
    ["/studio/products", ".product-table .staff-table-row"],
    ["/studio/emails", ".email-list-row"],
    ["/studio/activity", ".activity-row-v3"],
    ["/reports", ".report-breakdown-table tbody tr"],
  ]) {
    await page.goto(url);
    const row = page.locator(rowSelector).first();
    await row.hover();
    const cell = url === "/reports" ? row.locator("td").first() : row;
    await expect(cell).toHaveCSS(
      "background-color",
      await cssColorToken(cell, "--row-hover"),
    );
    if (url === "/proposals")
      await captureOwnerReview(page, "proposals-row-hover-1440");
  }
  await page.evaluate(() => localStorage.setItem("proposal-theme", "dark"));
  await page.goto("/proposals");
  const row = page.locator(".proposal-row").first();
  await row.hover();
  await expect(row).toHaveCSS(
    "background-color",
    await cssColorToken(row, "--row-hover"),
  );
});

test("staff pages and account states have one title and a sequential heading outline", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const savedBlock = (
    await f.repo.entities<{ id: string }>("content_library")
  )[0];
  for (const template of starterTemplates(f.repo.workspaceId))
    await f.repo.put("templates", template);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: staff,
        settings: f.settings,
        staff: f.members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: "fixture",
        account: {
          first_name: "Alex",
          last_name: "Morgan",
          job_title: "",
          phone: "",
          notifications: {},
          own_proposals_only: false,
          photo_url: null,
          date_format: null,
          timezone: null,
          theme: null,
        },
      },
    }),
  );
  await page.route("**/api/clients/*/billing", (route) =>
    route.fulfill({
      json: {
        available: true,
        subscriber: false,
        items: [],
        card: null,
        next_invoice: null,
        stripe_url: null,
        qbo_url: null,
      },
    }),
  );
  await page.route("**/api/account/security", (route) =>
    route.fulfill({
      json: { sessions: [], two_step: false, backup_codes_remaining: 0 },
    }),
  );
  const captures: Record<string, string> = {
    "/": "home",
    "/reports": "reports",
    "/clients": "clients",
    [`/clients/${f.draft.client.id}`]: "client-record",
    "/studio/templates": "templates",
    "/studio/templates?view=blocks": "saved-blocks",
    "/studio/workspace?view=brand": "workspace",
    "/studio/emails": "emails",
    "/studio/connections": "connections",
    "/studio/activity": "activity",
  };
  const routes = [
    "/",
    "/proposals",
    "/proposals?view=archived",
    "/proposals?report=sent",
    `/proposals/${f.draft.id}?view=record`,
    `/proposals/${f.draft.id}?view=evidence`,
    `/proposals/${f.draft.id}?action=edit`,
    "/clients",
    `/clients/${f.draft.client.id}`,
    "/reports",
    "/studio",
    "/studio/templates",
    "/studio/templates?view=blocks",
    `/studio/templates/${f.templates[0].id}`,
    `/studio/blocks/${savedBlock.id}`,
    "/studio/emails",
    `/studio/emails/${f.emails[0].key}`,
    "/studio/products",
    `/studio/products?item=${f.products[0].id}`,
    "/studio/connections",
    "/studio/activity",
    ...["stripe", "quickbooks", "email", "assistants", "imports"].map(
      (key) => `/studio/connections/${key}`,
    ),
    ...workspaceSections.map(([key]) => `/studio/workspace?view=${key}`),
    ...accountSections.map(([key]) => (key ? `/account/${key}` : "/account")),
  ];

  const outlines: Record<string, string[]> = {};
  let homeType: string[] | undefined;
  const expectedCanvas: Record<string, string[]> = {
    "/": ["Expiring this week", "Needs your attention", "Recent proposals"],
    "/reports": ["Breakdowns", "Engagement"],
    "/studio/templates": ["Saved blocks"],
    "/studio/templates?view=blocks": ["Saved blocks"],
    "/studio/connections": ["Billing", "Email", "AI assistants", "Imports"],
    "/studio/emails": ["Send", "Follow up", "Questions", "Sign", "Billing"],
    "/proposals?report=sent": ["Proposals sent"],
  };
  async function check(label: string) {
    await expect(
      page
        .getByRole("heading", { level: 1 })
        .and(page.locator(":not(.email-real-renderer *)"))
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: /^Loading / })).toHaveCount(
      0,
    );
    await expect
      .soft(page.locator("h1:not(.email-rendered *)"), label)
      .toHaveCount(1, { timeout: 1500 });
    await expect
      .soft(
        page
          .getByRole("heading", { level: 1 })
          .and(page.locator(":not(.email-real-renderer *)")),
        label,
      )
      .toHaveCount(1, { timeout: 1500 });
    await expect
      .soft(page.getByRole("heading").first(), label)
      .toHaveJSProperty("tagName", "H1");
    const audit = await new AxeBuilder({ page })
      // The proposal being authored has its own headings chosen by its author.
      .exclude(".editor-paper, .studio-blocks, .email-real-renderer")
      .withRules(["heading-order"])
      .analyze();
    expect
      .soft(
        audit.violations.flatMap((v) => v.nodes.map((n) => n.html)),
        label,
      )
      .toEqual([]);
    const headings = await page.locator("h2").evaluateAll((elements) =>
      elements.flatMap((el) => {
        const css = getComputedStyle(el);
        if (
          !el.getClientRects().length ||
          css.visibility === "hidden" ||
          el.closest(
            ".sr-only, .editor-paper, .studio-blocks, .email-real-renderer, [inert], [role=dialog]",
          )
        )
          return [];
        let surface = el.parentElement;
        while (
          surface &&
          !surface.matches(".workspace, .ink-clay") &&
          getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)"
        ) {
          surface = surface.parentElement;
        }
        return [
          {
            name: el.textContent?.trim().replace(/\s+/g, " "),
            type: [css.fontFamily, css.fontSize, css.fontWeight],
            onCanvas: !!surface?.matches(".workspace, .ink-clay"),
            shared: !!el.closest(".staff-section-heading"),
          },
        ];
      }),
    );
    if (label === "/")
      homeType = headings.find((h) => h.name === "Needs your attention")?.type;
    const sectionHeadings = headings.filter((h) => h.onCanvas);
    if (expectedCanvas[label])
      expect
        .soft(
          sectionHeadings.map((h) => h.name),
          label,
        )
        .toEqual(
          expectedCanvas[label].map((name) =>
            name === "Expiring this week"
              ? expect.stringMatching(/^Expiring this week/)
              : name,
          ),
        );
    for (const heading of sectionHeadings) {
      expect
        .soft(
          heading.shared,
          `${label}: ${heading.name} uses the shared heading`,
        )
        .toBe(true);
      expect
        .soft(heading.type, `${label}: ${heading.name} matches Home`)
        .toEqual(homeType);
    }
    for (const heading of headings.filter((h) => !h.onCanvas))
      expect
        .soft(
          heading.shared,
          `${label}: ${heading.name} stays a card or panel title`,
        )
        .toBe(false);
    const screenshotName = captures[label];
    if (process.env.CAPTURE_STAFF_SECTION_HEADINGS && screenshotName) {
      const dir = "docs/screenshots/staff-section-headings";
      await mkdir(dir, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${dir}/${screenshotName}-1440.png`,
        animations: "disabled",
        fullPage: true,
      });
    }
    if (process.env.CAPTURE_STAFF_HEADINGS) {
      outlines[label] = await page
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((elements) =>
          elements
            .filter(
              (el) =>
                el.getClientRects().length &&
                !el.closest(
                  ".editor-paper, .studio-blocks, .email-real-renderer, [inert]",
                ),
            )
            .map(
              (el) =>
                `${el.tagName} ${el.textContent?.trim().replace(/\s+/g, " ")}`,
            ),
        );
    }
  }
  for (const url of routes) {
    await page.goto(url);
    if (url === `/studio/emails/${f.emails[0].key}`) {
      const preview = page.getByRole("document", { name: "Email preview" });
      await expect(preview.locator("h1.email-title")).toBeVisible();
      await expect(preview.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
    if (url === "/account/security")
      await expect(
        page.getByRole("heading", { level: 3, name: "Where you’re signed in" }),
      ).toBeVisible();
    await check(url);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/account/security");
  await expect(
    page.getByRole("heading", { level: 2, name: "Where you’re signed in" }),
  ).toBeVisible();
  await page.goto(`/proposals/${f.draft.id}?action=edit`);
  await page.getByRole("button", { name: "Open Send", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Proposal tools" });
  await expect(tools.getByRole("heading", { level: 2 })).toHaveText("Send");
  await expect(
    tools.getByRole("heading", { level: 3, name: "Readiness" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/proposals");
  await page
    .getByRole("button", { name: "New proposal", exact: true })
    .first()
    .click();
  const newProposal = page.getByRole("dialog", { name: "New proposal" });
  await expect(newProposal.getByRole("heading", { level: 2 })).toHaveText(
    "New proposal",
  );
  await expect(newProposal.getByRole("heading", { level: 3 })).toHaveText([
    "Client",
    "Proposal",
    "What happens next",
  ]);

  await page.goto("/login");
  await check("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await check("Forgot password");
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({
      json: { expires_in_minutes: 60 },
    }),
  );
  await page.getByLabel("Email address").fill("person@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email", level: 1 }),
  ).toBeVisible();
  await check("Check your email");
  for (const url of [
    "/set-password",
    "/login/confirm-email",
    "/login?state=paused",
    "/login?state=removed",
    "/login?state=signed-out",
    "/login?state=two-step",
  ]) {
    await page.goto(url);
    await check(url);
  }
  if (process.env.CAPTURE_STAFF_HEADINGS)
    await writeFile(
      "/tmp/yeswell-staff-outlines.json",
      JSON.stringify(outlines, null, 2),
    );
});

test("Templates notes, Saved blocks heading and borderless ink editor headers", async ({
  page,
}) => {
  const f = await fixture(page);
  const starter = starterTemplates(f.repo.workspaceId)[0];
  await f.repo.put("templates", starter);
  const sample = {
    ...starter,
    id: crypto.randomUUID(),
    starter_key: undefined,
    name: "Sample proposal",
    sample: true,
  };
  await f.repo.put("templates", sample);
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function capture(name: string) {
    if (!process.env.CAPTURE_STAFF_HEADINGS) return;
    const directory = "docs/screenshots/staff-headings";
    await mkdir(directory, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${directory}/${name}.png`,
      animations: "disabled",
    });
  }
  await page.goto("/studio/templates");
  const notes = page.locator(".studio-template-note");
  await expect(notes).toHaveCount(2);
  for (const note of await notes.all()) {
    await expect(note).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(note).toHaveCSS("border-top-width", "0px");
  }
  await expect(page.locator('[data-starter-status="default"]')).toContainText(
    "Default",
  );
  await expect(
    page.locator(".starter-pill").filter({ hasText: "Starter" }),
  ).toHaveCount(0);
  await capture("templates-1440");
  await page.goto("/studio/templates?view=blocks");
  await expect(
    page.getByRole("heading", { name: "Saved blocks", level: 2 }),
  ).toBeVisible();
  await capture("saved-blocks-1440");

  for (const [url, back, name] of [
    [`/studio/templates/${starter.id}`, "Templates", "template-editor"],
    [`/proposals/${f.draft.id}?action=edit`, "Proposal", "proposal-editor"],
    [`/studio/emails/${f.emails[0].key}`, "Emails", "email-editor"],
  ]) {
    await page.goto(url);
    const link = page.getByRole("link", {
      name: `Back to ${back.toLowerCase()}`,
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveCSS("border-top-width", "0px");
    await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(link.locator("svg")).toHaveCSS(
      "color",
      await link.evaluate((el) => getComputedStyle(el).color),
    );
    if (name === "template-editor") {
      const title = page.getByRole("textbox", { name: "Template name" });
      await expect(title).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
      await expect(title).toHaveAttribute("title", starter.name);
      await expect(title).toHaveCSS("padding-left", "11px");
      await expect(title).toHaveCSS("padding-right", "11px");
      await expect(
        page.locator(".editor-document-header .starter-pill"),
      ).toHaveCount(0);
    }
    if (name !== "email-editor") await capture(`${name}-1440`);
  }
});
