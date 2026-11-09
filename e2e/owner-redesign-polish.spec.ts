import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { editorFixture } from "./editor-fixture";
import {
  expectNoTabUnderline,
  expectStraightTabIndicator,
} from "./tab-indicator";

async function screenshot(page: Page, name: string) {
  if (process.env.CAPTURE_OWNER_REDESIGN !== "1") return;
  const dir = "docs/screenshots/owner-redesign-polish";
  await mkdir(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled" });
}

async function expectReadable(control: Locator, state: string) {
  const contrast = await control.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const chain = [];
    for (let node: Element | null = el; node; node = node.parentElement)
      chain.push(node);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 1, 1);
    for (const node of chain.reverse()) {
      context.fillStyle = getComputedStyle(node).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = context.getImageData(0, 0, 1, 1).data;
    context.fillStyle = getComputedStyle(el).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = context.getImageData(0, 0, 1, 1).data;
    const luminance = (rgba: Uint8ClampedArray) => {
      const [r, g, b] = [...rgba].map((byte) => {
        const value = byte / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [luminance(background), luminance(foreground)].sort(
      (x, y) => x - y,
    );
    return (b + 0.05) / (a + 0.05);
  });
  expect(contrast, state).toBeGreaterThanOrEqual(4.5);
}

test("tab sets and real record and editor navigation use readable shared styles", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/proposals");
  await expectStraightTabIndicator(page.getByRole("tab", { name: /^All/ }));
  await page.getByRole("tab", { name: /^Drafts/ }).click();
  await expectStraightTabIndicator(page.getByRole("tab", { name: /^Drafts/ }));
  await screenshot(page, "proposal-tabs-1440");

  await page.goto(`/proposals/${f.draft.id}?view=record`);
  const edit = page.getByRole("link", { name: "Edit", exact: true });
  await edit.hover();
  await expectReadable(edit, "Record Edit hover");
  await screenshot(page, "record-edit-hover-1440");

  await page.goto(`/proposals/${f.draft.id}/edit`);
  const back = page.getByRole("link", {
    name: "Back to proposals",
    exact: true,
  });
  await expect(back).toHaveAttribute("href", "/proposals");
  await expect(back.locator("svg.lucide-chevron-left")).toHaveCount(1);
  await back.hover();
  await expect(back).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expectReadable(back, "Editor Proposals link hover");
  const preview = page.getByRole("button", {
    name: "Preview PDF",
    exact: true,
  });
  await expectReadable(preview, "Editor outline button at rest");
  await preview.hover();
  await expectReadable(preview, "Editor outline button hover");
  await back.hover();
  // The editor sidebar tabs are a segmented control: no underline.
  await expectNoTabUnderline(
    page.getByRole("tab", { name: "Quote", exact: true }),
  );
  await screenshot(page, "editor-proposals-hover-1440");

  await page.goto("/studio/templates");
  await expectStraightTabIndicator(
    page
      .getByRole("navigation", { name: "Templates and saved blocks" })
      .locator('[aria-current="page"]'),
  );
  await page.goto("/studio/emails");
  await expectStraightTabIndicator(
    page
      .getByRole("tablist", { name: "Email audiences" })
      .locator('[aria-selected="true"]'),
  );
});

test("button variants keep their text readable in hover, active and focus on paper and ink", async ({
  page,
}) => {
  await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/proposals");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const matrix = page.locator("#button-state-check");
  const variants = {
    filledInk: "btn studio-primary",
    filledClay: "btn action",
    outline: "btn secondary",
    ghostIcon: "btn ghost icon-only",
  };
  await page
    .locator(".staff-foundation.ink-clay")
    .evaluate((root, variants) => {
      const matrix = document.createElement("div");
      matrix.id = "button-state-check";
      Object.assign(matrix.style, {
        position: "fixed",
        inset: "80px 100px auto auto",
        zIndex: "9999",
      });
      for (const surface of ["paper", "ink"]) {
        const row = document.createElement("div");
        row.className = surface === "ink" ? "button-on-ink" : "";
        row.style.cssText = `display:flex;gap:10px;padding:10px;background:${surface === "ink" ? "var(--chrome)" : "var(--surface)"}`;
        for (const [name, classes] of Object.entries(variants)) {
          const button = document.createElement("button");
          button.className = classes;
          button.setAttribute("aria-label", `${surface} ${name}`);
          button.textContent = name === "ghostIcon" ? "+" : name;
          row.append(button);
        }
        matrix.append(row);
      }
      root.append(matrix);
    }, variants);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const surface of ["paper", "ink"]) {
      for (const name of Object.keys(variants)) {
        const label = `${surface} ${name}`;
        const button = matrix.getByRole("button", { name: label });
        await button.hover();
        await expectReadable(button, `${theme} ${label} hover`);
        await page.mouse.down();
        await expectReadable(button, `${theme} ${label} active`);
        await page.mouse.up();
        await page.mouse.move(20, 20);
        await page.keyboard.press("Tab");
        await button.focus();
        expect(
          await button.evaluate((el) => el.matches(":focus-visible")),
        ).toBe(true);
        await expectReadable(button, `${theme} ${label} focus`);
      }
    }
  }
});

test("the Sections rail keeps its header inset and shows the page end only during a section drag", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const panel = page.getByRole("complementary", { name: "Sections panel" });
  const collapse = panel.getByRole("button", {
    name: "Collapse Sections sidebar",
  });
  await expect(collapse).toBeVisible();
  const header = panel.locator(".editor-sidebar-header");
  const [h, c] = await Promise.all([
    header.boundingBox(),
    collapse.boundingBox(),
  ]);
  expect(c!.y - h!.y).toBeGreaterThanOrEqual(10);
  expect(h!.y + h!.height - c!.y - c!.height).toBeGreaterThanOrEqual(10);
  expect(h!.x + h!.width - c!.x - c!.width).toBeGreaterThanOrEqual(12);
  expect(
    await header.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(await panel.evaluate((el) => getComputedStyle(el).backgroundColor));
  const sections = panel.getByRole("navigation", { name: "Sections" });
  const first = sections.getByRole("button", {
    name: "First section",
    exact: true,
  });
  const last = sections.getByRole("button", {
    name: "Second section",
    exact: true,
  });
  await expect(last).toBeVisible();
  await expect(
    sections.locator(".outline-page-end button, .outline-page-end[tabindex]"),
  ).toHaveCount(0);
  await sections.locator(".outline-page-end").last().hover();
  await expect(sections.getByText(/Move to end of page/)).toHaveCount(0);
  await screenshot(page, "sections-boundary-1440");

  await first.hover();
  const handle = sections.getByRole("button", {
    name: "Drag section First section",
  });
  const start = (await handle.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + 12,
    start.y + start.height / 2,
    { steps: 4 },
  );
  const pageEnd = last
    .locator("xpath=ancestor::*[@data-outline-page]")
    .locator(".outline-page-end");
  await expect(pageEnd).toHaveText(/Move to end of page/);
  const end = (await pageEnd.boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 10,
  });
  await screenshot(page, "sections-drag-1440");
  await page.mouse.up();
  await expect(sections.getByText(/Move to end of page/)).toHaveCount(0);
  await expect
    .poll(() =>
      f
        .active()
        .content.filter((b) => b.type === "heading")
        .map((b) => b.text),
    )
    .toEqual(["Second section", "First section"]);
});

test("round controls and both column insertion buttons fit their boxes", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      { id: "break", type: "page_break" },
      { id: "heading", type: "heading", level: 1, text: "Project scope" },
      {
        id: "layout",
        type: "columns",
        columns: {
          layout: "50-50",
          gap: "m",
          align: "top",
          items: [
            {
              id: "first-col",
              style: { border: "thin", padding: "m" },
              content: [
                {
                  id: "first-paragraph",
                  type: "paragraph",
                  text: "The first column introduces the project. We’ll agree the launch plan and the people who will review it.",
                },
              ],
            },
            {
              id: "second-col",
              style: { border: "thin" },
              content: [
                {
                  id: "second-paragraph",
                  type: "paragraph",
                  text: "The second column covers delivery. We’ll plan for a clear handoff and document the decisions.",
                },
              ],
            },
          ],
        },
      },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const column = page.getByRole("group", { name: "Column 1", exact: true });
  await column.locator(".tiptap").hover();
  const controls = column.locator(".editor-gutter-add:visible");
  await expect(controls).toHaveCount(2);
  const frame = (await column.locator(".block-frame").boundingBox())!;
  for (const control of await controls.all()) {
    const [button, box] = await Promise.all([
      control.boundingBox(),
      column.boundingBox(),
    ]);
    expect(button!.width).toBe(button!.height);
    expect(button!.x).toBeGreaterThan(box!.x + box!.width - 26);
    expect(button!.x).toBeGreaterThan(frame.x + frame.width + 1.5);
    expect(button!.y).toBeGreaterThan(box!.y + 1);
    expect(button!.x + button!.width).toBeLessThan(box!.x + box!.width - 1);
    expect(button!.y + button!.height).toBeLessThan(box!.y + box!.height - 1);
    await expect(control).toHaveCSS("aspect-ratio", "1 / 1");
    await expect(control).toHaveCSS("flex-shrink", "0");
  }
  await screenshot(page, "column-add-buttons-1440");
  await controls.first().click();
  await expect(page.locator(".block-popover:popover-open")).toBeVisible();
  await page.keyboard.press("Escape");
  const compact = page.getByRole("group", { name: "Column 2", exact: true });
  await compact.locator(".tiptap").hover();
  const compactControls = compact.locator(".editor-gutter-add:visible");
  await expect(compactControls).toHaveCount(2);
  const bounds = (await compact.boundingBox())!;
  for (const control of await compactControls.all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBe(box.height);
    expect(box.x).toBeGreaterThan(bounds.x);
    expect(box.x + box.width).toBeLessThan(bounds.x + bounds.width);
  }
});
