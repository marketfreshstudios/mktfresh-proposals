import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { editorFixture } from "./editor-fixture";
import { changeColumnLayout, createColumns } from "../src/lib/columns";
import { ProposalService } from "../src/lib/service";
import { printCss, printPageCss } from "../src/lib/document-print";
import { plannedPrintCss } from "../src/lib/planned-print";
import { documentStyleCss, resolveStyles } from "../src/lib/proposal-styles";
import { staff } from "../tests/helpers";
import type { Block, SavedBlock, Template } from "../src/lib/model";

test.use({ actionTimeout: 10000 });
const id = () => crypto.randomUUID();
const heading = (key: string, text: string): Block => ({
  id: key,
  type: "heading",
  text,
  level: 1,
});
const paragraph = (key: string, text: string): Block => ({
  id: key,
  type: "paragraph",
  text,
});
const signatures: Block[] = [
  { id: "pricing", type: "pricing_table" },
  { id: "client-sig", type: "signature_block", role: "client" },
  { id: "company-sig", type: "signature_block", role: "company" },
];
const evidence =
  process.env.COLUMNS_EVIDENCE_DIR ?? "docs/screenshots/columns-block";
const settled = (paper: Locator) =>
  expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
async function shot(page: Page, name: string) {
  if (!process.env.CAPTURE_COLUMNS) return;
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/${name}.png`,
    animations: "disabled",
  });
}
async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  where: "top" | "middle" = "middle",
) {
  await source.scrollIntoViewIfNeeded();
  const s = (await source.boundingBox())!;
  const d = (await target.boundingBox())!;
  const x = d.x + d.width / 2,
    y = d.y + (where === "top" ? 2 : d.height / 2);
  await source.hover();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 14, s.y + s.height / 2, {
    steps: 5,
  });
  await page.mouse.move(x, y, { steps: 18 });
  await page.mouse.move(x + 1, y, { steps: 2 });
  return page.getByRole("status", { name: "Insert block here" });
}
test("Columns layout, add menu, narrowing and unwrap each use one Undo", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      { id: "cover-break", type: "page_break" },
      heading("heading", "Our approach"),
      paragraph("overview", "Here is the recommended approach."),
      ...signatures,
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const paper = page.locator(".editor-paper");
  await settled(paper);
  await paper.locator('[data-block-id="block-overview"] .tiptap').click();
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await page
    .locator(".blocks-panel summary")
    .filter({ hasText: "Proposal" })
    .click();
  await page.getByRole("menuitem", { name: "Columns", exact: true }).click();
  const grid = paper.getByRole("region", { name: "Columns", exact: true });
  const frame = grid.locator(
    "xpath=ancestor::*[contains(@class,'block-frame')][1]",
  );
  const undo = page.getByRole("button", { name: "Undo", exact: true }).first();
  await expect(grid.getByRole("group", { name: /^Column \d$/ })).toHaveCount(2);
  await frame.focus();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  const layout = page.getByRole("radiogroup", { name: "Column layout" });
  const setLayout = (name: string) =>
    layout.getByRole("radio", { name, exact: true }).locator("..").click();
  for (const value of ["33 / 67", "67 / 33", "33 / 33 / 33"]) {
    await setLayout(value);
    await expect(grid.getByRole("group", { name: /^Column \d$/ })).toHaveCount(
      value === "33 / 33 / 33" ? 3 : 2,
    );
  }
  await page.keyboard.press("Escape");
  const third = grid.getByRole("group", { name: "Column 3", exact: true });
  await third.getByRole("button", { name: "Select Column 3" }).press("Enter");
  await third.getByRole("button", { name: "Add block to column 3" }).click();
  const menu = page.locator(".block-popover:popover-open");
  await expect(
    menu.getByRole("menuitem", { name: "Pricing table", exact: true }),
  ).toBeDisabled();
  await expect(menu).toContainText("Pricing tables stay outside columns.");
  await expect(
    menu.getByRole("menuitem", { name: "Columns", exact: true }),
  ).toBeDisabled();
  await menu.getByRole("menuitem", { name: "Text", exact: true }).click();
  await third.locator(".tiptap").fill("Content from column three");
  await frame.focus();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await setLayout("50 / 50");
  await expect(
    grid.getByRole("group", { name: "Column 2", exact: true }),
  ).toContainText("Content from column three");
  await page.keyboard.press("Escape");
  await undo.click();
  await expect(third).toContainText("Content from column three");
  await frame.focus();
  await page.getByRole("button", { name: "Unwrap", exact: true }).click();
  await expect(grid).toHaveCount(0);
  await expect(
    paper.getByText("Content from column three", { exact: true }),
  ).toBeVisible();
  await undo.click();
  await expect(third).toContainText("Content from column three");
});

for (const template of [false, true]) {
  test(`${template ? "Studio" : "proposal"}: saved groups and blocks drop into, between and out of columns`, async ({
    page,
  }) => {
    const columns = changeColumnLayout(createColumns(), "33-67");
    columns.items[1].content = [
      paragraph("right", "A plan for the next six months."),
    ];
    const content: Block[] = [
      { id: "cover-break", type: "page_break" },
      heading("overview", "Overview"),
      paragraph("before", "Keep the following paragraph outside the columns."),
      { id: "columns", type: "columns", columns },
      paragraph("after", "Next steps stay here."),
      ...signatures,
    ];
    const f = await editorFixture(page, false, { content });
    const group: SavedBlock = {
      id: id(),
      name: "Local bookstore case study",
      type: "group",
      block: paragraph(id(), "Case study"),
      blocks: [
        {
          ...heading(id(), "Case study"),
          level: 2,
          style: { background: "neutral" },
        },
        paragraph(
          id(),
          "A local bookstore doubled online reservations in three months.",
        ),
      ],
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
    const prefix = template ? "template-" : "block-";
    const read = async () =>
      template
        ? (await f.repo.entities<Template>("templates"))[0].content
        : f.active().content;
    const columnsContent = async () =>
      (await read())
        .find((b) => b.type === "columns")!
        .columns!.items.map((c) => c.content.map((b) => b.text));
    const undo = page
      .getByRole("button", { name: "Undo", exact: true })
      .first();
    await settled(paper);
    const first = paper.locator(`[data-column-id="${columns.items[0].id}"]`);
    const second = paper.locator(`[data-column-id="${columns.items[1].id}"]`);
    const emptyTarget = first.locator(".column-drop-area");
    await emptyTarget.scrollIntoViewIfNeeded();
    await page.getByRole("tab", { name: "Blocks", exact: true }).click();
    await page
      .locator(".blocks-panel summary")
      .filter({ hasText: "Saved blocks" })
      .click();
    const line = await drag(
      page,
      page
        .getByRole("menuitem")
        .filter({ has: page.getByText(group.name, { exact: true }) }),
      emptyTarget,
    );
    await expect(line).toHaveAttribute("data-drop-column", columns.items[0].id);
    const lineBox = (await line.boundingBox())!,
      bounds = (await first.boundingBox())!;
    expect(lineBox.width).toBeCloseTo(bounds.width, 0);
    await page.mouse.up();
    await expect
      .poll(columnsContent)
      .toEqual([
        [
          "Case study",
          "A local bookstore doubled online reservations in three months.",
        ],
        ["A plan for the next six months."],
      ]);
    await expect
      .poll(
        async () =>
          (await read()).find((b) => b.type === "columns")!.columns!.items[0]
            .content[0].style,
      )
      .toEqual(group.blocks![0].style);
    if (!template) {
      await first.evaluate((node) => node.scrollIntoView({ block: "center" }));
      await page.keyboard.press("Escape");
      await page.mouse.move(1050, 90);
      await shot(page, "columns-33-67-editor-1440");
    }
    await undo.click();
    await expect
      .poll(columnsContent)
      .toEqual([[], ["A plan for the next six months."]]);
    await settled(paper);

    // Heading 1 crosses into a column alone. Its surrounding section stays put.
    const topHeading = paper.locator(`[data-block-id="${prefix}overview"]`);
    await topHeading.focus();
    const topHandle = topHeading
      .locator("xpath=..")
      .getByRole("button", { name: /^Drag block/ });
    await expect(await drag(page, topHandle, emptyTarget)).toHaveAttribute(
      "data-drop-column",
      columns.items[0].id,
    );
    await page.mouse.up();
    await expect
      .poll(columnsContent)
      .toEqual([["Overview"], ["A plan for the next six months."]]);
    await expect
      .poll(async () => (await read()).some((b) => b.id === "before"))
      .toBe(true);
    await settled(paper);

    const child = first.locator(`[data-block-id="${prefix}overview"]`);
    await child.focus();
    await expect(
      await drag(
        page,
        child.locator("xpath=..").getByRole("button", { name: /^Drag block/ }),
        second,
        "top",
      ),
    ).toHaveAttribute("data-drop-column", columns.items[1].id);
    await page.mouse.up();
    await expect
      .poll(columnsContent)
      .toEqual([[], ["Overview", "A plan for the next six months."]]);
    await settled(paper);

    const moved = second.locator(`[data-block-id="${prefix}overview"]`);
    await moved.focus();
    const outside = paper.locator(`[data-block-id="${prefix}before"]`);
    await outside.scrollIntoViewIfNeeded();
    await expect(
      await drag(
        page,
        moved.locator("xpath=..").getByRole("button", { name: /^Drag block/ }),
        outside,
        "middle",
      ),
    ).not.toHaveAttribute("data-drop-column", /.+/);
    await page.mouse.up();
    await expect
      .poll(async () => (await read()).some((b) => b.id === "overview"))
      .toBe(true);
    await undo.click();
    await expect
      .poll(columnsContent)
      .toEqual([[], ["Overview", "A plan for the next six months."]]);
  });
}

/** Read line boxes, since headings and body text have different font ascenders. */
const readColumnEdges = (box: Locator) =>
  box.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scale = rect.width / (element as HTMLElement).offsetWidth;
    const css = getComputedStyle(element);
    return {
      height: rect.height / scale,
      topInset: parseFloat(css.paddingTop) + parseFloat(css.borderTopWidth),
      bottomInset:
        parseFloat(css.paddingBottom) + parseFloat(css.borderBottomWidth),
      columns: Array.from(
        element.querySelectorAll(".document-column"),
        (column) => {
          const lines = Array.from(
            column.querySelectorAll(
              ".block-content > :is(h2,h3,h4),.block-content > .field-editor .tiptap > p,[data-column-block] > :is(h2,h3,h4,p)",
            ),
            (line) => line.getBoundingClientRect(),
          );
          return {
            first: (lines[0].top - rect.top) / scale,
            last: (lines.at(-1)!.bottom - rect.top) / scale,
            bottom: (column.getBoundingClientRect().bottom - rect.top) / scale,
            between: lines[1] ? (lines[1].top - lines[0].bottom) / scale : null,
          };
        },
      ),
    };
  });
function expectContentHeight(
  edges: Awaited<ReturnType<typeof readColumnEdges>>,
) {
  for (const column of edges.columns) {
    expect(Math.abs(column.first - edges.topInset)).toBeLessThanOrEqual(1);
    expect(Math.abs(column.bottom - column.last)).toBeLessThanOrEqual(1);
  }
  expect(
    Math.abs(
      edges.height -
        Math.max(...edges.columns.map((column) => column.last)) -
        edges.bottomInset,
    ),
  ).toBeLessThanOrEqual(1);
  // The heading's gap to the next block is still part of the column.
  expect(edges.columns[0].between).toBeCloseTo(8.75, 0);
}
test("styled Columns share the frozen plan with PDF and desktop client and stack at 375", async ({
  page,
}, testInfo) => {
  const columns = changeColumnLayout(createColumns(), "33-67");
  columns.items[0].content = [
    { ...heading("case-title", "Case study"), style: { margin_above: "l" } },
    {
      ...paragraph(
        "case",
        "Local businesses are easier to find with a clear website.",
      ),
      style: { margin_below: "l" },
    },
  ];
  columns.items[1].content = [
    paragraph(
      "plan",
      "We will design a focused website and track the response.",
    ),
  ];
  columns.items[0].style = {
    margin_above: "s",
    margin_below: "l",
  };
  const f = await editorFixture(page, false, {
    content: [
      { id: "cover-break", type: "page_break" },
      {
        id: "columns",
        type: "columns",
        columns,
        style: {
          background: "neutral",
          padding: "m",
          border: "thin",
          radius: "s",
        },
      },
      ...signatures,
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const paper = page.locator(".editor-paper");
  const grid = paper.getByRole("region", { name: "Columns", exact: true });
  await settled(paper);
  await grid.scrollIntoViewIfNeeded();
  const box = paper.locator('[data-block-id="block-columns"] > .block-content');
  await expect(box).toHaveCSS("padding-top", "24px");
  await expect(box).toHaveCSS("border-top-width", "1px");
  await expect(box).toHaveCSS("background-color", "rgb(241, 244, 245)");
  const editorEdges = await readColumnEdges(box);
  expectContentHeight(editorEdges);
  await shot(page, "styled-block-editor-1440");
  await paper.locator('[data-block-id="block-columns"]').focus();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Styles", exact: true });
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  const background = panel.getByRole("radiogroup", {
    name: "Background",
    exact: true,
  });
  await expect(
    background.getByRole("radio", { name: "Light neutral" }),
  ).toBeChecked();
  await shot(page, "block-style-panel-1440");
  await panel
    .getByRole("button", { name: "Custom background color", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Hex color", exact: true })
    .fill("#25241f");
  await expect(panel.getByText(/1\.0:1 with block text/).first()).toBeVisible();
  await page
    .getByRole("dialog", { name: "Background color picker" })
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await background
    .getByRole("radio", { name: "Light neutral" })
    .locator("..")
    .click();
  await page.keyboard.press("Escape");
  await settled(paper);
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBeGreaterThan(0);
  const pdf = f.renders.at(-1)!;
  expect(
    pdf.layout.boundaries.map(({ start_text, ...boundary }) => boundary),
  ).toEqual(plan.starts);
  expect(pdf.layout.overflow_columns).toEqual([]);
  expect(
    pdf.layout.sheets!.some((sheet) =>
      /background-color:\s*(?:#f1f4f5|rgb\(241, 244, 245\))/i.test(sheet.html),
    ),
  ).toBe(true);
  const printSheet = pdf.layout.sheets!.find((sheet) =>
    sheet.html.includes('data-print-kind="columns"'),
  )!;
  const pdfFragment = printSheet.fragments.find(
    (fragment) => fragment.block === "columns",
  )!;
  // Inspect the same sheet HTML and Letter typography used by the PDF job.
  const printPage = await page.context().newPage();
  const styles = resolveStyles(
    f.settings,
    f.active().template_style_overrides,
    f.active().style_overrides,
  );
  const font = readFileSync(
    "public/fonts/SourceSerif4-Variable.woff2",
  ).toString("base64");
  await printPage.emulateMedia({ media: "print" });
  await printPage.setContent(
    `<style>@font-face{font-family:"Source Serif 4";src:url(data:font/woff2;base64,${font});font-weight:200 900}${printCss}${printPageCss(styles, f.active().header_footer)}${plannedPrintCss}${documentStyleCss(styles, f.settings.accent_colour, f.active().content)}</style>
    <main class="print-root proposal-typography" data-current-layout="true" data-planned="true"><section class="print-sheet">${printSheet.html}</section></main>`,
  );
  await printPage.evaluate(() => document.fonts.ready);
  const pdfEdges = await readColumnEdges(
    printPage.locator('[data-print-kind="columns"]'),
  );
  expectContentHeight(pdfEdges);
  expect(Math.abs(pdfEdges.height - pdfFragment.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(editorEdges.height - pdfFragment.height)).toBeLessThanOrEqual(
    1,
  );
  await printPage.close();
  if (process.env.CAPTURE_COLUMNS) {
    const file = testInfo.outputPath("styled.pdf");
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(file, Buffer.from(pdf.pdf_base64, "base64"));
    execFileSync("pdftoppm", [
      "-f",
      "2",
      "-l",
      "2",
      "-scale-to",
      "1000",
      "-singlefile",
      "-png",
      file,
      `${evidence}/styled-block-pdf`,
    ]);
  }
  await f.editRemote({ pagination: plan });
  const publisher = new ProposalService(
    f.repo,
    undefined,
    async () => f.members,
    undefined,
    async () => pdf.layout,
  );
  const sent = await publisher.send(f.draft.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  await page.goto(`/p/${sent.token}`);
  const client = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await expect(client.locator(".print-sheet")).toHaveCount(plan.pages);
  const clientGrid = client.getByRole("region", {
    name: "Columns",
    exact: true,
  });
  await expect(clientGrid.locator("..")).toHaveCSS("padding-top", "24px");
  await expect(clientGrid).toHaveCSS("column-gap", "24px");
  expectContentHeight(await readColumnEdges(clientGrid.locator("..")));
  const clientHeight = await clientGrid
    .locator("..")
    .evaluate((node) => (node as HTMLElement).offsetHeight);
  expect(Math.abs(clientHeight - pdfFragment.height)).toBeLessThanOrEqual(1);
  if (process.env.CAPTURE_COLUMNS)
    await clientGrid.locator("..").screenshot({
      path: `${evidence}/columns-client-desktop.png`,
      animations: "disabled",
    });
  await page.setViewportSize({ width: 375, height: 900 });
  const flow = page
    .locator(".flow-document")
    .getByRole("region", { name: "Columns", exact: true });
  const groups = flow.getByRole("group");
  await expect(groups).toHaveCount(2);
  const left = (await groups.nth(0).boundingBox())!,
    right = (await groups.nth(1).boundingBox())!;
  expect(left.x).toBeCloseTo(right.x, 0);
  expect(left.y + left.height).toBeLessThan(right.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await flow.scrollIntoViewIfNeeded();
  if (process.env.CAPTURE_COLUMNS)
    await flow.locator("..").screenshot({
      path: `${evidence}/columns-client-phone.png`,
      animations: "disabled",
    });
  await shot(page, "columns-client-stacked-375");
});

test("oversized Columns stay intact, explain the excess and unwrap in one Undo", async ({
  page,
}) => {
  const columns = createColumns();
  columns.items[0].content = [
    paragraph(
      "long",
      "A long column needs to be shortened before sending. ".repeat(180),
    ),
  ];
  const f = await editorFixture(page, false, {
    content: [
      { id: "cover-break", type: "page_break" },
      { id: "too-tall", type: "columns", columns },
      ...signatures,
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const paper = page.locator(".editor-paper");
  await settled(paper);
  const warning = page
    .getByRole("status")
    .filter({ hasText: /Columns exceed a Letter page by \d+px/ });
  await expect(warning).toBeVisible();
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  expect(
    plan.starts.filter((start: any) => start.block === "too-tall"),
  ).toEqual([
    {
      page: 2,
      block: "too-tall",
      offset: 0,
      explicit: true,
      marker: "cover-break",
    },
  ]);
  await warning.getByRole("button", { name: "Unwrap columns" }).click();
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(warning).toBeVisible();
});

test("maximum block and column spacing, border and custom paint keep common Letter geometry", async ({
  page,
}) => {
  const columns = changeColumnLayout(createColumns(), "67-33");
  columns.gap = "l";
  columns.align = "center";
  columns.items[0].style = {
    padding: "l",
    margin_above: "s",
    margin_below: "m",
  };
  columns.items[0].content = [
    {
      ...paragraph("styled-child", "A styled child paragraph."),
      style: {
        background: "#efe2db",
        padding: "s",
        border: "thin",
        radius: "s",
      },
    },
  ];
  columns.items[1].content = [paragraph("other-child", "A second column.")];
  const styled: Block = {
    ...paragraph("box", "A stand-alone styled block."),
    style: {
      padding: "l",
      margin_above: "l",
      margin_below: "l",
      background: "#dde8f1",
      border: "medium",
      border_color: "#123456",
      radius: "m",
    },
  };
  const f = await editorFixture(page, false, {
    content: [
      { id: "cover-break", type: "page_break" },
      paragraph("start", "Previous text."),
      styled,
      {
        id: "columns",
        type: "columns",
        columns,
        style: { margin_above: "none", margin_below: "s" },
      },
      ...signatures,
    ],
  });
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const paper = page.locator(".editor-paper");
  await settled(paper);
  const readBox = (locator: Locator) =>
    locator.evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        height: (el as HTMLElement).offsetHeight,
        width: (el as HTMLElement).offsetWidth,
        padding: css.padding,
        border: css.border,
        radius: css.borderRadius,
        background: css.backgroundColor,
      };
    });
  const editor = await readBox(
    paper.locator('[data-block-id="block-box"] > .block-content'),
  );
  expect(editor).toMatchObject({
    padding: "40px",
    border: "2px solid rgb(18, 52, 86)",
    radius: "8px",
    background: "rgb(221, 232, 241)",
  });
  await expect(paper.locator('[data-sortable-id="block-box"]')).toHaveCSS(
    "margin-top",
    "40px",
  );
  await expect(paper.locator('[data-sortable-id="block-columns"]')).toHaveCSS(
    "margin-top",
    "40px",
  );
  const columnBox = await readBox(
    paper.locator(`[data-column-id="${columns.items[0].id}"]`),
  );
  expect(columnBox.padding).toBe("40px");
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBeGreaterThan(0);
  const pdf = f.renders.at(-1)!;
  const fragment = pdf.layout
    .sheets!.flatMap((sheet) => sheet.fragments)
    .find((part) => part.block === "box")!;
  expect(Math.abs(fragment.height - editor.height)).toBeLessThanOrEqual(1);
  await f.editRemote({ pagination: plan });
  await page.goto(`/p/${f.draft.id}?preview=1`);
  const sheets = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await expect(sheets.locator(".print-sheet")).toHaveCount(plan.pages);
  const webBox = await readBox(sheets.locator('[data-print-block="box"]'));
  expect(webBox).toEqual(editor);
  await expect(sheets.locator('[data-print-block="box"]')).toHaveCSS(
    "margin-top",
    "40px",
  );
  await expect(sheets.locator('[data-print-block="columns"]')).toHaveCSS(
    "margin-top",
    "40px",
  );
  const webColumn = await readBox(
    sheets.getByRole("group", { name: "Column 1", exact: true }),
  );
  expect(webColumn).toEqual(columnBox);
  const grid = sheets.getByRole("region", { name: "Columns", exact: true });
  await expect(grid).toHaveCSS("align-items", "center");
  await expect(grid).toHaveCSS("column-gap", "40px");
});
