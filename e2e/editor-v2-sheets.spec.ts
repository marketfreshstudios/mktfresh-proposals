import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";
const id = () => crypto.randomUUID();
function content(): Block[] {
  return [
    { id: id(), type: "heading", level: 1, text: "Overview" },
    ...Array.from({ length: 6 }, (_, n) => ({
      id: id(),
      type: "paragraph" as const,
      text: `Scope ${n + 1}. ${"A clear scope keeps everyone informed about the project and its next steps. ".repeat(8)}`,
    })),
    { id: id(), type: "page_break" },
    { id: id(), type: "heading", level: 1, text: "Delivery" },
    ...Array.from({ length: 4 }, (_, n) => ({
      id: id(),
      type: "paragraph" as const,
      text: `Delivery ${n + 1}. ${"We review progress together and agree the next milestones. ".repeat(8)}`,
    })),
    { id: id(), type: "pricing_table" },
    { id: id(), type: "signature_block", role: "client" },
  ];
}
async function ready(page: Page) {
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  await page.evaluate(() => document.fonts.ready);
}
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
test("computed pages draw separate sheets and PDF-numbered 52px gaps; display width never changes the print plan", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content: content() });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const paper = page.locator(".editor-paper"),
    sheets = paper.locator(".page-sheet");
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  expect(plan.pages).toBeGreaterThanOrEqual(3);
  await expect(sheets).toHaveCount(plan.pages);
  const outside = await paper.evaluate((root) => {
    const sheets = Array.from(
      root.querySelectorAll<HTMLElement>(".page-sheet"),
    ).map((el) => el.getBoundingClientRect());
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const failures: string[] = [];
    let node;
    while ((node = walker.nextNode())) {
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest(
          "[data-editor-chrome],[data-pagination-spacer],textarea,.sr-only,style",
        )
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects()))
        if (
          r.width &&
          r.height &&
          !sheets.some((s) => r.top >= s.top - 1 && r.bottom <= s.bottom + 1)
        )
          failures.push(node.textContent!.slice(0, 50));
    }
    return failures;
  });
  expect(outside).toEqual([]);
  const size = await paper
    .locator(".tiptap")
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  for (const width of [1440, 1180, 1024, 924]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    await expect
      .poll(async () =>
        JSON.parse((await paper.getAttribute("data-pagination"))!),
      )
      .toEqual(plan);
    await expect(paper.locator(".tiptap").first()).toHaveCSS("font-size", size);
    await expect(page.getByLabel("Editor zoom")).toHaveCount(0);
    expect(
      await paper.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(848);
    expect(await paper.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    const gaps = paper.locator(".editor-sheet-gap");
    await expect(gaps).toHaveCount(plan.pages - 1);
    for (let n = 0; n < plan.pages - 1; n++) {
      await expect(gaps.nth(n)).toHaveText(`PAGE ${n + 2}`);
      await expect(gaps.nth(n)).toHaveCSS("height", "52px");
      await gaps
        .nth(n)
        .evaluate((el) => el.scrollIntoView({ block: "center" }));
      expect(
        await gaps.nth(n).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return !!document
            .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            ?.closest(".editor-sheet-gap");
        }),
      ).toBe(true);
      await expect(gaps.nth(n).locator("button,input,a")).toHaveCount(0);
      const values = await gaps.nth(n).evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        canvas: getComputedStyle(el.closest("main")!).backgroundColor,
      }));
      expect(values.bg).toBe(values.canvas);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const { PDFDocument } = await import("pdf-lib");
  expect(
    (
      await PDFDocument.load(Buffer.from(f.renders[0].pdf_base64, "base64"))
    ).getPageCount(),
  ).toBe(plan.pages);
  expect(f.renders[0].layout.pages).toBe(plan.pages);
  expect(f.active().content).toEqual(f.content);
});
for (const width of [1440, 1024])
  test(`page 2/3 blocks keep controls, edge insertion and background deselection at ${width}`, async ({
    page,
  }) => {
    const f = await editorFixture(page, false, { content: content() });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    await ready(page);
    const paper = page.locator(".editor-paper");
    for (const number of [2, 3]) {
      const assignments = JSON.parse(
        (await paper.getAttribute("data-page-assignments"))!,
      );
      const assigned = assignments.find((a: any) => a.page === number);
      expect(assigned).toBeTruthy();
      const frame = paper.locator(`[data-block-id="block-${assigned.block}"]`);
      await frame.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await frame.focus();
      await expect(frame.locator(".editor-edit-bar")).toBeVisible();
      await expect(frame.locator(".editor-gutter")).toBeVisible();
    }
    const assigned = JSON.parse(
      (await paper.getAttribute("data-page-assignments"))!,
    )
      .filter((a: any) => a.page === 3)
      .at(-1);
    const frame = paper.locator(`[data-block-id="block-${assigned.block}"]`);
    await frame.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await frame.focus();
    const index = f.active().content.findIndex((b) => b.id === assigned.block);
    await frame
      .getByRole("button", { name: "Add a block below", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Text", exact: true }).click();
    await expect
      .poll(() => f.active().content.length)
      .toBe(f.content.length + 1);
    expect(f.active().content[index + 1].type).toBe("paragraph");
    await expect(paper.locator('[data-selected="true"] .tiptap')).toBeFocused();
    await paper.evaluate((el) => el.scrollIntoView({ block: "start" }));
    const rect = (await paper.boundingBox())!;
    await page.mouse.click(rect.x + 12, Math.max(80, rect.y + 12));
    await expect(paper.locator('[data-selected="true"]')).toHaveCount(0);
  });
test("white sheets in dark mode and an empty sheet inserts through the existing menu in both editors", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("proposal-theme", "dark"),
  );
  const f = await editorFixture(page, false, { content: [] });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const template = (await f.repo.entities<any>("templates"))[0];
  for (const path of [
    `/proposals/${f.draft.id}`,
    `/studio/templates/${template.id}`,
  ]) {
    await page.goto(path);
    await ready(page);
    const root = page
      .locator('[data-sheet-view="true"]')
      .filter({ has: page.locator(".page-sheet") })
      .first();
    await expect(root.locator(".page-sheet")).toHaveCount(1);
    await expect(root.locator(".page-sheet")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    const insert = root.getByRole("button", {
      name: "Add first block",
      exact: true,
    });
    await expect(insert).toHaveText("+Add your first block");
    await expect(insert.locator(".empty-sheet-plus")).toHaveCSS(
      "width",
      "44px",
    );
    await insert.click();
    await page.getByRole("menuitem", { name: "Text", exact: true }).click();
    await expect(root.locator(".tiptap")).toBeVisible();
  }
});
test("template sheets share PDF numbering and responsive typography; density changes display gaps", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content: content() });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const template = (await f.repo.entities<any>("templates"))[0];
  await page.goto(`/studio/templates/${template.id}`);
  await ready(page);
  const paper = page.locator(".template-paged-paper");
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  const font = await paper
    .locator(".tiptap")
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(plan.pages).toBeGreaterThanOrEqual(3);
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    await expect
      .poll(async () =>
        JSON.parse((await paper.getAttribute("data-pagination"))!),
      )
      .toEqual(plan);
    await expect(paper.locator(".page-sheet")).toHaveCount(plan.pages);
    await expect(paper.locator(".tiptap").first()).toHaveCSS("font-size", font);
    expect(await paper.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    const labels = await paper.locator(".editor-sheet-gap").allTextContents();
    expect(labels).toEqual(
      Array.from({ length: plan.pages - 1 }, (_, n) => `PAGE ${n + 2}`),
    );
  }
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const first = page
    .locator(`[data-block-id="block-${f.content[1].id}"]`)
    .locator("..");
  await expect(first).toHaveCSS("margin-top", "12px");
  const contentGap = () =>
    page.locator(".editor-paper").evaluate((root) => {
      const blocks = root.querySelectorAll(".draft-block > .block-content");
      return (
        blocks[1].getBoundingClientRect().top -
        blocks[0].getBoundingClientRect().bottom
      );
    });
  expect(await contentGap()).toBeCloseTo(12, 1);
  await f.editRemote({
    style_overrides: { density: "comfortable" },
  });
  await page.reload();
  await ready(page);
  await expect(first).toHaveCSS("margin-top", "22px");
  expect(await contentGap()).toBeCloseTo(22, 1);
});

test("requested sheet captures at 1440, 1024 and unchanged phone 375", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE_EDITOR_V2_SHEETS !== "1",
    "Only the requested PR images.",
  );
  const demo = content();
  demo[1].text =
    "A useful proposal, with a clear scope and an agreed plan for delivery.";
  demo.splice(2, 5);
  const f = await editorFixture(page, false, { content: demo });
  await mkdir("docs/screenshots", { recursive: true });
  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    if (width >= 700) await ready(page);
    else
      await expect(
        page.getByRole("button", { name: "Review & send", exact: true }),
      ).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/editor-v2-sheets-${width}-light.png`,
    });
  }
});
