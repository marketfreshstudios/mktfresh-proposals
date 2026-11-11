import { cssColorToken } from "./css-color-token";
import {
  expectStraightTabIndicator,
  expectNoTabUnderline,
} from "./tab-indicator";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  clientActor,
  companyConsent,
  setup,
  signature,
  staff,
} from "../tests/helpers";
import { proposalAction } from "../src/lib/proposal-actions";
import type { Client, Proposal } from "../src/lib/model";

const evidence = "docs/screenshots/ink-and-clay-records";
async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_INK_CLAY_RECORDS !== "1") return;
  await page.evaluate(() => document.fonts.ready);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/${name}.png`,
    animations: "disabled",
  });
}

async function scenario(page: Page) {
  const { repo, service, draft, settings, members } = await setup();
  const now = new Date();
  settings.timezone = "America/New_York";
  settings.company_name = "Example Studio";
  const delegate = {
    ...staff,
    actor: `staff:${randomUUID()}`,
    staff_name: "Fran Weber",
    staff_email: "fran@example.test",
  };
  members.push({
    user_id: delegate.actor.slice(6),
    display_name: delegate.staff_name,
    name: delegate.staff_name,
    email: delegate.staff_email,
    role: "owner",
  });
  settings.company_signatory?.authorized_user_ids.push(delegate.actor.slice(6));
  await repo.put("workspace_settings", settings);
  const date = (days: number) =>
    new Date(now.getTime() + days * 86400000).toISOString();
  const clients: Client[] = [];
  async function create(
    company: string,
    title: string,
    first: string,
    stripe = false,
  ) {
    const client = {
      ...draft.client,
      id: randomUUID(),
      company,
      first_name: first,
      last_name: "Example",
      email: `${first.toLowerCase()}@example.test`,
      phone: "(305) 555-0188",
      notes: "Prefers email to schedule the kickoff.",
      stripe_customer_id: stripe ? "cus_example" : null,
    };
    clients.push(client);
    await repo.put("clients", client);
    return service.create(
      {
        client_id: client.id,
        template_id: draft.template_id!,
        title,
        valid_until: date(3),
      },
      staff,
    );
  }
  async function send(p: Proposal) {
    return service.send(p.id, staff);
  }
  async function sign(p: Proposal, complete = false) {
    const signed = await service.sign(
      p.id,
      {
        ...signature(p.revision, p.client.email),
        name: `${p.client.first_name} Example`,
        typed_name: `${p.client.first_name} Example`,
      },
      "client",
      clientActor,
      { token: p.token!, password: "" },
    );
    if (!complete) return signed;
    const result = await service.sign(
      signed.id,
      companyConsent(signed.revision, settings),
      "company",
      staff,
    );
    result.jobs = result.jobs.map((job) => ({ ...job, status: "done" }));
    result.billing_links = [
      {
        provider: "stripe",
        status: "succeeded",
        attempts: 1,
        metadata: { requires_checkout: false },
      },
    ];
    return result;
  }
  const ai = await create(
    "Harbor Dental",
    "A website built for new patients",
    "Dana",
    true,
  );
  ai.ai_unreviewed = true;
  ai.ai_connector = "Claude";
  const waiting = await send(
    await create("Cedar Law", "Local visibility", "Priya"),
  );
  const opened = await send(
    await create("Northside Gym", "Website redesign", "Leo"),
  );
  const viewed = await service.view(opened.token!, "", clientActor);
  const countersign = await sign(
    await send(
      await create("Oak & Pine Bakery", "Care plan renewal", "Maya", true),
    ),
  );
  const completed = await sign(
    await send(
      await create("Brightline Foods", "Website and care", "Rowan", true),
    ),
    true,
  );
  const billing = await sign(
    await send(await create("Lumen Yoga", "Local visibility", "Ana")),
    true,
  );
  billing.billing_links = [
    {
      provider: "stripe",
      status: "failed",
      attempts: 1,
      metadata: { requires_checkout: true },
      last_error: "Checkout was not finished",
    },
    {
      provider: "qbo",
      status: "needs_review",
      attempts: 1,
      last_error: "One-time invoice needs review",
    },
  ];
  const lost = await send(
    await create("Ridge Roofing", "Website build", "Tom"),
  );
  lost.status = "declined";
  lost.marked_lost_by = staff.actor;
  const expired = await send(
    await create("Copper Kettle", "Care plan", "Taylor"),
  );
  expired.status = "expired";
  expired.valid_until = date(-1);
  const archived = await create("Sunset Realty", "New site", "Casey");
  archived.archived_at = date(-1);
  const manual = await create(
    "Greenway Landscaping",
    "Managed hosting",
    "Avery",
  );
  manual.status = "completed";
  manual.marked_won_by = staff.actor;
  const imported: Proposal = {
    ...(await create("Bloom Florals", "Historic proposal", "Sam")),
    source: "proposify_import",
    status: "archived",
  };
  const rows = [
    ai,
    waiting,
    viewed,
    countersign,
    completed,
    billing,
    lost,
    expired,
    archived,
    manual,
    imported,
  ];
  for (const p of rows) await repo.save(p, p.revision);
  await page.clock.setFixedTime(new Date());
  const all = async () =>
    (await repo.list()).filter(
      (p) => rows.some((row) => row.id === p.id) || p.title.endsWith("(copy)"),
    );
  let billingReads = 0;
  const actions: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const [area, id, sub] = new URL(request.url()).pathname.slice(5).split("/");
    let json: unknown = [];
    if (area === "auth")
      json = {
        user: delegate,
        settings,
        staff: members,
        app_url: new URL(request.url()).origin,
        signatory_version: companyConsent(0, settings).signatory_version,
      };
    else if (area === "proposals") {
      if (!id) {
        const items = await all();
        json = {
          total: items.length,
          items: items.map((p) => ({
            ...p,
            version_count: p.versions.length,
            versions: [],
            content: [],
          })),
        };
      } else if (sub === "actions") {
        const { revision, action, note } = request.postDataJSON();
        actions.push(action);
        json = await proposalAction(
          repo,
          id,
          revision,
          action,
          staff,
          note,
          new Date(),
          service,
        );
      } else json = await repo.get(id);
    } else if (area === "clients") {
      if (sub === "billing") {
        billingReads++;
        json = {
          available: true,
          subscriber: true,
          linked_id: "cus_example",
          candidates: [],
          card: "Visa ending 4242",
          items: [
            {
              id: "si_example",
              name: "Website care and hosting",
              amount: 17500,
              currency: "USD",
              interval: "month",
              interval_count: 1,
              qty: 1,
            },
          ],
        };
      } else json = clients;
    } else if (area === "engagement") json = {};
    else if (area === "workspace_settings") json = [settings];
    else if (["templates", "pricing_items", "content_library"].includes(area))
      json = await repo.entities(area as "templates");
    await route.fulfill({ json });
  });
  return {
    ai,
    waiting,
    viewed,
    countersign,
    completed,
    billing,
    lost,
    expired,
    archived,
    manual,
    imported,
    actions,
    billingReads: () => billingReads,
  };
}
const record = (p: Proposal) => `/proposals/${p.id}?view=record`;
const row = (page: Page, p: Proposal) =>
  page.locator(".proposal-row").filter({
    has: page.getByRole("link", {
      name: `Open ${p.client.company}: ${p.title}`,
      exact: true,
    }),
  });

test("Home, list views and action slots use the existing proposal states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await scenario(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Needs your attention" }),
  ).toBeVisible();
  await expect(page.locator(".home-attention-row .attention-chip")).toHaveText([
    "AI draft",
    "Needs countersign",
    "Viewed",
    "Billing issue",
  ]);
  await expect(page.locator(".home-v4 .btn.action")).toHaveCount(1);
  await expect(page.locator("[data-pipeline-stage-count]")).toHaveText([
    "1 Sent",
    "1 Viewed",
    "3 Won",
  ]);
  await expect(page.locator(".home-expiring li")).toHaveCount(2);
  await expect(
    page.locator(".home-expiring").getByRole("link", { name: /Cedar Law/ }),
  ).toHaveAttribute("href", `/proposals/${f.waiting.id}`);
  await capture(page, "home-1440");
  await page.goto("/proposals");
  const tabs = page.getByRole("tablist", { name: "Proposal views" });
  const proposalCount = page.locator(".page-header p");
  await expect(proposalCount).toHaveText("9 proposals");
  await expect(tabs.getByRole("tab")).toHaveText([
    "All 9",
    "Drafts 1",
    "Sent 2",
    "Viewed 1",
    "Won 4",
    "Needs countersign 1",
  ]);
  await tabs.getByRole("tab", { name: "All 9" }).press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Drafts 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs.getByRole("tab", { name: "All 9" }).click();
  for (const [p, first] of [
    [f.ai, "Edit"],
    [f.waiting, "Edit"],
    [f.viewed, "Edit"],
    [f.lost, "Edit"],
    [f.expired, "Edit"],
    [f.countersign, "Countersign"],
    [f.completed, ""],
    [f.billing, ""],
    [f.manual, ""],
  ] as const) {
    const actions = row(page, p).locator(".proposal-row-actions");
    await expect(actions).toHaveCSS("width", "196px");
    const slots = actions.locator(":scope > *");
    await expect(slots).toHaveCount(4);
    if (first) {
      const action = slots
        .nth(0)
        .getByRole("button", { name: first, exact: true });
      await expect(action).toBeVisible();
      await expect(
        action.locator(
          first === "Edit" ? "svg.lucide-square-pen" : "svg.lucide-pen-tool",
        ),
      ).toBeVisible();
      await expect(action).toHaveText("");
    } else {
      await expect(slots.nth(0)).toHaveClass("proposal-action-spacer");
      await expect(slots.nth(0)).toHaveCSS("width", "40px");
      await expect(slots.nth(0).locator(".btn")).toHaveCount(0);
    }
    await expect(
      slots.nth(1).getByRole("button", { name: "Duplicate" }),
    ).toHaveCSS("width", "40px");
    await expect(
      slots.nth(2).getByRole("button", { name: "Archive" }),
    ).toBeVisible();
  }
  await row(page, f.viewed).getByRole("button", { name: "Duplicate" }).hover();
  await expect(
    row(page, f.viewed).getByRole("tooltip", { name: "Duplicate" }),
  ).toBeVisible();
  const moreViews = page.getByRole("button", {
    name: "More views",
    exact: true,
  });
  await expect(moreViews).toHaveCSS("border-radius", "999px");
  await expectNoTabUnderline(moreViews);
  await capture(page, "proposals-tooltip-1440");
  await row(page, f.lost)
    .getByRole("button", { name: /More actions/ })
    .press("Enter");
  const menu = page.getByRole("dialog");
  for (const label of ["Open record", "Preview as client", "Download PDF"])
    await expect(menu.getByRole("link", { name: label })).toBeVisible();
  for (const label of [
    /^Mark as sent again/,
    /^Mark as won/,
    /^Mark as lost/,
    /^Copy client link/,
  ])
    await expect(menu.getByRole("button", { name: label })).toBeVisible();
  await expect(
    menu.getByRole("button", { name: /Reassign|Duplicate|^Archive$/ }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/proposals$/);
  await capture(page, "proposals-menu-1440");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More views", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archived 1" })
    .click();
  await expect(
    row(page, f.archived).getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(
    row(page, f.archived).getByRole("button", {
      name: "Unarchive",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "proposals-archived-1440");
  await page.goto("/proposals?view=imported");
  await expect(
    row(page, f.imported).locator(".proposal-row-actions .btn"),
  ).toHaveCount(1);
  await expect(
    row(page, f.imported).getByRole("button", { name: "Archive" }),
  ).toBeVisible();
  await page.goto("/proposals");
  await expect(row(page, f.waiting)).toBeVisible();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("dialog", { name: "New proposal" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/proposals$/);
  await capture(page, "new-proposal-1440");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await row(page, f.waiting).getByRole("button", { name: "Archive" }).click();
  await expect(row(page, f.waiting)).toHaveCount(0);
  await expect(tabs.getByRole("tab", { name: "All 8" })).toBeVisible();
  await expect(proposalCount).toHaveText("8 proposals");
  await expect(page).toHaveURL(/\/proposals$/);
  expect(f.actions).toEqual(["archive"]);
  await row(page, f.countersign)
    .getByRole("button", { name: "Countersign", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: /^Countersign/ }),
  ).toBeVisible();
  await page.route("**/api/proposals?limit=100", (route) =>
    route.fulfill({ json: { total: 0, items: [] } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("progressbar", { name: "Workspace setup progress" }),
  ).toBeVisible();
  await capture(page, "home-first-run-1440");
});

test("record toolbar and next step select one primary action without widening signing or billing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await scenario(page);
  for (const [p, label, shot] of [
    [f.ai, "Edit", ""],
    [f.waiting, "Edit", ""],
    [f.viewed, "Edit", "record-viewed"],
    [f.countersign, "Review & countersign", "record-signed"],
    [f.completed, "Download PDF", "record-completed"],
    [f.billing, "Download PDF", "record-billing"],
    [f.lost, "Duplicate", ""],
    [f.expired, "Edit", ""],
    [f.manual, "Download PDF", ""],
    [f.archived, "Unarchive", ""],
    [f.imported, "Download PDF", ""],
  ] as const) {
    await page.goto(record(p));
    const toolbar = page.locator(".record-toolbar");
    const heroPrimary = page.locator(
      ".record-next-actions > div:first-child .btn",
    );
    if (p === f.imported) {
      await expect(
        toolbar.getByRole("link", { name: "Download PDF", exact: true }),
      ).toHaveCount(0);
      await expect(heroPrimary).toHaveAccessibleName("Download PDF");
    } else {
      const toolbarAction = toolbar
        .getByRole("button", { name: label, exact: true })
        .or(toolbar.getByRole("link", { name: label, exact: true }));
      await expect(toolbarAction).toBeVisible();
      await expect(toolbarAction.locator("svg")).toHaveCount(0);
    }
    if (await heroPrimary.count()) {
      await expect(heroPrimary).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      await expect(toolbar.locator(".record-primary")).toHaveCount(0);
    } else {
      await expect(toolbar.locator(".record-primary")).toHaveCount(1);
    }
    if (p === f.imported || p === f.archived)
      await expect(
        toolbar.getByRole("link", { name: "Preview as client" }),
      ).toHaveCount(0);
    if (p === f.viewed) {
      const event = page.locator(".timeline-entry-meta").first();
      await expect(event).toContainText(/\sView evidence/);
      await expect(event).toHaveCSS("column-gap", "10px");
    }
    if (p === f.countersign) {
      await expect(page.locator(".record-jobs .ps-pill").first()).toHaveCSS(
        "border-radius",
        "6px",
      );
    }
    if (shot) await capture(page, `${shot}-1440`);
    if (p === f.billing) {
      const hero = page.locator(".next-card");
      await expect(hero).toHaveAttribute("data-problem", "true");
      await expect(
        hero.getByRole("button", { name: "Resend payment link" }),
      ).toBeVisible();
      await expect(
        hero.getByRole("button", { name: "Invoice manually" }),
      ).toBeVisible();
      await expect(
        hero.getByRole("button", { name: "Retry billing" }),
      ).toHaveCount(0);
    }
    if (p === f.manual) {
      await expect(page.getByText(/Marked as won by /)).toBeVisible();
      await expect(page.locator(".record-signatures")).toHaveCount(0);
    }
  }
  await page.goto(record(f.countersign));
  await page
    .locator(".record-toolbar")
    .getByRole("link", { name: "Review & countersign" })
    .click();
  const sheet = page.getByRole("dialog", { name: /^Countersign/ });
  for (const heading of [
    "What the client agreed to",
    "Client signature",
    "Company signature",
  ])
    await expect(sheet.getByRole("heading", { name: heading })).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: /Countersign as/ }),
  ).toBeDisabled();
  await expect(sheet.getByText(/on behalf of/i).first()).toBeVisible();
  await capture(page, "record-countersign-1440");
});

for (const width of [1440, 768, 375]) {
  test(`staff screens fit and pass axe in both themes at ${width}px`, async ({
    page,
  }) => {
    const f = await scenario(page);
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.addInitScript(
        (mode) => localStorage.setItem("proposal-theme", mode),
        theme,
      );
      for (const [path, selector, shot] of [
        [
          "/",
          ".home-v4",
          theme === "dark" && width === 1440 ? "home-dark-1440" : "",
        ],
        [
          "/proposals",
          ".proposal-directory",
          theme === "light" && width !== 1440 ? `proposals-${width}` : "",
        ],
        [
          record(f.viewed),
          ".record-v4",
          theme === "light" && width !== 1440 ? `record-${width}` : "",
        ],
        [
          "/clients",
          ".clients-directory-v4",
          theme === "light" && width === 1440 ? "clients-1440" : "",
        ],
        [
          `/clients/${f.ai.client.id}`,
          ".client-detail-v4",
          theme === "light" && width === 1440 ? "client-detail-1440" : "",
        ],
      ]) {
        const billingBefore = f.billingReads();
        await page.goto(path);
        await expect(page.locator(selector)).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (selector === ".clients-directory-v4") {
          await expect(
            page
              .locator('[title="Open the client to see live billing"]')
              .first(),
          ).toBeVisible();
          await expect(
            page.getByText("Not billed through Stripe").first(),
          ).toBeVisible();
          await expectStraightTabIndicator(
            page
              .getByRole("group", { name: "Client views" })
              .getByRole("button", { pressed: true }),
          );
          expect(f.billingReads()).toBe(billingBefore);
        }
        if (selector === ".client-detail-v4") {
          await expect(page.getByText("Current monthly $175/mo")).toBeVisible();
          const contact = await page
            .getByRole("heading", { name: "Contact details" })
            .boundingBox();
          const proposals = await page
            .getByRole("heading", { name: /^Proposals/ })
            .boundingBox();
          const activity = await page
            .getByRole("heading", { name: "Activity", exact: true })
            .boundingBox();
          const billing = await page
            .getByRole("heading", { name: "How they’re billed" })
            .boundingBox();
          expect(proposals!.y).toBeLessThan(activity!.y);
          expect(contact!.y).toBeLessThan(billing!.y);
          if (width === 1440) expect(contact!.x).toBeGreaterThan(proposals!.x);
          else {
            expect(contact!.y).toBeLessThan(proposals!.y);
            expect(billing!.y).toBeLessThan(activity!.y);
          }
        }
        if (selector === ".proposal-directory" && width < 1100) {
          await expect(
            page.getByRole("tablist", { name: "Proposal views" }),
          ).toBeVisible();
          await expect(
            row(page, f.viewed).getByRole("button", { name: "Duplicate" }),
          ).toHaveCSS("height", "44px");
        }
        if (selector === ".record-v4" && width === 375) {
          const hero = (await page
            .locator(".record-v4 .next-card")
            .boundingBox())!;
          const text = (await page
            .locator(".record-v4 .next-copy")
            .boundingBox())!;
          expect(text.width).toBeGreaterThan(hero.width - 60);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${path} should fit ${width}px`,
        ).toBeLessThanOrEqual(width + 1);
        const results = await new AxeBuilder({ page })
          .include(selector)
          .analyze();
        expect(
          results.violations.map((issue) => [
            issue.id,
            issue.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
              html: node.html,
            })),
          ]),
          `${theme} ${path} at ${width}`,
        ).toEqual([]);
        if (shot) await capture(page, shot);
      }
    }
  });
}

test("brand upload buttons have the shared pill padding", async ({ page }) => {
  await scenario(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=brand");
  for (const label of ["Upload logo", "Upload logo icon"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await expect(button).toHaveCSS("padding-left", "16px");
    await expect(button).toHaveCSS("padding-right", "16px");
  }
});

test("Home recent proposals and Proposals share their table and row actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const folder = "docs/screenshots/staff-table-headers/row-actions";
  const screenshots = process.env.CAPTURE_ROW_ACTIONS === "1";
  if (screenshots) await mkdir(folder, { recursive: true });
  await scenario(page);

  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("proposal-theme", value),
      theme,
    );
    let headers: string | undefined;
    let recent: string[] = [];
    let columns: string | undefined;
    for (const [path, name] of [
      ["/proposals", "proposals"],
      ["/", "home"],
    ]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const table = page.locator(".proposal-rows");
      const header = table.locator(".staff-table-head");
      await expect(header).toHaveCSS("text-transform", "uppercase");
      await expect(header).toHaveCSS(
        "background-color",
        theme === "light" ? "rgb(255, 255, 255)" : "rgb(24, 34, 38)",
      );
      const labels = await header.innerText();
      expect(labels).toContain("OWNER");
      expect(labels).not.toContain("NEXT");
      const rows = table.locator(".proposal-row");
      const grid = await header.evaluate(
        (node) => getComputedStyle(node).gridTemplateColumns,
      );
      if (name === "proposals") {
        headers = labels;
        recent = (await rows.allInnerTexts()).slice(0, 6);
        columns = grid;
      } else {
        await expect(rows).toHaveCount(6);
        expect(await rows.allInnerTexts()).toEqual(recent);
        expect(labels).toBe(headers);
        expect(grid).toBe(columns);
        await expect(
          page
            .getByRole("region", { name: "Recent proposals" })
            .getByRole("link", { name: "View all proposals", exact: true }),
        ).toHaveAttribute("href", "/proposals");
      }
      const editable = rows
        .filter({
          has: page.getByRole("button", { name: "Edit", exact: true }),
        })
        .first();
      await editable.scrollIntoViewIfNeeded();
      const icons = editable.locator(".table-icon-action");
      await expect(icons).toHaveCount(4);
      for (const icon of await icons.all()) {
        await expect(icon).toHaveCSS("width", "40px");
        await expect(icon).toHaveCSS("height", "40px");
        await expect(icon).toHaveCSS("border-radius", "50%");
        await expect(icon).toHaveCSS("border-top-width", "0px");
        await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(icon.locator("svg.lucide")).toHaveCount(1);
      }
      const sign = table
        .getByRole("button", { name: "Countersign", exact: true })
        .first();
      await expect(sign).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(sign.locator("svg.lucide-pen-tool")).toBeVisible();
      if (screenshots) {
        await page.evaluate(() => document.fonts.ready);
        if (name === "home")
          await table.evaluate((node) => node.scrollIntoView({ block: "end" }));
        await page.screenshot({
          path: `${folder}/${name}-${theme}-rest.png`,
          animations: "disabled",
        });
      }
      const duplicate = editable.getByRole("button", {
        name: "Duplicate",
        exact: true,
      });
      await duplicate.hover();
      await expect(duplicate).not.toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(duplicate).toHaveCSS("border-top-width", "0px");
      const tooltip = editable.getByRole("tooltip", { name: "Duplicate" });
      await expect(tooltip).toBeVisible();
      if (screenshots)
        await page.screenshot({
          path: `${folder}/${name}-${theme}-hover.png`,
          animations: "disabled",
        });
      await page.mouse.move(5, 5);
      await editable.getByRole("button", { name: "Edit", exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(duplicate).toBeFocused();
      await expect(duplicate).not.toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(tooltip).toBeVisible();
    }
  }
});

test("proposal Edit and Countersign icons keep their slots, styling, and keyboard actions", async ({
  page,
}) => {
  const f = await scenario(page);
  const folder = "docs/screenshots/proposal-row-action-icons";
  const screenshots = process.env.CAPTURE_PROPOSAL_ACTION_ICONS === "1";
  if (screenshots) await mkdir(folder, { recursive: true });
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 850 : 1000 });
    await page.goto("/proposals");
    const counterRow = row(page, f.countersign);
    const counter = counterRow.getByRole("button", {
      name: "Countersign",
      exact: true,
    });
    const edit = row(page, f.viewed).getByRole("button", {
      name: "Edit",
      exact: true,
    });
    const size = width === 1440 ? "40px" : "44px";
    await expect(counter).toBeVisible();
    await expect(counterRow.getByRole("button", { name: "Edit" })).toHaveCount(
      0,
    );
    await expect(counter.locator("svg.lucide-pen-tool")).toBeVisible();
    await expect(edit.locator("svg.lucide-square-pen")).toBeVisible();
    await expect(counter).toHaveText("");
    for (const icon of [counter, edit]) {
      await expect(icon).toHaveCSS("width", size);
      await expect(icon).toHaveCSS("height", size);
      await expect(icon).toHaveCSS("border-radius", "50%");
      await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(icon).toHaveCSS(
        "color",
        await cssColorToken(icon, "--ink-muted"),
      );
    }
    const spacer = row(page, f.completed).locator(".proposal-action-spacer");
    await expect(spacer).toHaveCSS("width", size);
    await expect(spacer).toHaveCSS("height", size);
    expect((await spacer.boundingBox())!.x).toBeCloseTo(
      (await counter.boundingBox())!.x,
    );
    expect((await edit.boundingBox())!.x).toBeCloseTo(
      (await counter.boundingBox())!.x,
    );
    for (const proposal of [f.viewed, f.completed]) {
      const duplicate = (p: Proposal) =>
        row(page, p).getByRole("button", { name: "Duplicate" }).boundingBox();
      expect((await duplicate(proposal))!.x).toBeCloseTo(
        (await duplicate(f.countersign))!.x,
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    if (screenshots && (width === 1440 || width === 375)) {
      await page.evaluate(() => document.fonts.ready);
      await counter.evaluate((button) =>
        button.scrollIntoView({ block: "center" }),
      );
      await page.screenshot({
        path: `${folder}/proposals-${width}-rest.png`,
        animations: "disabled",
      });
    }
    if (width === 1440) {
      await counter.hover();
      const tooltip = counterRow.getByRole("tooltip", {
        name: "Countersign",
        exact: true,
      });
      await expect(tooltip).toBeVisible();
      await expect(counter).toHaveCSS(
        "background-color",
        await cssColorToken(counter, "--segment"),
      );
      await expect(counter).toHaveCSS(
        "color",
        await cssColorToken(counter, "--ink-title"),
      );
      if (screenshots)
        await page.screenshot({
          path: `${folder}/proposals-1440-countersign-hover.png`,
          animations: "disabled",
        });
      await page.mouse.move(2, 2);
      await counterRow.getByRole("link", { name: /^Open / }).focus();
      await page.keyboard.press("Tab");
      await expect(counter).toBeFocused();
      await expect(counter).toHaveCSS("outline-style", "solid");
      await expect(counter).toHaveCSS("outline-width", "2px");
      await expect(tooltip).toBeVisible();
      for (const name of ["Duplicate", "Archive", "More actions"]) {
        await page.keyboard.press("Tab");
        await expect(
          counterRow.getByRole("button", { name, exact: true }),
        ).toBeFocused();
      }
      await edit.press("Enter");
      await expect(page).toHaveURL(`/proposals/${f.viewed.id}?action=edit`);
    }
    if (width === 375) {
      await counter.press("Space");
      await expect(page).toHaveURL(
        `/proposals/${f.countersign.id}?action=countersign`,
      );
      await expect(
        page.getByRole("dialog", { name: /^Countersign/ }),
      ).toBeVisible();
      expect(f.actions).toEqual([]);
    }
  }
});

test("Viewed is a counted primary tab that stays reachable at desktop, tablet and phone widths", async ({
  page,
}) => {
  const f = await scenario(page);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/proposals");
    const tabs = page.getByRole("tablist", { name: "Proposal views" });
    await expect(tabs.getByRole("tab")).toHaveText([
      "All 9",
      "Drafts 1",
      "Sent 2",
      "Viewed 1",
      "Won 4",
      "Needs countersign 1",
    ]);
    const viewed = tabs.getByRole("tab", { name: "Viewed 1", exact: true });
    await tabs
      .getByRole("tab", { name: "Sent 2", exact: true })
      .press("ArrowRight");
    await expect(viewed).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/view=viewed/);
    await expect(row(page, f.viewed)).toBeVisible();
    await expect(row(page, f.waiting)).toHaveCount(0);
    const dimensions = await tabs.evaluate((list) => ({
      page: document.documentElement.scrollWidth,
      wrap: getComputedStyle(list).flexWrap,
      content: list.scrollWidth,
      viewport: list.clientWidth,
    }));
    expect(dimensions.page).toBe(width);
    expect(dimensions.wrap).toBe("nowrap");
    if (width === 375) {
      expect(dimensions.content).toBeGreaterThan(dimensions.viewport);
      await expect(viewed).toHaveCSS("min-height", "44px");
      // Count chips widen the tabs; the selected tab must be fully in view.
      const [list, tab] = [
        (await tabs.boundingBox())!,
        (await viewed.boundingBox())!,
      ];
      expect(tab.x).toBeGreaterThanOrEqual(list.x - 1);
      expect(tab.x + tab.width).toBeLessThanOrEqual(list.x + list.width + 1);
    }
    if (process.env.CAPTURE_VIEWED_TAB === "1" && width !== 768) {
      await viewed.click();
      const directory = "docs/screenshots/editable-starters";
      await mkdir(directory, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${directory}/proposals-viewed-${width}.png`,
      });
    }
    await page.getByRole("button", { name: "More views", exact: true }).click();
    const more = page.getByRole("dialog", { name: "More views" });
    await expect(more.getByRole("button", { name: /^Viewed\b/ })).toHaveCount(
      0,
    );
    await expect(
      more.getByRole("button", { name: /^Not viewed/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await viewed.press("End");
    await expect(
      tabs.getByRole("tab", { name: "Needs countersign 1" }),
    ).toBeFocused();
  }
});
