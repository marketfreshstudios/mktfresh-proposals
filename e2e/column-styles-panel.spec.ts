import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import type { Block } from "../src/lib/model";
import type { BlockStyle } from "../src/lib/block-style";
import { changeColumnLayout, createColumns } from "../src/lib/columns";
import { editorFixture } from "./editor-fixture";

const evidence = "docs/screenshots/column-styles";
const sourceStyle = {
  background: "neutral",
  padding: "m",
  radius: "s",
} as const;
const text = (id: string, copy: string, style?: BlockStyle): Block => ({
  id,
  type: "paragraph",
  text: copy,
  style,
});
async function fixture(page: Page, phone = false, template = false) {
  await page.setViewportSize({
    width: phone ? 375 : 1440,
    height: phone ? 812 : 1160,
  });
  const columns = changeColumnLayout(createColumns(), "33-33-33");
  const content = [
    { id: "break", type: "page_break" },
    {
      id: "title",
      type: "heading",
      level: 1,
      text: "Everything your new site needs",
    },
    text("intro", "Three parts, one team. Here’s what each covers.", {
      margin_below: "l",
    }),
    {
      id: "columns",
      type: "columns",
      columns: {
        ...columns,
        items: columns.items.map((column, i) => ({
          ...column,
          id: `column-${i + 1}`,
          style:
            i === 0
              ? sourceStyle
              : i === 1
                ? { border: "thin", margin_above: "s" }
                : undefined,
          content: [
            {
              id: `head-${i}`,
              type: "heading",
              level: 2,
              text: ["Design", "Build", "Care"][i],
            },
            text(
              `text-${i}`,
              [
                "A custom design built around how patients book.",
                "Pages that load fast on phones, with your booking system connected.",
                "Updates, backups and security after launch.",
              ][i],
            ),
          ],
        })),
      },
    },
    text(
      "last",
      "You’ll work with the same small team from the first call to launch day, and after.",
    ),
    text("source", "A block with its own style.", {
      ...sourceStyle,
      border: "medium",
      border_color: "#344455",
    }),
    {
      id: "contract",
      type: "contract",
      text: "Statement of Work",
      clauses: [],
    },
    { id: "signature", type: "signature_block", role: "client" },
  ] satisfies Block[];
  const f = await editorFixture(page, false, { content });
  f.settings.brand_palette = ["#e3d6bf", "#d3e1e5"];
  const seed = (await f.repo.entities<any>("templates"))[0];
  await page.goto(
    template ? `/studio/templates/${seed.id}` : `/proposals/${f.draft.id}/edit`,
  );
  const paper = page.locator(
    template ? ".template-paged-paper" : ".editor-paper",
  );
  const grid = paper.getByRole("region", { name: "Columns", exact: true });
  const group = (n: number) =>
    grid.getByRole("group", { name: `Column ${n}`, exact: true });
  const select = async (n: number) => {
    await group(n).scrollIntoViewIfNeeded();
    await group(n)
      .getByRole("button", { name: `Select Column ${n}`, exact: true })
      .press("Enter");
  };
  const styles = page.getByRole("tabpanel", { name: "Styles", exact: true });
  const columnStyle = (n: number) =>
    f.active().content.find((block) => block.id === "columns")?.columns?.items[
      n - 1
    ].style;
  return { f, paper, grid, group, select, styles, columnStyle };
}
const radio = (root: Locator, group: string, option: string) =>
  root
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name: option, exact: true });
async function choose(root: Locator, group: string, option: string) {
  const item = radio(root, group, option);
  await item.locator("..").click();
  await expect(item).toBeChecked();
}
async function capture(page: Page, id: string) {
  if (!process.env.CAPTURE_COLUMN_STYLES) return;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/${id}.png`,
    animations: "disabled",
  });
}
const panelButton = (panel: Locator, name: string) =>
  panel.getByRole("button", { name, exact: true });

async function expectStackedControls(root: Locator, names: string[]) {
  for (const name of names) {
    const control = root.getByRole("radiogroup", { name, exact: true });
    await expect(control).toBeVisible();
    const layout = await control.evaluate((el) => {
      const row = el.closest(".column-style-row")!;
      const container = row.parentElement!;
      const css = getComputedStyle(container);
      const contentWidth =
        container.clientWidth -
        parseFloat(css.paddingLeft) -
        parseFloat(css.paddingRight);
      const label = row.querySelector(".column-style-label")!;
      const bounds = el.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      const options = [...el.querySelectorAll(":scope > label")].map(
        (item) => item.getBoundingClientRect().width,
      );
      return {
        widthDifference: Math.abs(bounds.width - contentWidth),
        labelGap: bounds.top - labelBounds.bottom,
        widthRange: Math.max(...options) - Math.min(...options),
        labelSize: getComputedStyle(label.querySelector("strong")!).fontSize,
        labelWeight: getComputedStyle(label.querySelector("strong")!)
          .fontWeight,
      };
    });
    expect(layout.widthDifference, name).toBeLessThanOrEqual(2);
    expect(layout.labelGap, name).toBeCloseTo(8, 0);
    expect(layout.widthRange, name).toBeLessThanOrEqual(1);
    expect(layout.labelSize, name).toBe("13px");
    expect(layout.labelWeight, name).toBe("600");
  }
}

async function expectColumnSegmentsAndReset(panel: Locator) {
  const tabs = panel.getByRole("tablist", { name: "Columns" });
  const selected = tabs.getByRole("tab", { selected: true });
  expect(
    await selected.evaluate((el) => getComputedStyle(el, "::after").content),
  ).toBe("none");
  await expect(tabs).toHaveCSS("box-shadow", "none");
  const tabsGeometry = await tabs.evaluate((el) => {
    const widths = [...el.children].map(
      (tab) => tab.getBoundingClientRect().width,
    );
    return {
      range: Math.max(...widths) - Math.min(...widths),
      inset: Math.abs(
        el.getBoundingClientRect().width - el.parentElement!.clientWidth,
      ),
    };
  });
  expect(tabsGeometry.range).toBeLessThanOrEqual(1);
  expect(tabsGeometry.inset).toBeLessThanOrEqual(2);
  const reset = panelButton(panel, "Reset");
  await expect(reset).toHaveCSS("text-decoration-line", "underline");
  await expect(reset).toHaveCSS("border-width", "0px");
  await expect(reset).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(
    await reset.evaluate((el) =>
      Math.abs(
        el.getBoundingClientRect().right -
          el.parentElement!.getBoundingClientRect().right,
      ),
    ),
  ).toBeLessThanOrEqual(2);
}

async function expectFocusRing(control: Locator, textOnly = false) {
  await expect(control).toBeFocused();
  const result = await control.evaluate((el, text) => {
    const style = getComputedStyle(el);
    const paint = text ? el.querySelector("span")! : el;
    const ring = getComputedStyle(paint);
    const shared = document.createElement("i");
    shared.style.outline = "var(--focus-outline)";
    el.append(shared);
    const expected = getComputedStyle(shared);
    const matchesToken =
      ring.outlineColor === expected.outlineColor &&
      ring.outlineStyle === expected.outlineStyle &&
      ring.outlineWidth === expected.outlineWidth;
    shared.remove();
    return {
      visible: el.matches(":focus-visible"),
      matchesToken,
      radius: ring.borderRadius,
      controlRadius: style.borderRadius,
      compact:
        !text ||
        (style.outlineStyle === "none" &&
          paint.getBoundingClientRect().height <
            el.getBoundingClientRect().height),
    };
  }, textOnly);
  expect(result).toEqual({
    visible: true,
    matchesToken: true,
    radius: result.controlRadius,
    controlRadius: result.controlRadius,
    compact: true,
  });
  return result.radius;
}

test("focus follows the shape of the column tab, text links and pill buttons", async ({
  page,
}) => {
  const { select, styles, group } = await fixture(page);
  await select(1);
  const label = panelButton(group(1), "Select Column 1");
  const radius = await expectFocusRing(label);
  expect(radius.split(" ").slice(-2)).toEqual(["0px", "0px"]);
  const toolbar = page.getByRole("toolbar", { name: "Column 1 tools" });
  for (const control of [
    panelButton(toolbar, "Style"),
    panelButton(styles, "Copy style"),
    styles.getByRole("tab", { name: "Column 1", exact: true }),
  ]) {
    await control.focus();
    await expectFocusRing(control);
  }
  for (const name of ["Columns", "Custom background color"]) {
    const link = panelButton(styles, name);
    await link.focus();
    expect(await expectFocusRing(link, true)).toBe("0px");
  }
});

test("column selection writes the existing style fields and returns to proposal scope", async ({
  page,
}) => {
  const { styles, group, columnStyle, paper } = await fixture(page);
  await group(1).click({ position: { x: 8, y: 8 } });
  await expect(radio(styles, "Styles scope", "Selection")).toBeChecked();
  await expect(
    page.getByRole("dialog", { name: /^(Column|Block) style$/ }),
  ).toHaveCount(0);
  const card = panelButton(
    styles,
    "Columns layout 33 / 33 / 33 | medium gap | top",
  );
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(panelButton(styles, "Paste style")).toBeDisabled();
  await expect(panelButton(styles, "Paste style")).toHaveAttribute(
    "title",
    "Copy a style first",
  );
  await expect(panelButton(group(1), "Select Column 1")).toHaveCSS(
    "outline-style",
    "none",
  );
  await expectStackedControls(styles, [
    "Column layout",
    "Column gap",
    "Align columns",
    "Padding",
    "Border",
    "Corner radius",
  ]);
  await expectColumnSegmentsAndReset(styles);
  const tiles = styles.getByRole("radiogroup", { name: "Column layout" });
  await expect(tiles.getByRole("radio")).toHaveCount(4);
  expect(await tiles.innerText()).toBe("");
  const shapes = await tiles.evaluate((el) =>
    [...el.querySelectorAll("label")].map((tile) =>
      [...tile.querySelectorAll("i")].map(
        (shape) => shape.getBoundingClientRect().width,
      ),
    ),
  );
  expect(shapes.map((tile) => tile.length)).toEqual([2, 2, 2, 3]);
  expect(shapes.flat().every((width) => width > 8)).toBe(true);
  await expect(
    tiles.getByRole("radio", { name: "33 / 33 / 33" }),
  ).toBeChecked();
  const [cardBounds, breadcrumbBounds, backgroundBounds] = await Promise.all([
    card.locator("..").boundingBox(),
    styles.locator(".column-style-breadcrumb").boundingBox(),
    styles.locator(".column-color-row").first().boundingBox(),
  ]);
  expect(Math.abs(cardBounds!.x - backgroundBounds!.x)).toBeLessThanOrEqual(2);
  expect(
    Math.abs(breadcrumbBounds!.x - backgroundBounds!.x),
  ).toBeLessThanOrEqual(2);
  await capture(page, "1a-column-selected");
  expect(
    (await new AxeBuilder({ page }).include(".selection-styles").analyze())
      .violations,
  ).toEqual([]);

  await choose(styles, "Column gap", "L");
  await choose(styles, "Align columns", "Center");
  await choose(styles, "Column layout", "33 / 67");
  await choose(styles, "Column layout", "33 / 33 / 33");
  await expect
    .poll(() =>
      group(1).evaluate((el) => [
        getComputedStyle(el.parentElement!).gap,
        getComputedStyle(el.parentElement!).alignItems,
      ]),
    )
    .toEqual(["40px", "center"]);
  await panelButton(
    styles,
    "Columns layout 33 / 33 / 33 | large gap | center",
  ).click();
  await choose(styles, "Styles scope", "This proposal");
  await expect(radio(styles, "Styles scope", "This proposal")).toBeChecked();
  await page
    .getByRole("toolbar", { name: "Column 1 tools" })
    .getByRole("button", { name: "Style", exact: true })
    .click();
  await expect(radio(styles, "Styles scope", "Selection")).toBeChecked();
  await expect(
    panelButton(styles, "Columns layout 33 / 33 / 33 | large gap | center"),
  ).toHaveAttribute("aria-expanded", "false");

  await choose(styles, "Background", "Color 2");
  await expect.poll(() => columnStyle(1)?.background).toBe("#e3d6bf");
  await choose(styles, "Background", "Primary");
  await expect.poll(() => columnStyle(1)?.background).toMatch(/^#/);
  await panelButton(styles, "Custom background color").click();
  const picker = page.getByRole("dialog", { name: "Background color picker" });
  await picker.getByRole("textbox", { name: "Hex color" }).fill("#e4d1bc");
  await panelButton(picker, "Done").click();
  await expect.poll(() => columnStyle(1)?.background).toBe("#e4d1bc");
  await choose(styles, "Padding", "L");
  await expect.poll(() => columnStyle(1)?.padding).toBe("l");
  await expect(
    styles.getByRole("radiogroup", { name: "Border color" }),
  ).toHaveCount(0);
  await choose(styles, "Border", "Medium");
  await expect.poll(() => columnStyle(1)?.border).toBe("medium");
  await choose(styles, "Border color", "Primary");
  await expect.poll(() => columnStyle(1)?.border_color).toMatch(/^#/);
  await choose(styles, "Corner radius", "M");
  await expect.poll(() => columnStyle(1)?.radius).toBe("m");
  await choose(styles, "Above", "0");
  await choose(styles, "Below", "S");
  await expect
    .poll(() => [columnStyle(1)?.margin_above, columnStyle(1)?.margin_below])
    .toEqual(["none", "s"]);
  await choose(styles, "Above", "Auto");
  await choose(styles, "Below", "Auto");
  await expect
    .poll(() => [columnStyle(1)?.margin_above, columnStyle(1)?.margin_below])
    .toEqual([undefined, undefined]);
  await group(1).locator('[data-block-id="block-text-0"] .tiptap').click();
  await expect(
    page.getByRole("toolbar", { name: "Column 1 tools" }),
  ).toHaveCount(0);
  await expect(
    paper.getByRole("toolbar", { name: "Text tools" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(radio(styles, "Styles scope", "This proposal")).toBeChecked();
  await expect(radio(styles, "Styles scope", "Selection")).toBeDisabled();
});

test("column clipboard replaces styles, names canvas targets, and pastes to all as one undo", async ({
  page,
}) => {
  const { select, styles, group, columnStyle, paper } = await fixture(page);
  await select(1);
  await page.keyboard.press("Control+Alt+c");
  const tabs = styles.getByRole("tablist", { name: "Columns" });
  const column1 = tabs.getByRole("tab", { name: /Column 1/ });
  await expect(column1).toHaveAccessibleName("Column 1 | style copied");
  await column1.press("End");
  await expect(tabs.getByRole("tab", { name: "Column 3" })).toBeFocused();
  await panelButton(
    styles,
    "Columns layout 33 / 33 / 33 | medium gap | top",
  ).click();
  await group(2).hover();
  const hoverPaste = panelButton(group(2), "Paste style into Column 2");
  await expect(hoverPaste).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Column 3 tools" });
  const [barBox, stylesBox] = await Promise.all([
    toolbar.boundingBox(),
    styles.boundingBox(),
  ]);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(stylesBox!.x);
  const [pasteBox, columnBox, labelBox] = await Promise.all([
    hoverPaste.boundingBox(),
    group(2).boundingBox(),
    panelButton(group(2), "Select Column 2").boundingBox(),
  ]);
  expect(pasteBox!.y + pasteBox!.height).toBeLessThan(columnBox!.y);
  expect(pasteBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width);
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(pasteBox!.y + 1);
  await expect(group(2)).toHaveCSS("outline-offset", "3px");
  await expect(group(3)).toHaveCSS("outline-offset", "3px");
  await capture(page, "1b-style-copied");
  await panelButton(styles, "Paste to all columns").click();
  await expect
    .poll(() => [columnStyle(1), columnStyle(2), columnStyle(3)])
    .toEqual([sourceStyle, sourceStyle, sourceStyle]);
  const toast = page
    .getByRole("status")
    .filter({ hasText: "Style pasted to Column 2 and Column 3" });
  await expect(toast).toBeVisible();
  await capture(page, "1c-paste-all");
  await panelButton(toast, "Undo").click();
  await expect
    .poll(() => [columnStyle(1), columnStyle(2), columnStyle(3)])
    .toEqual([sourceStyle, { border: "thin", margin_above: "s" }, undefined]);

  await page.keyboard.press("Escape");
  await group(2).hover();
  await expect(
    group(2).getByRole("toolbar", { name: "Text tools" }),
  ).toBeHidden();
  await hoverPaste.click();
  await expect.poll(() => columnStyle(2)).toEqual(sourceStyle);
  await select(3);
  await page.keyboard.press("Meta+Alt+c");
  await select(2);
  await page.keyboard.press("Control+Alt+v");
  await expect.poll(() => columnStyle(2)).toBeUndefined();

  await select(1);
  const bar = page.getByRole("toolbar", { name: "Column 1 tools" });
  await panelButton(bar, "Copy style").click();
  await panelButton(bar, "More column 1 actions").click();
  await expect(
    page.getByRole("menuitem", { name: "Apply this style to all columns" }),
  ).toBeVisible();
  if (process.env.CAPTURE_COLUMN_STYLES)
    await expect(page.locator(".style-paste-toast")).toHaveCount(0, {
      timeout: 7000,
    });
  await capture(page, "1d-column-menu");
  await page.keyboard.press("Escape");
  await panelButton(styles, "Columns").click();
  await expect(styles.getByText("Group box")).toBeVisible();
  const [introBox, layoutBox] = await Promise.all([
    styles
      .getByText("Layout for the whole group. Style each column below.")
      .boundingBox(),
    styles.getByText("Layout", { exact: true }).boundingBox(),
  ]);
  expect(
    layoutBox!.y - (introBox!.y + introBox!.height),
  ).toBeGreaterThanOrEqual(12);
  await expectStackedControls(styles, [
    "Column layout",
    "Column gap",
    "Align columns",
  ]);
  await capture(page, "1e-columns-scope");
  await choose(styles, "Column gap", "S");
  await choose(styles, "Align columns", "Center");
  await choose(styles, "Column layout", "50 / 50");
  await panelButton(styles, "Match all to Column 1").click();
  await expect.poll(() => columnStyle(2)).toEqual(sourceStyle);
  await panelButton(styles, "Add").click();
  await choose(styles, "Padding", "M");
  await expect(
    paper.locator('[data-block-id="block-columns"] > .block-content'),
  ).toHaveCSS("padding-top", "24px");
});

test("the same clipboard works across blocks and strips restricted style on legal blocks", async ({
  page,
}) => {
  const { f, paper, select, columnStyle } = await fixture(page);
  await paper.locator('[data-block-id="block-source"]').focus();
  await page.keyboard.press("Control+Alt+c");
  await select(2);
  await page.keyboard.press("Control+Alt+v");
  const copied = { ...sourceStyle, border: "medium", border_color: "#344455" };
  await expect.poll(() => columnStyle(2)).toEqual(copied);
  for (const [id, label] of [
    ["contract", "contracts"],
    ["signature", "signatures"],
  ]) {
    await paper.locator(`[data-block-id="block-${id}"]`).focus();
    await page.keyboard.press("Control+Alt+v");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: `Background and border don't apply to ${label}.` }),
    ).toBeVisible();
    await expect
      .poll(() => f.active().content.find((block) => block.id === id)?.style)
      .toEqual({ padding: "m" });
  }
});

test("Studio templates use the same column panel", async ({ page }) => {
  const { select, styles } = await fixture(page, false, true);
  await select(1);
  await expect(radio(styles, "Styles scope", "Selection")).toBeChecked();
  await choose(styles, "Padding", "L");
  await page.keyboard.press("Escape");
  await expect(radio(styles, "Styles scope", "This template")).toBeChecked();
});

test("phone column style sheet keeps copy and paste handy and groups the remaining options", async ({
  page,
}) => {
  const { select, columnStyle } = await fixture(page, true);
  await select(1);
  const sheet = page.getByRole("dialog", { name: "Column style" });
  await expect(sheet).toBeVisible();
  await expect(
    page
      .locator('.editor-paper [data-phone-section-active="true"]')
      .getByText("Everything your new site needs", { exact: true }),
  ).toBeVisible();
  const bounds = (await sheet.boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(375);
  expect(bounds.y + bounds.height).toBeCloseTo(812, 0);
  await expect(
    sheet.getByRole("radiogroup", { name: "Border", exact: true }),
  ).toBeHidden();
  await expect(
    sheet.getByRole("heading", { name: "Column style" }),
  ).toBeFocused();
  await expectStackedControls(sheet, ["Padding"]);
  await capture(page, "1f-phone-copy");
  await page.keyboard.press("Tab");
  expect(await expectFocusRing(panelButton(sheet, "Close Styles"))).toBe("50%");
  await panelButton(sheet, "Copy style").click();
  await sheet.getByRole("tab", { name: "Column 2" }).click();
  const paste = panelButton(sheet, "Paste style from Column 1");
  await expect(paste).toBeEnabled();
  await expect(panelButton(sheet, "Paste to all columns")).toBeVisible();
  await expect(panelButton(sheet, "Copy style")).toHaveCount(0);
  expect((await paste.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await capture(page, "1f-phone-paste");
  expect(
    (await new AxeBuilder({ page }).include("[data-style-sheet]").analyze())
      .violations,
  ).toEqual([]);
  await paste.click();
  await expect.poll(() => columnStyle(2)).toEqual(sourceStyle);
  await sheet.getByText("More options", { exact: true }).click();
  await expect(
    sheet.getByRole("radiogroup", { name: "Border", exact: true }),
  ).toBeVisible();
  await expectStackedControls(sheet, ["Border", "Corner radius"]);
  await expectColumnSegmentsAndReset(sheet);
});
