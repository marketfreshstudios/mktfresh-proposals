import { expectStraightTabIndicator } from "./tab-indicator";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import {
  reportDateRange,
  reportDrillSchema,
  reportFiltersSchema,
} from "../src/lib/report-filters";
import {
  buildReport,
  reportCandidateRows,
  reportDimensions,
  reportMatches,
  reportRows,
} from "../src/lib/report-metrics";
import { reportCsv, reportExportSort } from "../src/lib/report-server";
import {
  otherOwner,
  otherTemplate,
  sampleClient,
  sampleFacts,
  sampleNames,
  sampleNow,
  sampleProposals,
  sampleZone,
} from "../tests/report-fixture";
import { editorFixture } from "./editor-fixture";

const evidence = "docs/screenshots/ink-and-clay";
async function capture(page: Page, name: string, fullPage = false) {
  if (process.env.CAPTURE_REPORTS !== "1") return;
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/${name}.png`,
    fullPage,
    animations: "disabled",
  });
}
async function useSample(page: Page, empty = false) {
  const { draft } = await editorFixture(page);
  const rows = empty ? [] : sampleProposals;
  const make = (url: URL) => {
    const f = reportFiltersSchema.parse(Object.fromEntries(url.searchParams));
    const range = reportDateRange(f, sampleZone, sampleNow);
    const reports = reportRows(
      reportCandidateRows(rows, f, range),
      range,
      sampleNow,
      sampleFacts,
    );
    return {
      reports,
      result: buildReport(reports, range, reportDimensions(rows, sampleNames)),
    };
  };
  await page.route("**/api/reports?*", (route) =>
    route.fulfill({ json: make(new URL(route.request().url())).result }),
  );
  await page.route("**/api/reports/export?*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      contentType: "text/csv",
      headers: {
        "content-disposition": 'attachment; filename="yeswell-reports.csv"',
      },
      body: reportCsv(
        make(url).result,
        reportExportSort(url.searchParams, "template"),
        reportExportSort(url.searchParams, "owner"),
      ),
    });
  });
  await page.route(/\/api\/proposals\?.*report=/, (route) => {
    const url = new URL(route.request().url());
    const drill = reportDrillSchema.parse(Object.fromEntries(url.searchParams));
    const matches = make(url).reports.filter((row) =>
      reportMatches(row, drill),
    );
    return route.fulfill({
      json: {
        total: matches.length,
        items: matches.map(({ proposal }) => ({
          ...draft,
          id: proposal.id,
          title: "Sample proposal",
          status: proposal.status,
          client: { ...draft.client, company: proposal.client_name },
        })),
      },
    });
  });
}

test("Reports uses scoped data, accessible trend and sortable breakdowns with matching drill-downs and CSV", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await useSample(page);
  const seen: string[] = [];
  page.on("request", (r) => seen.push(new URL(r.url()).pathname));
  await page.goto("/reports?range=last-90");
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Proposals sent 13 / }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /^Proposals sent 11 / }),
  ).toBeVisible();
  expect(seen).not.toContain("/api/proposals");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Reports" }),
  ).toHaveAttribute("aria-current", "page");
  await expectStraightTabIndicator(
    page
      .getByRole("tablist", { name: "Trend display" })
      .locator('[aria-selected="true"]'),
  );
  await expect(page.getByRole("figure")).toHaveAccessibleName(
    /11 sent and 4 client signatures across 4 months/,
  );
  await page.getByRole("button", { name: "About win rate" }).hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Signed ÷ (signed + declined + expired)",
  );
  await expect(page.getByRole("tooltip")).toContainText(
    "Proposals still open aren’t counted.",
  );
  await expect(page.getByRole("tooltip")).toContainText(/4 ÷ \(4 \+ 2 \+ 1\)/);
  await page.getByRole("heading", { name: "Reports", exact: true }).hover();
  await expect(page.locator(".report-value-tile")).toHaveCount(5);
  await expect(
    page.locator(".report-value-tile .t-hero-number").first(),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(
    page.locator(".report-currency-group").filter({ hasText: "CAD" }),
  ).not.toContainText("Yearly");
  await expect(
    page.locator(".report-currency-group").filter({ hasText: "USD" }),
  ).toContainText("Yearly");
  await expect(
    page.getByText("Average time per proposal where the section was read"),
  ).toBeVisible();
  await expect(page.locator(".report-sections li").first()).toContainText(
    "2 proposals",
  );
  await expect(page.getByText(/Median time to first reply 2 hr/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "See 1 open question", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".report-breakdowns")
      .getByText("CA$950", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.locator(".report-breakdowns").getByText(/CAD CA\$/),
  ).toHaveCount(0);
  await expect(page.locator(".report-bar.sent > span").first()).toHaveCSS(
    "background-image",
    /repeating-linear-gradient/,
  );
  await expect(page.locator(".report-bar.signed > span").first()).toHaveCSS(
    "background-image",
    "none",
  );
  await capture(page, "reports-1440", true);
  expect(
    (await new AxeBuilder({ page }).include(".reports").analyze()).violations,
  ).toEqual([]);
  await page.getByRole("tab", { name: "View as table" }).click();
  await expect(
    page.getByRole("table", { name: /Monthly proposals sent and signed/ }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".reports").analyze()).violations,
  ).toEqual([]);
  const template = page.getByRole("region", {
    name: "By template",
    exact: true,
  });
  await template.getByRole("button", { name: "Template", exact: true }).click();
  await expect(
    template.getByRole("columnheader", { name: "Template" }),
  ).toHaveAttribute("aria-sort", "ascending");
  await expect(template.getByRole("row").nth(1)).toContainText(
    "Monthly strategy",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("yeswell-reports.csv");
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await page.getByLabel("Start date").fill("2026-11-01");
  await page.getByLabel("End date").fill("2026-11-08");
  await dialog.getByLabel("Owner").selectOption(otherOwner);
  await dialog
    .getByLabel("Template", { exact: true })
    .selectOption(otherTemplate);
  await dialog.getByLabel("Client", { exact: true }).selectOption(sampleClient);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("link", { name: /^Signed 1 / }).click();
  await expect(
    page.getByRole("heading", { name: "Signed proposals" }),
  ).toBeVisible();
  await expect(page.getByText("1 matching proposal")).toBeVisible();
  await expect(page.locator(".proposal-row")).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("owner")).toBe(otherOwner);
  expect(new URL(page.url()).searchParams.get("template")).toBe(otherTemplate);
  expect(new URL(page.url()).searchParams.get("client")).toBe(sampleClient);
  const denied = await request.get("/api/reports", {
    headers: { cookie: "no-session=1" },
  });
  expect(denied.status()).toBe(401);
});

test("Reports phone layout and new-workspace empty state", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 960 });
  await useSample(page);
  await page.goto("/reports?range=last-90");
  await expect(
    page.getByRole("link", { name: /^Proposals sent 11 / }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  for (const control of await page
    .locator(".report-filterbar .btn:visible")
    .all())
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    (await new AxeBuilder({ page }).include(".reports").analyze()).violations,
  ).toEqual([]);
  await capture(page, "reports-375");
  await page.getByRole("button", { name: "About win rate" }).click();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const box = (await tooltip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await page.goto("/reports?range=custom&from=2026-07-01&to=2026-07-31");
  await expect(
    page.getByText("No proposals were sent in this date range.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute("**/api/reports?*");
  await useSample(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", {
      name: "Reports fill in once you send proposals.",
    }),
  ).toBeVisible();
  await capture(page, "reports-empty-1440");
});

test("Reports uses a tablet filter sheet, self-hosted fonts and accessible dark colors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 950 });
  await useSample(page);
  const fonts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "font") fonts.push(r.url());
  });
  await page.goto("/reports?range=last-90");
  await expect(page.locator(".shell-tablet-header")).toHaveCSS(
    "height",
    "64px",
  );
  await expect(page.getByRole("heading", { name: "Reports" })).toHaveCSS(
    "font-family",
    /DM Serif Display/,
  );
  await expect(page.locator(".report-metric .t-number").first()).toHaveCSS(
    "font-family",
    /Instrument Sans/,
  );
  await expect(page.locator(".report-metric .t-number").first()).toHaveCSS(
    "font-variant-numeric",
    "tabular-nums",
  );
  await page.evaluate(() => document.fonts.ready);
  expect(
    fonts.some((url) => url.endsWith("/DMSerifDisplay-Regular.woff2")),
  ).toBe(true);
  expect(
    fonts.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
  await capture(page, "reports-1024");
  expect(
    (await new AxeBuilder({ page }).include(".reports").analyze()).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  for (const name of ["Owner", "Template", "Client"])
    await expect(
      sheet.getByRole("combobox", { name, exact: true }),
    ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer.getByRole("link", { name: "Reports" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1040 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(12, 30, 37)",
  );
  expect(
    (await new AxeBuilder({ page }).include(".reports,.sidebar").analyze())
      .violations,
  ).toEqual([]);
  await capture(page, "reports-dark-1440", true);
});

test("Reports skeletons, errors and staff shell retain their states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await useSample(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  let fail = false;
  await page.route("**/api/reports?*", async (route) => {
    await hold;
    if (fail) await route.fulfill({ status: 500, json: {} });
    else await route.fallback();
  });
  await page.goto("/reports?range=last-90");
  await expect(
    page.getByRole("status", { name: "Loading reports" }),
  ).toBeVisible();
  release();
  const sent = page.getByRole("link", { name: /^Proposals sent 11 / });
  await expect(sent).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "This month", exact: true }).click();
  await expect(page.locator(".reports").getByRole("alert")).toContainText(
    "Couldn't load reports. Try again",
  );
  await expect(sent).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("link", { name: /^Proposals sent 6 / }),
  ).toBeVisible();
  await expect(page.locator(".reports").getByRole("alert")).toHaveCount(0);
});

test("Ink shell keeps its five phone slots and the Studio sub-navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await editorFixture(page);
  for (const [path, shot] of [
    ["/", "home"],
    ["/proposals", "proposals"],
    ["/studio/workspace", "studio-workspace"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(".sidebar")).toHaveCSS("width", "236px");
    await expect(page.locator(".sidebar .brand img")).toHaveAttribute(
      "src",
      /yeswell-logo-reversed/,
    );
    const nav = page
      .locator(".sidebar")
      .getByRole("navigation", { name: "Studio navigation" });
    await expect(nav).toHaveCount(shot === "studio-workspace" ? 1 : 0);
    if (shot === "studio-workspace") {
      const active = nav.getByRole("link", { name: "Workspace" });
      await expect(active).toHaveAttribute("aria-current", "page");
      expect(
        await active.evaluate((el) => getComputedStyle(el, "::before").width),
      ).toBe("3px");
    } else {
      const action = page
        .locator(shot === "home" ? ".home-intro" : ".page-header")
        .getByRole("button", { name: "New proposal" });
      await expect(action).toHaveCSS("background-color", "rgb(180, 83, 42)");
      await expect(action).toHaveCSS("border-radius", /999px/);
      await expect(action.locator("svg")).toHaveCount(0);
    }
    await capture(page, shot + "-1440");
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await useSample(page);
  await page.goto("/reports?range=last-90");
  const nav = page.getByRole("navigation", { name: "Phone navigation" });
  await expect(nav.getByRole("link")).toHaveText([
    "Home",
    "Proposals",
    "Clients",
    "Studio",
  ]);
  await expect(nav.getByRole("button", { name: "New proposal" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Proposals" })).toHaveAttribute(
    "aria-current",
    "location",
  );
});
