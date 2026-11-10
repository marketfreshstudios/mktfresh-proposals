import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { starterTemplates } from "../seed/starter-templates";
import type { Proposal, Template } from "../src/lib/model";
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
import { staff } from "../tests/helpers";
import { editorFixture } from "./editor-fixture";

const gallery = "docs/screenshots/harbor";
const pageLight = "rgb(241, 244, 245)";
const canvasLight = "rgb(213, 222, 225)";

async function shot(page: Page, name: string, fullPage = false) {
  if (process.env.CAPTURE_HARBOR !== "1") return;
  await mkdir(gallery, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${gallery}/${name}-1440.png`,
    animations: "disabled",
    fullPage,
  });
}

test("Harbor fills the app and editor canvases without replacing client branding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("proposal-theme"))
      localStorage.setItem("proposal-theme", "light");
  });
  const f = await editorFixture(page);
  f.settings.accent_colour = "#285847";
  await f.repo.put("workspace_settings", f.settings);
  const [template] = await f.repo.entities<Template>("templates");
  for (const t of starterTemplates(f.repo.workspaceId))
    await f.repo.put("templates", t);

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: staff,
        settings: f.settings,
        staff: f.members,
        app_url: "http://127.0.0.1:3100",
        account: {
          first_name: "Alex",
          last_name: "Morgan",
          job_title: "Owner",
          phone: "(305) 555-0142",
          timezone: "America/New_York",
          date_format: "medium",
          notifications: {},
          own_proposals_only: false,
          photo_url: null,
          theme: null,
        },
      },
    }),
  );

  const now = new Date();
  const sample = (
    title: string,
    status: Proposal["status"],
    day: number,
  ): Proposal => ({
    ...f.active(),
    id: crypto.randomUUID(),
    title,
    status,
    sent_at: now.toISOString(),
    first_viewed_at: status === "viewed" ? now.toISOString() : null,
    client_signed_at: status === "signed_by_client" ? now.toISOString() : null,
    valid_until: new Date(now.getTime() + day * 86_400_000).toISOString(),
    updated_at: now.toISOString(),
  });
  const items = [
    f.active(),
    sample("Brand and website refresh", "viewed", 3),
    sample("Quarterly care and hosting", "sent", 6),
    sample("Website and search audit", "signed_by_client", 12),
  ];
  await page.route(/\/api\/proposals(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { items, total: items.length } }),
  );
  await page.route("**/api/reports?*", (route) => {
    const filters = reportFiltersSchema.parse(
      Object.fromEntries(new URL(route.request().url()).searchParams),
    );
    const range = reportDateRange(filters, sampleZone, sampleNow);
    const rows = reportRows(
      reportCandidateRows(sampleProposals, filters, range),
      range,
      sampleNow,
      sampleFacts,
    );
    return route.fulfill({
      json: buildReport(
        rows,
        range,
        reportDimensions(sampleProposals, sampleNames),
      ),
    });
  });

  const shell = page.locator(".staff-foundation.ink-clay");
  await page.goto("/");
  const hero = page.locator(".home-pipeline");
  await expect(hero).toHaveCSS("background-color", "rgb(19, 48, 58)");
  await expect(shell).toHaveCSS("background-color", pageLight);
  await expect(
    page.getByRole("button", { name: "New proposal", exact: true }).first(),
  ).toHaveCSS("background-color", "rgb(180, 83, 42)");
  await shot(page, "home", true);

  await page.goto("/proposals");
  const row = page
    .locator(".proposal-row")
    .filter({ hasText: "Brand and website refresh" });
  await expect(row).toBeVisible();
  await expect(shell).toHaveCSS("background-color", pageLight);
  await row.hover({ position: { x: 70, y: 15 } });
  await expect(row).toHaveCSS("background-color", "rgb(244, 247, 247)");
  await shot(page, "proposals");

  await page.goto("/reports?range=last-90");
  await expect(
    page.getByRole("heading", { name: "Value signed", exact: true }),
  ).toBeVisible();
  await expect(shell).toHaveCSS("background-color", pageLight);
  await shot(page, "reports", true);

  await page.goto("/studio/templates");
  const preview = page.locator(".template-thumbnail").first();
  await expect(preview).toHaveCSS("background-color", "rgb(244, 247, 247)");
  await expect(preview.locator(".template-thumbnail-paper")).toHaveCSS(
    "box-shadow",
    /rgb\(220, 227, 230\) 0px 0px 0px 1px/,
  );
  await shot(page, "templates-blocks");

  await page.goto(`/studio/templates/${template.id}`);
  await expect(page.locator(".studio-template-main")).toHaveCSS(
    "background-color",
    canvasLight,
  );
  await expect(
    page.locator(".studio-template-main .page-sheet").first(),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await shot(page, "template-editor");

  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-document-region")).toHaveCSS(
    "background-color",
    canvasLight,
  );
  await expect(
    page.locator(".editor-document-region .page-sheet").first(),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await shot(page, "proposal-editor");

  await f.editRemote({
    content: [
      ...f.content,
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
  });
  const sent = await f.sendRemote();
  await page.goto(`/p/${sent.token}`);
  const client = page.locator(".client-flow");
  await expect(client).toHaveCSS("background-color", pageLight);
  await expect(
    page.getByRole("button", { name: "Review and sign", exact: true }).first(),
  ).toHaveCSS("background-color", "rgb(40, 88, 71)");
  await expect(page.locator(".client-document-sheets")).toHaveAttribute(
    "data-layout-ready",
    "true",
  );
  await shot(page, "client");

  await page.goto("/account");
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "Alex",
  );
  await expect(shell).toHaveCSS("background-color", pageLight);
  await shot(page, "account");

  await page.evaluate(() => localStorage.setItem("proposal-theme", "dark"));
  await page.goto("/");
  await expect(shell).toHaveCSS("background-color", "rgb(17, 24, 27)");
  await expect(hero).toHaveCSS("background-color", "rgb(31, 63, 75)");
  await shot(page, "home-dark", true);

  await page.evaluate(() => localStorage.setItem("proposal-theme", "light"));
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".account-screen")).toHaveCSS(
    "background-color",
    pageLight,
  );
  await shot(page, "sign-in");
});
