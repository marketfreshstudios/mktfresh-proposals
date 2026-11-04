import { signature, clientActor } from "../tests/helpers";
import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import {
  defaultHeaderFooter,
  pageContentHeight,
  bandImages,
} from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
import type { Block } from "../src/lib/model";
const content: Block[] = Array.from({ length: 3 }, (_, n) => [
  ...(n ? [{ id: `break-${n}`, type: "page_break" as const }] : []),
  { id: `heading-${n}`, type: "heading" as const, text: `Page ${n + 1}` },
  {
    id: `text-${n}`,
    type: "paragraph" as const,
    text: "A clear proposal with the same page geometry in editing and print.",
  },
]).flat();
test("canonical editor and PDF content areas match every edge distance and switch state", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1920, height: 1200 });
  for (const distanceIn of [0.25, 0.3, 0.4] as const)
    for (const showHeader of [false, true])
      for (const showFooter of [false, true]) {
        const hf = {
          ...defaultHeaderFooter(),
          distanceIn,
          showHeader,
          showFooter,
        };
        bandImages(hf.shared.header)[0].node.attrs = {
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
          alt: "Tall logo",
          height: 500,
        };
        await f.editRemote({ header_footer: hf });
        await page.goto(`/proposals/${f.draft.id}`);
        await page
          .locator(".editor-page-sheets[data-layout-settled=true]")
          .waitFor();
        const areas = await page
          .locator(".editor-paper .page-sheet")
          .evaluateAll((els) =>
            els.map((el) => {
              const s = getComputedStyle(el);
              return {
                height:
                  el.getBoundingClientRect().height -
                  parseFloat(s.paddingTop) -
                  parseFloat(s.paddingBottom),
                canonical: Number(el.getAttribute("data-content-height")),
              };
            }),
          );
        expect(areas).toHaveLength(3);
        const before = f.renders.length;
        await page
          .getByRole("button", { name: "Preview PDF", exact: true })
          .click();
        await expect.poll(() => f.renders.length).toBe(before + 1);
        const rendered = f.renders.at(-1)!;
        expect(rendered.layout.pages).toBe(3);
        for (let n = 0; n < 3; n++) {
          const expected = pageContentHeight(
            resolveStyles(f.settings),
            hf,
            n + 1,
          );
          expect(expected).toBe(912);
          expect(areas[n].canonical).toBe(expected);
          expect(Math.abs(areas[n].height - expected)).toBeLessThanOrEqual(1);
          expect(
            Math.abs(
              rendered.layout.sheets![n].content_area!.height - expected,
            ),
          ).toBeLessThanOrEqual(1);
        }
      }
});

test("shared rest bands resolve page fields after pagination; cover and certificate are band-free", async ({
  page,
}) => {
  const pages: Block[] = Array.from({ length: 9 }, (_, n) => [
    ...(n ? [{ id: `separator-${n}`, type: "page_break" as const }] : []),
    { id: `section-${n}`, type: "heading" as const, text: `Section ${n + 1}` },
    {
      id: `paragraph-${n}`,
      type: "paragraph" as const,
      text: "Thoughtful work with clear outcomes.",
    },
  ]).flat();
  const f = await editorFixture(page, false, { content: pages });
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  expect(await page.locator(".page-sheet").count()).toBe(9);
  await expect(
    page.locator(".page-sheet").first().locator(".page-band"),
  ).toHaveCount(0);
  const third = page.locator(".page-sheet").nth(2);
  await expect(third.locator("[data-page-band=footer]")).toContainText(
    "Page 3 of 9",
  );
  await expect(third.locator('[data-field="page.number"]')).toHaveText("3");
  await expect(third.locator(".page-band p").first()).toHaveCSS(
    "font-size",
    "12px",
  );
  await expect(third.locator(".page-band p").first()).toHaveCSS(
    "line-height",
    "16px",
  );
  await expect(third.locator(".page-band p").first()).toHaveCSS(
    "margin-top",
    "0px",
  );
  const { previewProposal } = await import("../src/lib/preview");
  const { sealedPdf } = await import("../src/lib/pdf");
  const p = previewProposal(f.active(), f.settings),
    v = p.versions[0];
  v.pagination = JSON.parse(
    (await page.locator(".editor-paper").getAttribute("data-pagination"))!,
  );
  const { versionHash } = await import("../src/lib/content");
  v.content_hash = versionHash(v);
  expect(v.variables_resolved).not.toHaveProperty("page.number");
  expect(v.variables_resolved).not.toHaveProperty("page.count");
  const signed = {
    ...signature(0),
    ...clientActor,
    role: "client" as const,
    signed_at: p.created_at,
    consent_at: p.created_at,
    consent_text: "Fixture consent",
  };
  const rendered = await sealedPdf(v, [signed], [], p.currency, {
    settings: f.settings,
    document: { id: p.id, title: p.title },
  });
  const { writeFile } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const path = test.info().outputPath("bands-sealed.pdf");
  await writeFile(path, rendered.pdf);
  const text = execFileSync("pdftotext", ["-layout", path, "-"], {
    encoding: "utf8",
  })
    .split("\f")
    .filter((s) => s.trim());
  expect(text).toHaveLength(10);
  expect(text[2]).toMatch(/Page\s+3\s+of\s+9/);
  expect(rendered.layout.sheets![0].html).not.toContain(
    'data-page-band="footer"',
  );
  expect(text[0]).not.toMatch(/Page\s+1\s+of\s+9/);
  expect(text[9]).toContain("Certificate of completion");
  expect(text[9]).not.toContain("Prepared for");
  expect(text[9]).not.toMatch(/Page\s+\d+\s+of\s+9/);
  expect(rendered.layout.sheets![2].html).not.toContain("field-chip");
  // Historical snapshots still have their original no-band geometry and stored breaks.
  const old = { ...v, header_footer: undefined, frozen: true };
  old.content_hash = versionHash(old);
  const stored = JSON.stringify(old);
  const historical = await sealedPdf(
    old,
    [],
    [],
    p.currency,
    { settings: f.settings },
    { preview: true },
  );
  expect(historical.layout.pages).toBe(9);
  expect(JSON.stringify(old)).toBe(stored);
  expect(
    historical.layout.sheets!.every((s) => !s.html.includes("data-page-band=")),
  ).toBe(true);
});

test("Styles switches retain content space and breaks, keep overrides and show cover bands", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      {
        id: "long",
        type: "paragraph",
        text: "A useful detail for the proposal. ".repeat(1400),
      },
    ],
  });
  const hf = defaultHeaderFooter();
  hf.overrides.long = { header: "hidden" };
  await f.editRemote({ header_footer: hf });
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const plan = () =>
    page
      .locator(".editor-paper")
      .evaluate((el) => JSON.parse(el.getAttribute("data-pagination")!));
  const original = await plan();
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  const panel = page.locator(".proposal-styles");
  await expect(
    panel
      .locator("details")
      .filter({
        has: page.locator("summary").filter({ hasText: /^Text styles$/ }),
      })
      .first(),
  ).not.toHaveAttribute("open");
  const header = panel.getByRole("switch", { name: "Header", exact: true }),
    footer = panel.getByRole("switch", { name: "Footer", exact: true });
  await expect(header).toBeChecked();
  await expect(footer).toBeChecked();
  await header.uncheck();
  await expect.poll(() => f.active().header_footer?.showHeader).toBe(false);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  await expect(page.locator(".page-sheet").nth(1)).toHaveAttribute(
    "data-content-height",
    "912",
  );
  expect(f.active().header_footer?.overrides).toEqual(hf.overrides);
  await footer.uncheck();
  await expect.poll(() => f.active().header_footer?.showFooter).toBe(false);
  await expect(page.locator(".page-sheet").nth(1)).toHaveAttribute(
    "data-content-height",
    "912",
  );
  await header.check();
  await footer.check();
  await expect
    .poll(
      () =>
        f.active().header_footer?.showHeader &&
        f.active().header_footer?.showFooter,
    )
    .toBe(true);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  expect(await plan()).toEqual(original);
  await panel
    .getByRole("switch", { name: "Show on cover", exact: true })
    .check();
  await expect.poll(() => f.active().header_footer?.showOnCover).toBe(true);
  await expect(
    page.locator(".page-sheet").first().locator(".page-band"),
  ).toHaveCount(2);
  await expect(page.locator(".page-sheet").first()).toHaveAttribute(
    "data-content-height",
    "912",
  );
  expect(await plan()).toEqual(original);
  await panel.getByRole("button", { name: "0.4 in", exact: true }).click();
  await expect.poll(() => f.active().header_footer?.distanceIn).toBe(0.4);
  await expect(page.locator(".page-sheet").nth(1)).toHaveAttribute(
    "data-content-height",
    "912",
  );
  await panel
    .getByRole("switch", { name: "Divider line", exact: true })
    .uncheck();
  await expect.poll(() => f.active().header_footer?.divider).toBe(false);
  await expect(page.locator(".page-band").first()).toHaveAttribute(
    "data-divider",
    "false",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await expect(
    panel.getByRole("switch", { name: "Show on cover", exact: true }),
  ).toBeChecked();
  await panel.getByText("Page & margins", { exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Standard", exact: true }),
  ).toBeVisible();
  await panel.getByText("Text styles", { exact: true }).click();
  await expect(
    panel.getByRole("combobox", { name: /Text level/ }),
  ).toBeVisible();
});

test("new Studio templates start with shared bands and save template switches without overrides", async ({
  page,
}) => {
  const f = await editorFixture(page);
  let saved: any;
  await page.route("**/api/templates", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: await f.repo.entities("templates") });
    saved = route.request().postDataJSON();
    await f.repo.put("templates", saved);
    return route.fulfill({ json: saved });
  });
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto("/studio/templates");
  await page
    .getByRole("button", { name: "+ New template", exact: true })
    .click();
  const styles = page.locator(".proposal-styles");
  await expect(
    styles.getByRole("switch", { name: "Header", exact: true }),
  ).toBeChecked();
  await styles
    .getByRole("switch", { name: "Show on cover", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect.poll(() => saved?.header_footer?.showOnCover).toBe(true);
  expect(saved.header_footer.shared.header.layout).toBe("half");
  expect(saved.header_footer).not.toHaveProperty("overrides");
  await expect(page.locator(".template-paged-paper .page-sheet")).toHaveCount(
    2,
  );
  await expect(page.locator(".template-paged-paper .page-band")).toHaveCount(4);
});
