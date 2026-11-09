import { expect, test, type Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";
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
import {
  sampleFacts,
  sampleNames,
  sampleNow,
  sampleProposals,
  sampleZone,
} from "../tests/report-fixture";
import { editorFixture } from "./editor-fixture";

const evidence = "docs/screenshots/staff-table-headers";

for (const [theme, surface] of [
  ["light", "rgb(255, 255, 255)"],
  ["dark", "rgb(24, 34, 38)"],
]) {
  test(`staff table headers use the shared table surface in ${theme} mode`, async ({
    page,
  }) => {
    const capture = process.env.CAPTURE_STAFF_TABLES === "1";
    if (capture) await mkdir(evidence, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.addInitScript(
      (mode) => localStorage.setItem("proposal-theme", mode),
      theme,
    );
    const f = await editorFixture(page);
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

    async function check(header: Locator, name: string) {
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(header).toBeVisible();
      await expect(header).toHaveCSS("background-color", surface);
      const divider = await header.evaluate((el) => {
        const style = getComputedStyle(el);
        const sibling = el.nextElementSibling;
        return Math.max(
          parseFloat(style.borderBottomWidth),
          sibling ? parseFloat(getComputedStyle(sibling).borderTopWidth) : 0,
          style.boxShadow.includes("inset") ? 1 : 0,
        );
      });
      expect(divider).toBe(1);
      if (capture) {
        await page.evaluate(() => document.fonts.ready);
        await header.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${evidence}/${name}-${theme}-after.png`,
          animations: "disabled",
        });
      }
    }

    for (const [route, selector, name] of [
      ["/proposals", ".proposal-row-head", "proposals"],
      ["/", ".proposal-row-head", "home-recent"],
      ["/clients", ".client-table-head", "clients"],
      ["/studio/products", ".studio-table-head", "products"],
      ["/studio/templates?view=blocks", ".studio-table-head", "saved-blocks"],
      [
        `/proposals/${f.draft.id}?view=evidence`,
        ".table-wrap thead th",
        "evidence",
      ],
    ]) {
      await page.goto(route);
      await check(page.locator(selector).first(), name);
    }

    await page.goto("/reports?range=last-90");
    await page.getByRole("tab", { name: "View as table" }).click();
    for (const [table, name] of [
      [
        page.getByRole("table", { name: /Monthly proposals sent and signed/ }),
        "reports-monthly",
      ],
      [
        page.getByRole("region", { name: "By template", exact: true }),
        "reports-templates",
      ],
      [
        page.getByRole("region", { name: "By owner", exact: true }),
        "reports-owners",
      ],
    ] as const)
      await check(table.getByRole("columnheader").first(), name);
  });
}
