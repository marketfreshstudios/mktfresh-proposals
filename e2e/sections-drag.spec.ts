import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { Block } from "../src/lib/model";
import { editorFixture } from "./editor-fixture";

async function fixture(page: Page, template = false, extraRows = false) {
  const content: Block[] = Array.from({ length: 3 }, (_, i) => {
    const n = i + 1;
    const rows: Block[] = [
      ...(n === 1 ? [] : [{ id: `page-${n}`, type: "page_break" as const }]),
      {
        id: `heading-${n}`,
        type: "heading" as const,
        level: 1 as const,
        text: `Section ${n}`,
      },
      { id: `body-${n}`, type: "paragraph" as const, text: `Body ${n}` },
    ];
    if (extraRows && n === 1) {
      rows.push(
        { id: "subheading-1", type: "heading", level: 2, text: "Background" },
        {
          id: "source-neighbor",
          type: "heading",
          level: 1,
          text: "Source neighbor",
        },
        {
          id: "source-neighbor-body",
          type: "paragraph",
          text: "This row closes the source gap.",
        },
      );
    }
    if (extraRows && n === 2) {
      for (const row of [2, 3]) {
        rows.push(
          {
            id: `destination-${row}`,
            type: "heading",
            level: 1,
            text: `Destination row ${row}`,
          },
          {
            id: `destination-body-${row}`,
            type: "paragraph",
            text: "This row moves down.",
          },
        );
      }
    }
    return rows;
  }).flat();
  const f = await editorFixture(page, false, { content });
  const seed = (
    await f.repo.entities<{ id: string; content: Block[] }>("templates")
  )[0];
  await page.goto(
    template ? `/studio/templates/${seed.id}` : `/proposals/${f.draft.id}/edit`,
  );
  const nav = page.getByRole("navigation", { name: "Sections", exact: true });
  const sheet = (n: number) => nav.locator(`[data-outline-page="${n}"]`);
  const handle = nav.getByRole("button", {
    name: "Drag section Section 1",
    exact: true,
  });
  const original = nav.locator('[data-sortable-id="section:heading-1"]');
  const current = async () =>
    template
      ? (
          await f.repo.entities<{ id: string; content: Block[] }>("templates")
        ).find((t) => t.id === seed.id)!.content
      : f.active().content;
  const verifyMove = async (n: number, atEnd = false) => {
    await expect(
      sheet(n).getByRole("button", { name: "Section 1", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const ids = (await current()).map((b) => b.id);
        const start = ids.indexOf("heading-1");
        const pageStart = ids.indexOf(`page-${n}`);
        const pageEnd = n === 3 ? ids.length : ids.indexOf(`page-${n + 1}`);
        return {
          section: ids.slice(start, start + 2),
          onPage: pageStart >= 0 && start > pageStart && start < pageEnd,
          afterPageContent: atEnd ? start > ids.indexOf(`body-${n}`) : true,
          allOriginalBlocks: [...ids].sort(),
        };
      })
      .toEqual({
        section: ["heading-1", "body-1"],
        onPage: true,
        afterPageContent: true,
        allOriginalBlocks: content.map((b) => b.id).sort(),
      });
  };
  const undo = async () => {
    await page.keyboard.press("Control+z");
    await expect.poll(current).toEqual(content);
  };
  return { nav, sheet, handle, original, verifyMove, undo, current, content };
}

async function center(target: Locator) {
  const b = (await target.boundingBox())!;
  return {
    x: Math.round(b.x + b.width / 2),
    y: Math.round(b.y + b.height / 2),
  };
}

const settlePointer = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

const translation = (row: Locator) =>
  row.evaluate((el) => {
    const transform = getComputedStyle(el).transform;
    return transform === "none" ? 0 : new DOMMatrix(transform).m42;
  });

const settleSidebar = (nav: Locator) =>
  nav.evaluate(async (el) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.allSettled(
      el
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });

for (const template of [false, true]) {
  test(`${template ? "template" : "proposal"} cross-page gaps move the rows and match the pointer and keyboard drop`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { nav, sheet, handle, original, verifyMove, current, content } =
      await fixture(page, template, true);
    const sourceNeighbor = nav.locator(
      '[data-sortable-id="section:source-neighbor"]',
    );
    const first = sheet(2).locator('[data-sortable-id="section:heading-2"]');
    const second = sheet(2).locator(
      '[data-sortable-id="section:destination-2"]',
    );
    const third = sheet(2).locator(
      '[data-sortable-id="section:destination-3"]',
    );
    const gap = nav.locator("[data-section-drop-gap]");
    const height = (await original.boundingBox())!.height;
    const firstY = (await first.boundingBox())!.y;
    const secondY = (await second.boundingBox())!.y;
    const sourceY = (await sourceNeighbor.boundingBox())!.y;

    const startPointer = async () => {
      await original
        .getByRole("button", { name: "Section 1", exact: true })
        .hover();
      const start = await center(handle);
      const target = await center(second);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 12, start.y, { steps: 4 });
      await expect(sheet(2).locator(".outline-page-end")).toHaveAttribute(
        "data-dragging",
        "true",
      );
      await page.mouse.move(target.x, target.y);
    };
    const expectGap = async () => {
      await expect(gap).toBeVisible();
      await expect.poll(() => translation(sourceNeighbor)).toBe(-height);
      await expect.poll(() => translation(second)).toBe(height);
      await expect.poll(() => translation(third)).toBe(height);
      expect(await translation(first)).toBe(0);
      expect((await gap.boundingBox())!.height).toBe(height);
      expect((await sourceNeighbor.boundingBox())!.y).toBe(sourceY - height);
      expect(
        (await second.boundingBox())!.y - (await first.boundingBox())!.y,
      ).toBe(secondY - firstY + height);
      expect(await current()).toEqual(content);
      await expect(
        sheet(1).getByRole("button", { name: "Section 1", exact: true }),
      ).toHaveCount(1);
    };
    const expectOrder = async () => {
      await verifyMove(2);
      await expect(
        sheet(2).locator(".outline-section > .section-label"),
      ).toHaveText([
        "Section 2",
        "Section 1",
        "Destination row 2",
        "Destination row 3",
      ]);
    };
    const undoDrop = async () => {
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect.poll(current).toEqual(content);
    };

    await startPointer();
    if (!template && process.env.CAPTURE_SECTION_GAP) {
      // Use the same fixture on main and on the PR branch for the comparison.
      const dir = "docs/screenshots/sections-cross-page-gap";
      await mkdir(dir, { recursive: true });
      await expect
        .poll(() => translation(second))
        .toBe(process.env.CAPTURE_SECTION_GAP === "before" ? 0 : height);
      await page.screenshot({
        path: `${dir}/${process.env.CAPTURE_SECTION_GAP}.png`,
        animations: "disabled",
        clip: { x: 0, y: 52, width: 400, height: 620 },
      });
      if (process.env.CAPTURE_SECTION_GAP === "before") return;
    }
    await expectGap();
    await expect(gap).toHaveAttribute(
      "data-section-drop-gap",
      "section:destination-2",
    );
    await expect(gap).toHaveAttribute("data-section-drop-edge", "before");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(gap).toHaveCount(0);
    await expect.poll(() => translation(second)).toBe(0);
    await expect.poll(() => translation(sourceNeighbor)).toBe(0);
    expect(await current()).toEqual(content);

    await startPointer();
    await expectGap();
    const insertion = await center(gap);
    await page.mouse.move(insertion.x, insertion.y);
    await page.mouse.up();
    await expectOrder();
    await undoDrop();

    await handle.focus();
    await page.keyboard.press("Space");
    await settlePointer(page);
    for (const target of [
      "section:source-neighbor",
      "page:page-2",
      "section:heading-2",
    ]) {
      await page.keyboard.press("ArrowDown");
      await expect(
        page.locator('[id^="DndLiveRegion"]').filter({
          hasText: `over droppable area ${target}.`,
        }),
      ).toHaveCount(1);
    }
    await expectGap();
    await expect(handle).toBeFocused();
    await page.keyboard.press("Space");
    await expectOrder();
    await undoDrop();
  });
}

for (const template of [false, true]) {
  test(`${template ? "template" : "proposal"} section drag keeps following the pointer across headings, slots, and Add page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { nav, sheet, handle, original, verifyMove, undo } = await fixture(
      page,
      template,
    );
    const p2 = sheet(2),
      p3 = sheet(3);
    await expect(p3.getByText("Section 3", { exact: true })).toBeVisible();
    const end2 = p2.locator(".outline-page-end");
    const source = (await original.boundingBox())!;

    const begin = async () => {
      await original
        .getByRole("button", { name: "Section 1", exact: true })
        .hover();
      const start = await center(handle);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      // The sensor's first move activates the drag.
      await page.mouse.move(start.x, start.y + 12, { steps: 4 });
      await expect(end2).toHaveAttribute("data-dragging", "true");
      return start;
    };
    const pauseOver = async (
      target: { x: number; y: number },
      start: { y: number },
    ) => {
      await page.mouse.move(target.x, target.y);
      await settleSidebar(nav);
      await expect(end2).toHaveAttribute("data-dragging", "true");
      await expect
        .poll(async () => {
          const overlay = page.locator("[data-section-drag-preview]");
          const box = await (
            (await overlay.count()) ? overlay : original
          ).boundingBox();
          return Math.abs(box!.y - source.y - (target.y - start.y));
        })
        .toBeLessThanOrEqual(2);
    };

    const start = await begin();
    const heading2 = await center(p2.locator(".outline-page-title"));
    await pauseOver(heading2, start);
    const end = await center(end2);
    await pauseOver(end, start);
    await expect(end2).toHaveAttribute("data-drop-target", "true");
    const endGap = p2.locator('[data-section-drop-gap="page-end:page-2"]');
    await expect(endGap).toBeVisible();
    expect((await endGap.boundingBox())!.height).toBe(source.height);
    const projectedEnd = await center(end2);
    await pauseOver({ x: end.x, y: projectedEnd.y + 14 }, start);
    await pauseOver(
      await center(nav.getByRole("button", { name: "Add page", exact: true })),
      start,
    );
    await pauseOver(await center(p3.locator(".outline-page-title")), start);
    await page.mouse.up();
    await expect(end2).not.toHaveAttribute("data-dragging", "true");
    await verifyMove(3);
    await undo();

    const again = await begin();
    await pauseOver(await center(end2), again);
    await page.mouse.up();
    await verifyMove(2, true);
    await undo();
  });
}

test("keyboard section drag crosses pages in the template and undoes as one move", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { sheet, handle, verifyMove, undo } = await fixture(page, true);
  await expect(sheet(3)).toBeVisible();
  await handle.focus();
  await page.keyboard.press("Space");
  const end2 = sheet(2).locator(".outline-page-end");
  await expect(end2).toHaveAttribute("data-dragging", "true");
  // The keyboard sensor registers its document listener after activation.
  await settlePointer(page);
  for (const target of ["page:page-2", "section:heading-2", "page:page-3"]) {
    await page.keyboard.press("ArrowDown");
    await expect(
      page.locator('[id^="DndLiveRegion"]').filter({
        hasText: `over droppable area ${target}.`,
      }),
    ).toHaveCount(1);
    await expect(end2).toHaveAttribute("data-dragging", "true");
  }
  await page.keyboard.press("Space");
  await verifyMove(3);
  await undo();
});

test("touch section drag stays active across pages in the Sections drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const { sheet, handle, verifyMove, undo } = await fixture(page);
  await page
    .getByRole("button", { name: "Expand Sections sidebar", exact: true })
    .click();
  await expect(sheet(3)).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const send = (
    type: "touchStart" | "touchMove" | "touchEnd",
    point?: { x: number; y: number },
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [point] : [],
    });
  const start = await center(handle);
  await send("touchStart", start);
  await send("touchMove", { x: start.x, y: start.y + 12 });
  const end2 = sheet(2).locator(".outline-page-end");
  for (const target of [
    sheet(2).locator(".outline-page-title"),
    end2,
    sheet(3).locator(".outline-page-title"),
  ]) {
    await send("touchMove", await center(target));
    await expect(end2).toHaveAttribute("data-dragging", "true");
  }
  await send("touchEnd");
  await verifyMove(3);
  await undo();
});
