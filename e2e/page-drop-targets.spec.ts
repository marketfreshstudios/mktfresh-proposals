import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import type { Block, SavedBlock, Template } from "../src/lib/model";
const id = () => crypto.randomUUID();
test.use({ actionTimeout: 10000 });
const makeContent = (): Block[] => [
  { id: id(), type: "page_break" },
  { id: id(), type: "heading", text: "Before the empty page", level: 1 },
  { id: id(), type: "paragraph", text: "First page content." },
  { id: id(), type: "page_break" },
  { id: id(), type: "page_break" },
  { id: id(), type: "heading", text: "Following page", level: 1 },
  { id: id(), type: "paragraph", text: "The caret stays here." },
  { id: id(), type: "paragraph", text: "Another paragraph below." },
  { id: id(), type: "pricing_table" },
  {
    id: id(),
    type: "contract",
    clauses: [
      {
        id: id(),
        heading: "Agreement",
        body: "Keep the agreement.",
        show_when: null,
      },
    ],
  },
  { id: id(), type: "signature_block", role: "client" },
  { id: id(), type: "signature_block", role: "company" },
];
const dir = "docs/screenshots/page-drop-targets";
async function shot(page: Page, name: string) {
  if (!process.env.CAPTURE_PAGE_DROPS) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled" });
}
async function dragStart(
  page: Page,
  source: Locator,
  point: { x: number; y: number },
) {
  await source.scrollIntoViewIfNeeded();
  const s = (await source.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 14, s.y + s.height / 2, {
    steps: 4,
  });
  await page.mouse.move(point.x, point.y, { steps: 16 });
  // Native Chromium dragover requires another pointer event at the destination.
  await page.mouse.move(point.x + 1, point.y, { steps: 2 });
}
for (const template of [false, true]) {
  test(`${template ? "template" : "proposal"}: saved groups use sheet boundaries, not the caret, with exact Undo and forbidden targets`, async ({
    page,
  }) => {
    const content = makeContent();
    const f = await editorFixture(page, false, { content });
    const group: SavedBlock = {
      id: id(),
      name: "Case study group",
      type: "group",
      blocks: [
        { id: id(), type: "paragraph", text: "Case study first." },
        { id: id(), type: "paragraph", text: "Case study second." },
      ],
      block: { type: "paragraph", text: "Case study first." },
    };
    await f.repo.put("content_library", group);
    const t = (await f.repo.entities<Template>("templates"))[0];
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      template ? `/studio/templates/${t.id}` : `/proposals/${f.draft.id}/edit`,
    );
    const paper = page.locator(
      template ? ".template-paged-paper" : ".editor-paper",
    );
    const ready = () =>
      expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
        "data-layout-settled",
        "true",
      );
    await ready();
    const prefix = template ? "template-" : "block-";
    const frame = (n: number) =>
      paper.locator(`[data-block-id="${prefix}${content[n].id}"]`);
    await frame(6).locator(".tiptap").click();
    await page.getByRole("tab", { name: "Blocks", exact: true }).click();
    const source = page.getByRole("menuitem", {
      name: "Case study group",
      exact: true,
    });
    const read = async () =>
      template
        ? (await f.repo.entities<Template>("templates"))[0].content
        : f.active().content;
    const original = JSON.stringify(await read());
    const undo = page
      .getByRole("button", { name: "Undo", exact: true })
      .first();
    const line = page.getByRole("status", {
      name: "Insert block here",
      exact: true,
    });
    async function insertAt(
      point: { x: number; y: number },
      at: number,
      capture = false,
    ) {
      await dragStart(page, source, point);
      await expect(line).toHaveCount(1);
      await expect(line).toHaveAttribute("data-drop-index", String(at));
      const lineBox = (await line.boundingBox())!;
      const p = (await paper.boundingBox())!;
      expect(lineBox.y).toBeGreaterThanOrEqual(56);
      expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(1000);
      expect(lineBox.x).toBeGreaterThan(p.x + 20);
      expect(lineBox.x + lineBox.width).toBeLessThan(p.x + p.width - 20);
      if (capture) await shot(page, "empty-page-indicator-1440");
      await page.mouse.up();
      await expect
        .poll(async () => (await read()).slice(at, at + 2).map((b) => b.text))
        .toEqual(["Case study first.", "Case study second."]);
      if (capture) {
        const insertedId = (await read())[at].id;
        await expect(
          paper.locator(`[data-block-id="${prefix}${insertedId}"]`),
        ).toHaveAttribute("data-selected", "true");
        await paper
          .locator('.page-sheet[data-editor-page="3"]')
          .evaluate((el) => {
            el.scrollIntoView({ block: "start" });
            el.closest(
              ".editor-document-region,.studio-template-main",
            )?.scrollBy(0, -52);
          });
        const current = page
          .getByRole("navigation", { name: "Sections", exact: true })
          .locator('[aria-current="location"]');
        await expect(current).toHaveCount(1);
        await expect(current).toHaveText("Overview");
        await shot(page, "empty-page-result-1440");
      }
      await undo.click();
      await expect
        .poll(async () => JSON.stringify(await read()))
        .toBe(original);
      await ready();
    }
    const empty = paper.locator('.page-sheet[data-editor-page="3"]');
    await empty.evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      el.closest(".editor-document-region,.studio-template-main")?.scrollBy(
        0,
        -52,
      );
    });
    let b = (await empty.boundingBox())!;
    await insertAt(
      { x: b.x + b.width / 2, y: b.y + b.height / 2 },
      4,
      !template,
    );
    // Near the foot of the empty sheet, and in either margin, still means after its marker.
    for (const side of ["left", "right"]) {
      await empty.scrollIntoViewIfNeeded();
      b = (await empty.boundingBox())!;
      await insertAt(
        {
          x: side === "left" ? b.x + 12 : b.x + b.width - 12,
          y: Math.min(850, b.y + b.height - 110),
        },
        4,
      );
    }
    // The lower half of PAGE 4 targets the start of that page, after its own marker.
    const gap = paper.locator('.editor-sheet-gap[data-page-label="4"]');
    await gap.scrollIntoViewIfNeeded();
    b = (await gap.boundingBox())!;
    await insertAt({ x: b.x + b.width / 2, y: b.y + b.height - 8 }, 5);
    await frame(5).scrollIntoViewIfNeeded();
    b = (await frame(5).boundingBox())!;
    await insertAt({ x: b.x + 10, y: b.y - 6 }, 5);
    await frame(2).scrollIntoViewIfNeeded();
    b = (await frame(2).boundingBox())!;
    await insertAt({ x: b.x + 10, y: b.y + b.height + 20 }, 3);
    // A point between two paragraphs shares the exact source boundary with its indicator.
    await frame(7).scrollIntoViewIfNeeded();
    b = (await frame(7).boundingBox())!;
    await dragStart(page, source, { x: b.x + 10, y: b.y - 2 });
    await expect(line).toHaveAttribute("data-drop-index", "7");
    if (!template) await shot(page, "between-blocks-indicator-1440");
    await page.mouse.up();
    await expect
      .poll(async () => (await read())[7].text)
      .toBe("Case study first.");
    await undo.click();
    await expect.poll(async () => JSON.stringify(await read())).toBe(original);
    // The ordinary Blocks catalogue uses the same source MIME and page-aware resolver.
    await empty.scrollIntoViewIfNeeded();
    b = (await empty.boundingBox())!;
    await dragStart(
      page,
      page.getByRole("menuitem", { name: "Paragraph", exact: true }),
      { x: b.x + 20, y: Math.min(800, b.y + b.height / 2) },
    );
    await expect(line).toHaveAttribute("data-drop-index", "4");
    await page.mouse.up();
    await expect
      .poll(async () => (await read()).length)
      .toBe(content.length + 1);
    expect((await read())[4].type).toBe("paragraph");
    await undo.click();
    await expect.poll(async () => JSON.stringify(await read())).toBe(original);
    await ready();
    // Existing blocks and a multi-selection use the identical pointer boundary and one undo.
    async function moveToEmpty(multi: boolean) {
      await frame(6).click({ position: { x: 20, y: 16 } });
      if (multi) {
        await frame(7).click({
          modifiers: ["Shift"],
          position: { x: 20, y: 16 },
        });
        await expect(paper.locator('[data-multi-selected="true"]')).toHaveCount(
          2,
        );
      }
      const handle = frame(6).locator(".editor-gutter .drag-handle");
      await handle.scrollIntoViewIfNeeded();
      const h = (await handle.boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 16, {
        steps: 4,
      });
      await expect(handle).toHaveAttribute("aria-pressed", "true");
      await empty.scrollIntoViewIfNeeded();
      const target = (await empty.boundingBox())!;
      await page.mouse.move(
        target.x + 20,
        Math.max(150, Math.min(800, target.y + target.height / 2)),
        { steps: 16 },
      );
      await expect(line).toHaveCount(1);
      await expect(line).toHaveAttribute("data-drop-index", "4");
      await page.mouse.up();
      await expect
        .poll(async () =>
          (await read()).slice(4, multi ? 6 : 5).map((b) => b.id),
        )
        .toEqual(multi ? [content[6].id, content[7].id] : [content[6].id]);
      expect((await read()).map((b) => b.id).sort()).toEqual(
        content.map((b) => b.id).sort(),
      );
      await undo.click();
      await expect
        .poll(async () => JSON.stringify(await read()))
        .toBe(original);
      await ready();
    }
    await moveToEmpty(false);
    await moveToEmpty(true);
    // A dragged last block's moving rectangle must not invent an end-of-page target.
    await frame(2).click({ position: { x: 20, y: 16 } });
    const lastHandle = frame(2).locator(".editor-gutter .drag-handle");
    const h = (await lastHandle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 16, {
      steps: 4,
    });
    const heading = (await frame(1).boundingBox())!;
    await page.mouse.move(heading.x - 20, heading.y + heading.height / 2 + 1, {
      steps: 16,
    });
    await expect(line).toHaveAttribute("data-drop-index", "2");
    await page.mouse.up();
    expect(JSON.stringify(await read())).toBe(original);
    // Invalid targets must clear the previous indicator and must not reuse its last index.
    for (const target of [
      paper.locator(".document-cover"),
      paper.locator('[data-band-frame="header"]').nth(2),
      paper.locator('[data-band-frame="footer"]').nth(2),
      frame(8).locator(":scope > .block-content"),
      frame(9).locator(":scope > .block-content"),
      frame(10).locator(":scope > .block-content"),
    ]) {
      await target.scrollIntoViewIfNeeded();
      const r = (await target.boundingBox())!;
      await dragStart(page, source, {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
      });
      await expect(line).toHaveCount(0);
      await page.mouse.up();
      expect(JSON.stringify(await read())).toBe(original);
    }
  });
}
