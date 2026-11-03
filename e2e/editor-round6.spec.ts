import { test, expect, type Locator, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";
const id = () => crypto.randomUUID();
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
function content(): Block[] {
  return [
    { id: id(), type: "heading", text: "Overview" },
    {
      id: id(),
      type: "paragraph",
      content: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Overview list must survive" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    { id: id(), type: "pricing_table" },
    { id: id(), type: "signature_block", role: "client" },
    { id: id(), type: "page_break" },
    { id: id(), type: "heading", text: "Services" },
    { id: id(), type: "paragraph", text: "Services must survive" },
    { id: id(), type: "heading", text: "Acceptance" },
    { id: id(), type: "signature_block", role: "company" },
  ];
}
async function ready(page: Page, template = false) {
  await expect(
    page.locator(
      `${template ? ".template-paged-paper" : ".editor-paper"} .editor-page-sheets`,
    ),
  ).toHaveAttribute("data-approximate", "false");
}
async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!,
    b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, {
    steps: 4,
  });
  await expect(from).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 24 });
  const scales = await page.locator(".quote-sortable").evaluateAll((els) =>
    els.map((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return [m.a, m.d];
    }),
  );
  for (const scale of scales) expect(scale).toEqual([1, 1]);
  await page.mouse.up();
}
test("Overview moves preserve every saved block and page marker through controls, page/section pointer drags and exact undo", async ({
  page,
}) => {
  const blocks = content(),
    f = await editorFixture(page, false, { content: blocks });
  const original = JSON.stringify(f.active().content),
    originalIds = f
      .active()
      .content.map((b) => b.id)
      .sort(),
    patches: Block[][] = [];
  page.on("request", (r) => {
    if (
      r.method() === "PATCH" &&
      new URL(r.url()).pathname === `/api/proposals/${f.draft.id}`
    )
      patches.push(r.postDataJSON().content);
  });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const overview = page.locator(`[data-block-id="block-${blocks[0].id}"]`),
    undo = page
      .locator(
        '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
      )
      .getByRole("button", { name: "Undo", exact: true });
  async function changed(first: string, last: string) {
    await expect.poll(() => f.active().content[0]?.id).toBe(first);
    await expect.poll(() => f.active().content.at(-1)?.id).toBe(last);
    expect(
      f
        .active()
        .content.map((b) => b.id)
        .sort(),
    ).toEqual(originalIds);
    expect(new Set(f.active().content.map((b) => b.id)).size).toBe(
      blocks.length,
    );
    for (const block of f.active().content)
      expect(block).toEqual(
        JSON.parse(original).find((b: Block) => b.id === block.id),
      );
    await undo.click();
    await expect.poll(() => JSON.stringify(f.active().content)).toBe(original);
    await ready(page);
  }
  await overview.focus();
  await overview
    .locator(":scope > :is(.editor-edit-bar,.phone-block-actions)")
    .getByRole("button", { name: "Move down", exact: true })
    .click();
  await changed(blocks[4].id!, blocks.at(-1)!.id!);
  await drag(
    page,
    page.getByRole("button", { name: "Drag section Overview", exact: true }),
    page.getByRole("button", { name: "Drag section Acceptance", exact: true }),
  );
  await changed(blocks[4].id!, blocks[3].id!);
  await drag(
    page,
    page.getByRole("button", { name: "Drag section Acceptance", exact: true }),
    page.getByRole("button", { name: "Drag section Overview", exact: true }),
  );
  await changed(blocks[7].id!, blocks[6].id!);
  await drag(
    page,
    page.getByRole("button", { name: "Drag page 1", exact: true }),
    page.getByRole("button", { name: "Drag page 2", exact: true }),
  );
  await changed(blocks[5].id!, blocks[3].id!);
  // Document drag moves the complete H1 range, just like the Pages sidebar.
  await overview.focus();
  const source = page.getByRole("button", {
      name: "Drag block 1",
      exact: true,
    }),
    target = page.locator(`[data-block-id="block-${blocks[7].id}"]`);
  await target.scrollIntoViewIfNeeded();
  await drag(page, source, target);
  await changed(blocks[4].id!, blocks[3].id!);
  expect(patches.length).toBeGreaterThan(5);
  for (const patch of patches)
    expect(patch.map((b) => b.id).sort()).toEqual(originalIds);
});

test("sidebar shells stay fixed, arrows retain their size, and every sheet is paper in both editors", async ({
  page,
}) => {
  const blocks: Block[] = Array.from({ length: 14 }, (_, n) => [
    ...(n ? [{ id: id(), type: "page_break" as const }] : []),
    { id: id(), type: "heading" as const, text: `Page ${n + 1}` },
    {
      id: id(),
      type: "paragraph" as const,
      text: "A useful plan for this page.",
    },
  ]).flat();
  const f = await editorFixture(page, false, { content: blocks });
  await page.setViewportSize({ width: 1920, height: 700 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    const sheets = page.locator(".editor-paper .page-sheet");
    expect(await sheets.count()).toBeGreaterThan(10);
    for (const sheet of await sheets.all()) {
      await expect(sheet).toHaveCSS("background-color", "rgb(255, 255, 255)");
      expect(
        await sheet.evaluate((el) => getComputedStyle(el).boxShadow),
      ).not.toBe("none");
    }
  }
  for (const [shellName, arrowName, scrollSelector] of [
    [".editor-outline", "Sections", ".editor-sidebar-scroll"],
    [".editor-sidepanel", "tools", '[role="tabpanel"]'],
  ]) {
    const shell = page.locator(shellName),
      arrow = shell.getByRole("button", {
        name: `Collapse ${arrowName} sidebar`,
        exact: true,
      }),
      before = (await arrow.boundingBox())!;
    await expect(shell).toHaveCSS("overflow-y", "hidden");
    const scroll = shell.locator(scrollSelector);
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const after = (await arrow.boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(await shell.evaluate((el) => el.scrollTop)).toBe(0);
    await arrow.click();
    const expand = shell.getByRole("button", {
        name: `Expand ${arrowName} sidebar`,
        exact: true,
      }),
      collapsed = (await expand.boundingBox())!;
    expect([collapsed.width, collapsed.height]).toEqual([
      before.width,
      before.height,
    ]);
    await expect(expand).toHaveCSS("align-items", "center");
    await expect(expand).toHaveCSS("justify-content", "center");
    await expand.click();
    const reopened = (await arrow.boundingBox())!;
    expect([reopened.width, reopened.height]).toEqual([
      before.width,
      before.height,
    ]);
  }
  await page.goto("/studio/templates");
  await ready(page, true);
  const templateSheets = page.locator(".template-paged-paper .page-sheet");
  expect(await templateSheets.count()).toBeGreaterThan(10);
  for (const sheet of await templateSheets.all())
    await expect(sheet).toHaveCSS("background-color", "rgb(255, 255, 255)");
  for (const shellName of [".studio-template-list", ".studio-inspector"]) {
    const shell = page.locator(shellName),
      arrow = shell.locator(".sidebar-arrow"),
      before = (await arrow.boundingBox())!;
    await expect(shell).toHaveCSS("overflow-y", "hidden");
    const scroll = shell.locator(":scope > .editor-sidebar-scroll");
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect((await arrow.boundingBox())!.y).toBeCloseTo(before.y, 0);
    await arrow.click();
    const after = (await arrow.boundingBox())!;
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    await arrow.click();
  }
});

test("moving a title-field section to the top survives saving and reload without cleanup deleting it", async ({
  page,
}) => {
  const blocks: Block[] = [
    { id: id(), type: "heading", text: "Overview" },
    { id: id(), type: "paragraph", text: "This overview stays intact." },
    { id: id(), type: "heading", text: "{{proposal.title}}" },
    {
      id: id(),
      type: "paragraph",
      text: "This section keeps its original ID.",
    },
  ];
  const f = await editorFixture(page, false, { content: blocks }),
    ids = blocks.map((b) => b.id).sort();
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const frame = page.locator(`[data-block-id="block-${blocks[2].id}"]`);
  await frame.focus();
  await frame
    .locator(":scope > :is(.editor-edit-bar,.phone-block-actions)")
    .getByRole("button", { name: "Move up", exact: true })
    .click();
  await expect.poll(() => f.active().content[0]?.id).toBe(blocks[2].id);
  expect(
    f
      .active()
      .content.map((b) => b.id)
      .sort(),
  ).toEqual(ids);
  await expect(
    page.getByText(/^(All changes saved|Draft · Saved)$/, { exact: true }),
  ).toBeVisible();
  const revision = f.active().revision;
  await page.reload();
  await ready(page);
  await expect(frame).toHaveCount(1);
  await expect(page.locator(".editor-paper .draft-block")).toHaveCount(
    blocks.length,
  );
  await page.waitForTimeout(700);
  expect(f.active().revision).toBe(revision);
  expect(
    f
      .active()
      .content.map((b) => b.id)
      .sort(),
  ).toEqual(ids);
});

test("text style has symmetric divider gaps and balanced inner chevron padding", async ({
  page,
}) => {
  const f = await editorFixture(page);
  for (const width of [1440, 1100, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    if (width === 375) {
      await expect(page.locator(".editor-paper")).toBeVisible();
    }
    const bar = page.getByRole("toolbar", {
      name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
      exact: true,
    });
    {
      await page.locator(".draft-block .tiptap").first().focus();
      const style = bar.locator('button[aria-label="Text style"]');
      const spacing = await style.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          label = el
            .querySelector(".text-style-label")!
            .getBoundingClientRect(),
          caret = el
            .querySelector(".text-style-caret")!
            .getBoundingClientRect();
        return {
          before: label.left - r.left,
          after: r.right - caret.right,
          height: r.height,
        };
      });
      expect(Math.abs(spacing.before - spacing.after)).toBeLessThanOrEqual(1);
      expect(spacing.before).toBeCloseTo(8, 0);
      expect(spacing.height).toBeCloseTo(width < 700 ? 44 : 32, 0);
      const divider = await bar.locator(".edit-divider").first().boundingBox();
      expect(divider!.width).toBeCloseTo(1, 0);
      expect(divider!.height).toBeCloseTo(20, 0);
      continue;
    }
  }
});
