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
import { setup } from "../tests/helpers";

const evidence = "docs/screenshots/reports";
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
  const { draft } = await setup();
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
    page.getByRole("link", { name: "13 proposals sent", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "11 proposals sent", exact: true }),
  ).toBeVisible();
  expect(seen).not.toContain("/api/proposals");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Reports" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("figure")).toHaveAccessibleName(
    /11 sent and 4 client signatures across 4 months/,
  );
  await page
    .getByRole("link", { name: /win rate/ })
    .first()
    .hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "signed ÷ (signed + declined + expired)",
  );
  await page.getByRole("heading", { name: "Reports", exact: true }).hover();
  await capture(page, "reports-1440", true);
  expect(
    (await new AxeBuilder({ page }).include(".reports").analyze()).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Show data table" }).click();
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
  await page.getByLabel("Date range").selectOption("custom");
  await page.getByLabel("Start date").fill("2026-11-01");
  await page.getByLabel("End date").fill("2026-11-08");
  await page.getByLabel("Owner (sender)").selectOption(otherOwner);
  await page
    .getByLabel("Template", { exact: true })
    .selectOption(otherTemplate);
  await page.getByLabel("Client", { exact: true }).selectOption(sampleClient);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page
    .getByRole("link", { name: "1 signed proposal", exact: true })
    .click();
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
    page.getByRole("link", { name: "11 proposals sent", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  for (const control of await page
    .locator(".report-filter select, .report-filter .btn")
    .all())
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    (await new AxeBuilder({ page }).include(".reports").analyze()).violations,
  ).toEqual([]);
  await capture(page, "reports-375");
  await page.goto("/reports?range=custom&from=2026-07-01&to=2026-07-31");
  await expect(
    page.getByText("No proposals were sent in this date range", {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute("**/api/reports?*");
  await useSample(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "No proposal activity yet" }),
  ).toBeVisible();
  await capture(page, "reports-empty-1440");
});
