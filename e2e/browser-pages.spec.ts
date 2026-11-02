import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";
import { setup } from "../tests/helpers";
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
const note = "Page breaks approximate in this browser · Preview PDF for exact";
test("fallback moves pricing cards at server page boundaries and keeps choices and signatures whole", async ({
  page,
}) => {
  const seed = await setup(),
    base = seed.draft.quote[0],
    group = crypto.randomUUID();
  const quote = Array.from({ length: 12 }, (_, n) => ({
    ...structuredClone(base),
    id: crypto.randomUUID(),
    order: n,
    name: `Service ${n + 1}`,
    description: "A clearly defined service with delivery and support. ".repeat(
      6,
    ),
    schedule: null,
    min_term_months: null,
    plan_terms: null,
    optional: n >= 10,
    default_selected: n === 10,
    selected: n === 10,
    choice_group_id: n >= 10 ? group : null,
    sublines: base.sublines.map((s) => ({ ...s, id: crypto.randomUUID() })),
  }));
  const content: Block[] = [
    { id: crypto.randomUUID(), type: "heading", text: "Services" },
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  const f = await editorFixture(page, false, { content, quote });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper"),
    sheets = paper.locator(".editor-page-sheets");
  await expect(sheets).toHaveAttribute("data-approximate", "false");
  const layout = f.renders.at(-1)!.layout;
  expect(layout.pricing_pages).toBeGreaterThan(1);
  await page.addStyleTag({
    content:
      ".editor-paper .quote-description{line-height:3!important;letter-spacing:1px!important}",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(sheets).toHaveAttribute("data-layout-mode", "block");
  await expect(paper.locator(".page-sheet")).toHaveCount(layout.pages);
  const positions = await paper.evaluate((root) => {
    const top = root.getBoundingClientRect().top,
      scale =
        root.getBoundingClientRect().width / (root as HTMLElement).offsetWidth;
    const box = (el: Element) => ({
      top: (el.getBoundingClientRect().top - top) / scale,
      bottom: (el.getBoundingClientRect().bottom - top) / scale,
    });
    return {
      sheets: Array.from(root.querySelectorAll(".page-sheet")).map(box),
      atomic: Array.from(
        root.querySelectorAll(
          ".flow-quote-line,.flow-choice-group,.editor-signature",
        ),
      ).map(box),
      starts: Array.from(
        root.querySelectorAll<HTMLElement>(
          "[data-print-unit][data-browser-page]",
        ),
      ).map((el) => ({ page: Number(el.dataset.browserPage), ...box(el) })),
    };
  });
  expect(positions.atomic.length).toBeGreaterThan(12);
  for (const atom of positions.atomic)
    expect(
      positions.sheets.some(
        (s) => atom.top >= s.top - 1 && atom.bottom <= s.bottom + 1,
      ),
      JSON.stringify(atom),
    ).toBe(true);
  for (const pageNumber of new Set(positions.starts.map((s) => s.page))) {
    const first = Math.min(
      ...positions.starts
        .filter((s) => s.page === pageNumber)
        .map((s) => s.top),
    );
    // The initial page includes the table heading; later pages start at a card.
    if (layout.sheets![pageNumber - 1].fragments[0].unit)
      expect(first).toBeCloseTo(positions.sheets[pageNumber - 1].top + 72, 0);
  }
});
for (const template of [false, true])
  test(`metric mismatch retains every server sheet and covers whole blocks (${template ? "template" : "proposal"})`, async ({
    page,
  }) => {
    const f = await editorFixture(page, true);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto(
      template ? "/studio/templates" : `/proposals/${f.draft.id}`,
    );
    const paper = page.locator(
        template ? ".template-paged-paper" : ".editor-paper",
      ),
      sheets = paper.locator(".editor-page-sheets");
    await expect(sheets).toHaveAttribute("data-approximate", "false");
    const layout = f.renders.at(-1)!.layout;
    expect(layout.pages).toBeGreaterThan(3);
    const mismatch = await page.addStyleTag({
      content: `.editor-paper .tiptap p,.template-paged-paper .tiptap p,.template-paged-paper .template-text-preview p {line-height:44px!important;letter-spacing:1.1px!important}`,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect(sheets).toHaveAttribute("data-layout-mode", "block");
    await expect(sheets).toHaveAttribute("data-layout-settled", "true");
    await expect(sheets).toHaveAttribute("data-approximate", "true");
    await expect(paper.locator(".page-sheet")).toHaveCount(layout.pages);
    await expect(paper.getByText(note, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Updating pages…" }),
    ).not.toBeVisible();
    const bounds = await paper.evaluate((root) => {
      const top = root.getBoundingClientRect().top,
        scale =
          root.getBoundingClientRect().width /
          (root as HTMLElement).offsetWidth;
      const box = (el: Element) => ({
        top: (el.getBoundingClientRect().top - top) / scale,
        bottom: (el.getBoundingClientRect().bottom - top) / scale,
      });
      const sheets = Array.from(root.querySelectorAll(".page-sheet")).map(box);
      const blocks = Array.from(
        root.querySelectorAll(".draft-block,.studio-block-card"),
      ).map((el) => ({ id: (el as HTMLElement).dataset.blockId, ...box(el) }));
      const starts = Array.from(
        root.querySelectorAll<HTMLElement>("[data-browser-page]"),
      ).map((el) => ({ page: Number(el.dataset.browserPage), ...box(el) }));
      return { sheets, blocks, starts };
    });
    expect(bounds.sheets.some((s) => s.bottom - s.top > 1056)).toBe(true);
    for (const block of bounds.blocks)
      expect(
        bounds.sheets.some(
          (s) => block.top >= s.top - 1 && block.bottom <= s.bottom + 1,
        ),
        JSON.stringify({ block, sheets: bounds.sheets }),
      ).toBe(true);
    for (let n = 1; n < bounds.sheets.length; n++)
      expect(bounds.sheets[n].top - bounds.sheets[n - 1].bottom).toBeCloseTo(
        24,
        0,
      );
    for (const pageNumber of new Set(bounds.starts.map((s) => s.page))) {
      const start = Math.min(
        ...bounds.starts.filter((s) => s.page === pageNumber).map((s) => s.top),
      );
      expect(start).toBeCloseTo(bounds.sheets[pageNumber - 1].top + 72, 0);
    }
    // Font completion restores the precise path; window resize can enter fallback
    // again without a server request or opening Preview PDF.
    await mismatch.evaluate((el) => el.parentNode?.removeChild(el));
    await page.evaluate(() =>
      document.fonts.dispatchEvent(new Event("loadingdone")),
    );
    await expect(sheets).toHaveAttribute("data-layout-mode", "exact");
    await expect(sheets).toHaveAttribute("data-approximate", "false");
    await expect(paper.getByText(note, { exact: true })).not.toBeVisible();
    await expect(paper.locator(".page-sheet")).toHaveCount(layout.pages);
    const original = f.active().content;
    expect(JSON.stringify(original)).toBe(JSON.stringify(f.content));
  });

for (const width of [1440, 375])
  test(`short-block insert buttons stay outside opposite edges and never intersect (${width})`, async ({
    page,
  }) => {
    const content: Block[] = [
      { id: crypto.randomUUID(), type: "heading", text: "Short heading" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Short paragraph" },
    ];
    const f = await editorFixture(page, false, { content });
    await page.setViewportSize({ width, height: 1000 });
    for (const template of [false, true]) {
      await page.goto(
        template ? "/studio/templates" : `/proposals/${f.draft.id}`,
      );
      if (width === 375 && !template)
        await page
          .locator(".phone-section-list")
          .getByRole("button")
          .filter({ hasText: "Short heading" })
          .click();
      const modes = width === 375 && !template ? [false, true] : [false];
      for (const full of modes) {
        if (full)
          await page
            .getByRole("button", { name: "Full document", exact: true })
            .click();
        for (const block of content) {
          const frame = page.locator(
            `[data-block-id="${template ? "template" : "block"}-${block.id}"]`,
          );
          await frame.focus();
          const above = frame.getByRole("button", {
              name: "Add block above",
              exact: true,
            }),
            below = frame.getByRole("button", {
              name: "Add block below",
              exact: true,
            });
          await expect(above).toBeVisible();
          await expect(below).toBeVisible();
          const a = (await above.boundingBox())!,
            b = (await below.boundingBox())!,
            outline = (await frame.boundingBox())!,
            text = (await frame
              .locator(":scope > .block-content")
              .boundingBox())!;
          expect(a.y + a.height).toBeLessThanOrEqual(b.y);
          expect(a.y + a.height).toBeCloseTo(outline.y, 0);
          expect(b.y).toBeCloseTo(outline.y + outline.height, 0);
          expect(a.x).toBeGreaterThanOrEqual(text.x + text.width - 1);
          expect(b.x).toBeGreaterThanOrEqual(text.x + text.width - 1);
          await above.click();
          await expect(
            page.getByRole("dialog", { name: "Add a block", exact: true }),
          ).toBeVisible();
          await page.keyboard.press("Escape");
        }
      }
    }
  });
