import { test, expect, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import {
  test3Content,
  test3Fonts,
  test3Title,
} from "./editor-alignment-fixture";

const logo =
  '<svg xmlns="http://www.w3.org/2000/svg" width="682" height="180"><rect width="682" height="180" fill="#777"/></svg>';
const frames = (page: Page) =>
  page.locator(".editor-paper").evaluate((root) => ({
    plan: root.getAttribute("data-pagination"),
    assignments: root.getAttribute("data-page-assignments"),
    blocks: [...root.querySelectorAll<HTMLElement>(".draft-block")].map(
      (el) => ({ id: el.id, height: el.getBoundingClientRect().height }),
    ),
  }));
const paint = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
async function test3(page: Page) {
  const f = await editorFixture(page, false, { content: test3Content() });
  f.settings.proposal_fonts = test3Fonts;
  f.settings.logo = "neutral-regression-logo";
  await f.repo.put("workspace_settings", f.settings);
  await f.editRemote({
    title: test3Title,
    style_overrides: { density: "standard" },
  });
  await page.route("**/preview-logo", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: logo }),
  );
  return f;
}

test("TEST 3 assets settle before interaction; every block retains its pages, frame and text extent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await test3(page);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/preview-logo", async (route) => {
    await held;
    await route.fulfill({ contentType: "image/svg+xml", body: logo });
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-paper")).toHaveAttribute(
    "data-layout-assets-ready",
    "false",
  );
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "false",
  );
  await expect(page.locator(".editor-paper > .document-cover")).toHaveCSS(
    "opacity",
    "0",
  );
  await expect(page.locator(".document-page-count")).not.toHaveAttribute(
    "data-page-count",
  );
  release();
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  await paint(page);
  const baseline = await frames(page);
  expect(JSON.parse(baseline.plan!).pages).toBeGreaterThan(1);
  expect(JSON.parse(baseline.plan!).starts[0]).toMatchObject({
    block: "regression-9",
    offset: 229,
    paragraph: 6,
  });
  // Real pointer selection, text focus and Escape all exercise the shared chrome.
  for (const block of f.content) {
    const frame = page.locator(`[data-block-id="block-${block.id}"]`);
    await frame.scrollIntoViewIfNeeded();
    await frame.click({ position: { x: 5, y: 5 } });
    await expect(frame).toHaveAttribute("data-selected", "true");
    if (await frame.locator(".tiptap").count())
      await frame.locator(".tiptap").focus();
    await paint(page);
    expect(await frames(page)).toEqual(baseline);
    await page.keyboard.press("Escape");
    await paint(page);
    expect(await frames(page)).toEqual(baseline);
  }
  // Every line belongs to one row; no following paragraph overlaps a continuation.
  const geometry = await page.locator(".editor-paper").evaluate((root) => {
    const rows: { left: number; right: number; top: number; bottom: number }[] =
      [];
    const extents: number[] = [];
    for (const editor of root.querySelectorAll<HTMLElement>(
      ".block-frame .tiptap",
    )) {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      let last = editor.getBoundingClientRect().top;
      while ((node = walker.nextNode())) {
        if (
          node.parentElement?.closest(
            "[data-editor-chrome],[data-pagination-spacer]",
          )
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;
          last = Math.max(last, rect.bottom);
          // Inline marks can share one line; merge their touching boxes.
          const row = rows.find(
            (r) =>
              Math.abs(r.top - rect.top) < 1 &&
              rect.left <= r.right + 1 &&
              rect.right >= r.left - 1,
          );
          if (row) {
            row.left = Math.min(row.left, rect.left);
            row.right = Math.max(row.right, rect.right);
            row.bottom = Math.max(row.bottom, rect.bottom);
          } else
            rows.push({
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            });
        }
      }
      const trailing = editor.lastElementChild;
      if (trailing && !trailing.textContent?.trim())
        last = Math.max(last, trailing.getBoundingClientRect().bottom);
      // Font glyph boxes are shorter than their line box, by up to one line-height.
      extents.push(editor.getBoundingClientRect().bottom - last);
    }
    const overlaps = rows.flatMap((a, i) =>
      rows
        .slice(i + 1)
        .filter(
          (b) =>
            Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
            Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1,
        ),
    );
    return { overlaps, extents };
  });
  expect(geometry.overlaps).toEqual([]);
  for (const emptyTail of geometry.extents)
    expect(emptyTail).toBeLessThanOrEqual(12);
  expect(f.patches).toHaveLength(0);
});

test("Quote alignment retains optional, sub-line and recurring Details controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  const panel = page.locator(".editor-v2-panel");
  const body = panel.locator(".quote-row-body").first();
  await expect(
    body.getByRole("textbox", { name: "Item name", exact: true }),
  ).toHaveCSS("height", "36px");
  await expect(
    body.getByPlaceholder("Description", { exact: true }),
  ).toBeVisible();
  await expect(body.getByText("Description", { exact: true })).toHaveCount(0);
  await expect(
    body.getByText("Shown as the item price", { exact: true }),
  ).toBeVisible();
  await expect(
    body.getByRole("textbox", { name: /^Sub-line label for/ }),
  ).toHaveCount(0);
  const optional = body.getByRole("switch", { name: "Optional", exact: true });
  if (await optional.isChecked()) await optional.uncheck();
  await expect(
    body.getByRole("combobox", { name: "Link as alternative", exact: true }),
  ).toHaveCount(0);
  await optional.check();
  await expect(
    body.getByRole("combobox", { name: "Link as alternative", exact: true }),
  ).toBeVisible();
  await body.getByRole("button", { name: "+ Sub-line", exact: true }).click();
  await expect(
    body.getByRole("textbox", { name: /^Sub-line label for/ }),
  ).toHaveCount(2);
  await body.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    body.getByRole("combobox", { name: "Custom family", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "+ Custom", exact: true }).click();
  const custom = panel.locator(".quote-row-body");
  await expect(
    custom.getByRole("combobox", { name: "Custom family", exact: true }),
  ).toHaveCount(0);
  await custom
    .getByRole("combobox", { name: /Interval/ })
    .selectOption("month");
  await expect(
    custom.getByRole("combobox", { name: "Custom family", exact: true }),
  ).toHaveCount(0);
  await custom.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    custom.getByRole("combobox", { name: "Custom family", exact: true }),
  ).toBeVisible();
  const handles = await panel.locator(".quote-row").evaluateAll((rows) =>
    rows.map((row) => {
      const handle = row
        .closest(".quote-sortable")
        ?.querySelector<HTMLElement>(":scope > .drag-handle");
      const label = row.querySelector(".quote-row-caption");
      const a = handle?.getBoundingClientRect(),
        b = label?.getBoundingClientRect(),
        r = row.getBoundingClientRect();
      return {
        name: label?.textContent,
        handle: a?.toJSON(),
        label: b?.toJSON(),
        row: r.toJSON(),
      };
    }),
  );
  for (const item of handles) {
    if (!item.handle || !item.label || item.handle.width === 0) continue;
    expect(item.handle.left, JSON.stringify(item)).toBeGreaterThanOrEqual(
      item.row.left,
    );
    expect(item.handle.right, JSON.stringify(item)).toBeLessThanOrEqual(
      item.label.left,
    );
  }
});

test("Fields, Styles, Send and headingless Sections match the measured panel hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page, false, {
    content: [
      { id: "overview", type: "heading", text: "Overview", level: 1 },
      { id: "paragraph", type: "paragraph", text: "A useful launch plan." },
      { id: "break", type: "page_break" },
      { id: "pricing", type: "pricing_table" },
      { id: "break2", type: "page_break" },
      { id: "signatures", type: "signature_block", role: "client" },
      { id: "company-signature", type: "signature_block", role: "company" },
    ],
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const nav = page.getByRole("navigation", { name: "Sections", exact: true });
  await expect(
    nav.getByRole("button", { name: "Investment", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: "Signatures", exact: true }),
  ).toBeVisible();
  for (const button of await nav.locator(".outline-section").all()) {
    await button.hover();
    const geometry = await button.evaluate((el) => {
      const handle = el.parentElement?.classList.contains("quote-sortable")
        ? el.parentElement.querySelector<HTMLElement>(":scope > .drag-handle")
        : null;
      const text = el.querySelector(".section-label")!;
      const a = handle?.getBoundingClientRect(),
        b = text.getBoundingClientRect();
      return {
        hasHandle: !!a,
        separate: !a || a.right <= b.left,
        visibleHandles: [
          ...el.closest("nav")!.querySelectorAll(".drag-handle"),
        ].filter((h) => getComputedStyle(h).opacity === "1").length,
      };
    });
    expect(geometry.separate).toBe(true);
    expect(geometry.visibleHandles).toBeLessThanOrEqual(1);
  }
  for (const group of await nav.locator(".outline-page").all())
    expect(await group.locator(".outline-section").count()).toBeGreaterThan(0);
  const panel = page.locator(".editor-v2-panel");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(panel.locator(".fields-hint")).toHaveText(
    "Click into a paragraph, then choose a field to insert it. Or type {{ in any paragraph.",
  );
  await expect(
    panel.getByRole("searchbox", { name: "Search fields" }),
  ).toHaveAttribute("placeholder", "Search fields");
  await expect(panel.locator(".field-search label")).toHaveCount(0);
  const first = panel.getByRole("button", {
    name: "Client first name — {{client.first_name}}",
    exact: true,
  });
  await expect(first).toContainText("First name");
  await expect(first).not.toContainText("Client first name");
  await panel.getByRole("tab", { name: "Styles", exact: true }).click();
  await panel.getByText("Text styles", { exact: true }).click();
  await panel.getByText("Page & margins", { exact: true }).click();
  await expect(
    panel.getByRole("spinbutton", { name: "Page margin top", exact: true }),
  ).toHaveCSS("height", "34px");
  await expect(
    panel.getByRole("combobox", { name: "Text level", exact: true }),
  ).toHaveCSS("height", "38px");
  await expect(
    panel.locator(".proposal-styles .style-accordion-body > hr").first(),
  ).toHaveCSS("height", "1px");
  await expect(panel.getByRole("group", { name: "Density choices" })).toHaveCSS(
    "padding",
    "3px",
  );
  await panel.getByRole("tab", { name: "Send", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "Ready to send?" }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("textbox", { name: "To", exact: true }),
  ).toHaveAttribute("readonly", "");
  await expect(
    panel.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveCSS("height", "38px");
  await expect(
    panel.getByRole("button", { name: "Send to Jane", exact: true }),
  ).toHaveCSS("background-color", "rgb(19, 48, 58)");
  const darkBorders = await panel
    .locator("input:not([type=checkbox],[type=radio]),select,textarea")
    .evaluateAll((inputs) =>
      inputs
        .filter((el) => {
          if (!el.getClientRects().length) return false;
          const s = getComputedStyle(el);
          if (s.borderTopStyle === "none" || parseFloat(s.borderTopWidth) === 0)
            return false;
          const rgb = s.borderTopColor.match(/\d+/g)?.map(Number) ?? [];
          return (
            rgb.length >= 3 &&
            rgb.slice(0, 3).some((v, i) => v < [221, 216, 206][i])
          );
        })
        .map((el) => el.getAttribute("aria-label") || el.tagName),
    );
  expect(darkBorders).toEqual([]);
});

test("edit bar and insertion/style menus use the measured prototype typography", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await f.editRemote({
    content: f.content.map((b, n) =>
      n === 1
        ? { ...b, ai_review: { source: "assistant", reviewed: false } }
        : b,
    ),
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const block = page.locator(`[data-block-id="block-${f.content[1].id}"]`);
  await block.locator(".tiptap").focus();
  const bar = page.getByRole("toolbar", { name: "Text tools", exact: true });
  await expect(
    bar.getByRole("button", { name: "Bold", exact: true }).locator("b"),
  ).toHaveCSS("font-size", "14px");
  const italic = bar
    .getByRole("button", { name: "Italic", exact: true })
    .locator("i");
  await expect(italic).toHaveCSS("font-size", "16px");
  await expect(italic).toHaveCSS("font-family", /Source Serif 4/);
  await expect(
    bar.getByRole("button", { name: "Save for reuse", exact: true }),
  ).toHaveCSS("font-size", "12px");
  await expect(
    block.getByRole("button", {
      name: "Mark this AI-written block reviewed",
      exact: true,
    }),
  ).toHaveCSS("font-size", "13px");
  await bar.getByRole("button", { name: "Text style", exact: true }).click();
  for (const [name, size] of [
    ["Paragraph", "14px"],
    ["Heading 1", "17px"],
    ["Heading 2", "15px"],
    ["Heading 3", "13px"],
  ]) {
    await expect(
      page.getByRole("menuitemradio", { name, exact: true }),
    ).toHaveCSS("font-size", size);
    await expect(
      page.getByRole("menuitemradio", { name, exact: true }),
    ).toHaveCSS("min-height", "38px");
  }
  await page.keyboard.press("Escape");
  await block
    .getByRole("button", { name: "Add a block above", exact: true })
    .click();
  const menu = page.getByRole("dialog", { name: "Add a block", exact: true });
  await expect(
    menu.getByRole("searchbox", { name: "Search blocks", exact: true }),
  ).toHaveCSS("height", "36px");
  await expect(menu.locator(".editor-block-menu-heading")).toHaveCSS(
    "font-size",
    "13px",
  );
  await expect(
    menu.getByRole("heading", { name: "Text", exact: true }),
  ).toHaveCSS("font-size", "11px");
});
