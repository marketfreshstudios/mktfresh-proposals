import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { starterTemplates } from "../seed/starter-templates";
import { authoringPreview } from "../src/lib/authoring-preview";
import type { Item, Template } from "../src/lib/model";
import type { PagePlan } from "../src/lib/page-plan";
import { pdfPreview, type PdfPreview } from "../src/lib/pdf-preview";
import { previewResult } from "../src/lib/preview";
import { templateAuthoringView } from "../src/lib/starter-template-state";
import { TemplateBandsSchema } from "../src/lib/page-bands";
import { PDFDocument } from "pdf-lib";
import { starterLogo } from "../tests/starter-logo";
import { editorFixture } from "./editor-fixture";

const evidence = "docs/screenshots/template-pagination-repair";

async function fixture(page: Page) {
  const f = await editorFixture(page);
  const logo = await starterLogo();
  f.settings.logo = `${f.repo.workspaceId}/logo.png`;
  f.settings.proposal_fonts = { body: "dm-sans", heading: "montserrat" };
  f.settings.proposal_styles = { density: "standard", quote_layout: "cards" };
  f.settings.business_state = { name: "North Carolina", other: "" };
  await f.repo.put("workspace_settings", f.settings);
  await page.route("**/api/workspace-logo**", (route) =>
    route.fulfill({ body: logo, contentType: "image/png" }),
  );
  const t = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog: await f.repo.entities<Item>("pricing_items"),
  }).find((t) => t.starter_key === "website-design-build")!;
  const header = t.header_footer!;
  const first = header.shared.header.slots[0].content[0].content!;
  first[0].attrs!.src = "workspace-logo";
  first[1].text = "{{workspace.name}}";
  header.headerSpacing = {
    ...header.headerSpacing!,
    heightIn: 0.4,
    spaceToContent: 31,
  };
  const explicit = t.content.flatMap((b, i) =>
    b.type === "page_break"
      ? [
          {
            marker: b.id!,
            block: t.content[i + 1].id!,
            offset: 0,
            explicit: true,
          },
        ]
      : [],
  );
  const stale: PagePlan = {
    format: 1,
    pages: 7,
    starts: [
      ...explicit.slice(0, 4),
      {
        block: t.content.find((b) => b.type === "contract")!.id!,
        offset: 0,
        part: "terms-8",
        explicit: false,
      },
      explicit.at(-1)!,
    ].map((start, i) => ({ ...start, page: i + 2 })),
  };
  t.pagination = stale;
  await f.repo.put("templates", t);
  await page.route("**/api/templates", async (route) => {
    if (route.request().method() === "GET") {
      const templates = await f.repo.entities<Template>("templates");
      return route.fulfill({ json: templates.map(templateAuthoringView) });
    }
    await route.fallback();
  });
  await page.route("**/api/proposals/*/preview-logo", (route) =>
    route.fulfill({ body: logo, contentType: "image/png" }),
  );
  await page.setViewportSize({ width: 1440, height: 1200 });
  return { ...f, t, stale, logo };
}

async function settledEditor(page: Page) {
  const root = page.locator(".template-paged-paper");
  await expect(root.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const plan = JSON.parse(
    (await root.getAttribute("data-pagination"))!,
  ) as PagePlan;
  const layout = await root.evaluate((root) => {
    const bounds = [...root.querySelectorAll(".page-sheet")].map((sheet) => {
      const top = sheet.getBoundingClientRect().top;
      const style = getComputedStyle(sheet);
      return {
        start: top + parseFloat(style.paddingTop),
        end:
          sheet.getBoundingClientRect().bottom -
          parseFloat(style.paddingBottom),
      };
    });
    const lines = [
      ...root.querySelectorAll(".studio-clause-frame :is(.tiptap, h3)"),
    ].flatMap((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const rows: { text: string; page: number }[] = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (rect.height > 0)
            rows.push({
              text: node.textContent!.slice(0, 50),
              page:
                bounds.findIndex(
                  ({ start, end }) =>
                    rect.top >= start - 1 && rect.bottom <= end + 1,
                ) + 1,
            });
      }
      return rows;
    });
    return { lines, pageCount: bounds.length };
  });
  return { plan, ...layout };
}

function assertEditorTerms(
  editor: Awaited<ReturnType<typeof settledEditor>>,
  expectedStart?: number,
) {
  expect(editor.lines.filter((line) => !line.page)).toEqual([]);
  const first = editor.lines.find((line) => line.text === "1. Scope of work")!;
  const last = editor.lines.find(
    (line) => line.text === "10. Entire agreement",
  )!;
  if (expectedStart !== undefined) expect(first.page).toBe(expectedStart);
  expect(last.page).toBeGreaterThan(first.page);
  for (let n = first.page; n <= last.page; n++)
    expect(
      editor.lines.some((line) => line.page === n),
      `Terms page ${n} has content`,
    ).toBe(true);
}

test("Website starter reflows with a tall header and a stale stored break plan", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto(`/studio/templates/${f.t.id}`);
  const tall = await settledEditor(page);
  expect(tall.plan).not.toEqual(f.stale);
  assertEditorTerms(tall, 5);
  const page5 = page.locator('.page-sheet[data-editor-page="5"]');
  const header = page5.locator('[data-page-band="header"]');
  await expect(header.locator("img")).toHaveCount(1);
  await expect(header.locator('[data-field="workspace.name"]')).toHaveCount(0);
  const tallHeight = Number(await page5.getAttribute("data-content-height"));
  const fromRead = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.t.id,
  )!;
  expect(fromRead.pagination).toEqual(f.stale); // read/measurement never saves

  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page
    .getByRole("group", { name: "Header height", exact: true })
    .getByRole("button", { name: /X-Large/ })
    .click();
  await expect
    .poll(async () => Number(await page5.getAttribute("data-content-height")))
    .toBeLessThan(tallHeight);
  assertEditorTerms(await settledEditor(page));
  await expect
    .poll(async () => {
      const saved = (await f.repo.entities<Template>("templates")).find(
        (t) => t.id === f.t.id,
      );
      return [saved?.header_footer?.headerSpacing?.heightIn, saved?.pagination];
    })
    .toEqual([0.8, undefined]);

  // Reopen with the guarded rollout's settings, retaining a stale cache in the
  // fixture to prove correctness doesn't depend on the migration having run.
  await f.repo.put("templates", {
    ...f.t,
    header_footer: {
      ...TemplateBandsSchema.parse(f.t.header_footer),
      headerSpacing: {
        ...f.t.header_footer!.headerSpacing!,
        heightIn: 0.25 as const,
        spaceToContent: 8,
      },
    },
  });
  await page.goto(`/studio/templates/${f.t.id}`);
  const repaired = await settledEditor(page);
  assertEditorTerms(repaired, 5);

  // Exercise Studio's actual Preview request. The client-facing document omits
  // the unselected long clause and cannot inherit its continuation breaks.
  await page.route("**/api/document-preview", async (route) => {
    const input = route.request().postDataJSON();
    const p = authoringPreview(input, f.settings, f.repo.workspaceId);
    const pdf = await pdfPreview(
      f.repo,
      { get: async () => f.logo, put: async () => {} },
      p,
      f.settings,
    );
    await route.fulfill({ json: pdf });
  });
  const capture = process.env.CAPTURE_TEMPLATE_PAGE_REPAIR === "after";
  if (capture) {
    mkdirSync(evidence, { recursive: true });
    for (let n = 4; n <= repaired.pageCount; n++) {
      await page
        .locator(`.page-sheet[data-editor-page="${n}"]`)
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${evidence}/after-editor-${n}-1440.png`,
        animations: "disabled",
      });
    }
  }
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/document-preview") && r.ok(),
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const result = await response;
  const input = result.request().postDataJSON();
  expect(input.pagination).toEqual(repaired.plan);
  expect(input.pagination).not.toEqual(f.stale);
  const specimen = authoringPreview(input, f.settings, f.repo.workspaceId);
  expect(specimen.pagination).toBeUndefined();
  const pdf: PdfPreview = await result.json();
  expect(pdf.layout.overflow_pages ?? []).toEqual([]);
  expect(
    (
      await PDFDocument.load(Buffer.from(pdf.pdf_base64, "base64"))
    ).getPageCount(),
  ).toBe(pdf.layout.pages);
  const printSheets = pdf.layout.sheets!;
  expect(printSheets.every((s) => s.fragments.length > 0)).toBe(true);
  expect(printSheets.map((s) => s.html).join("")).toContain(
    "10. Entire agreement",
  );
  expect(printSheets.map((s) => s.html).join("")).not.toContain(
    "4.4 Own It Over Time",
  );
  const leaked = printSheets.slice(1).flatMap((sheet, index) => {
    const area = pdf.layout.geometry![index + 1].content;
    return sheet.fragments.filter(
      (f) => (f.box_bottom ?? f.y + f.height) > area.y + area.height + 1,
    );
  });
  expect(leaked).toEqual([]);

  if (capture) {
    const pdfPath = test.info().outputPath("website-starter.pdf");
    writeFileSync(pdfPath, Buffer.from(pdf.pdf_base64, "base64"));
    try {
      execFileSync("pdftoppm", [
        "-f",
        "4",
        "-l",
        "7",
        "-scale-to-x",
        "1440",
        "-scale-to-y",
        "-1",
        "-png",
        pdfPath,
        `${evidence}/after-pdf-1440`,
      ]);
    } finally {
      rmSync(pdfPath);
    }
  }
  await page.route("**/api/proposals/*/preview", (route) =>
    route.fulfill({ json: previewResult(specimen, f.settings) }),
  );
  await page.goto(`/p/${f.t.id}?preview=1`);
  const client = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await expect(client.locator(".client-page-frame")).toHaveCount(
    pdf.layout.pages,
  );
  await expect(
    client.getByText("10. Entire agreement", { exact: true }),
  ).toBeVisible();
  await expect(
    client.getByText("4.4 Own It Over Time", { exact: true }),
  ).toHaveCount(0);
  const clientSheets = await client
    .locator(".client-sheet-content")
    .evaluateAll((sheets) =>
      sheets.map((sheet) => {
        const bounds = sheet.getBoundingClientRect();
        const fragments = [
          ...sheet.querySelectorAll<HTMLElement>("[data-source-block]"),
        ];
        return {
          parts: fragments
            .map((atom) => atom.dataset.sourcePart)
            .filter(Boolean),
          hasContent: !!sheet.textContent?.trim(),
          overflow: fragments
            .filter((atom) => {
              const box = atom.getBoundingClientRect();
              return box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1;
            })
            .map((atom) => atom.dataset.sourcePart ?? atom.dataset.sourceBlock),
        };
      }),
    );
  expect(clientSheets.map((sheet) => sheet.hasContent)).toEqual(
    printSheets.map(() => true),
  );
  // The cover can bleed past the body frame. The clause fragments cannot.
  expect(clientSheets.slice(1).flatMap((sheet) => sheet.overflow)).toEqual([]);
  expect(clientSheets.map((sheet) => sheet.parts)).toEqual(
    printSheets.map((sheet) =>
      sheet.fragments.flatMap((f) => (f.part ? [f.part] : [])),
    ),
  );
});
