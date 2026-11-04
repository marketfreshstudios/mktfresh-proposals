import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import type { Block } from "../src/lib/model";
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
const content: Block[] = Array.from({ length: 3 }, (_, n) => [
  ...(n ? [{ id: `break-${n}`, type: "page_break" as const }] : []),
  { id: `heading-${n}`, type: "heading" as const, text: `Section ${n + 1}` },
  {
    id: `text-${n}`,
    type: "paragraph" as const,
    text: "Clear outcomes and a thoughtful plan.",
  },
]).flat();
const bands = (page: import("@playwright/test").Page, kind = "header") =>
  page.locator(`[data-band-frame=${kind}]`);
async function open(page: import("@playwright/test").Page, kind = "header") {
  const band = bands(page, kind).first();
  await band.scrollIntoViewIfNeeded();
  await band.click();
  return band;
}
test("shared band states preserve geometry; edit, history and PDF use the same shared content", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  const boxes = () =>
    page
      .locator(".block-frame,.page-sheet,[data-page-band]")
      .evaluateAll((es) =>
        es.map((e) => {
          const b = e.getBoundingClientRect();
          const paper = e.closest(".editor-paper")!.getBoundingClientRect();
          return { x: b.x, y: b.y - paper.y, width: b.width, height: b.height };
        }),
      );
  const band = bands(page).first();
  await band.scrollIntoViewIfNeeded();
  const scrolled = await boxes();
  await band.hover();
  expect(await boxes()).toEqual(scrolled);
  await band.focus();
  expect(await boxes()).toEqual(scrolled);
  await band.press("Enter");
  await expect(band).toHaveAttribute("data-band-state", "editing");
  const text = band.getByRole("textbox", { name: "header column 2" });
  await text.fill("Shared owner note");
  await expect(bands(page).last()).toContainText("Shared owner note");
  await expect(
    page.locator('[data-block-id="block-heading-1"]').first().locator(".."),
  ).toBeVisible();
  await expect(
    page.locator(".editor-paper > [data-phone-section]").first(),
  ).toHaveCSS("opacity", "0.55");
  await page.keyboard.press("Escape");
  await expect(band).toBeFocused();
  await expect(band).toHaveAttribute("data-band-state", "rest");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(bands(page).last()).not.toContainText("Shared owner note");
  await open(page);
  await band
    .getByRole("textbox", { name: "header column 2" })
    .fill("Shared owner note");
  await band.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  expect(
    f.renders[0].layout
      .sheets!.slice(1)
      .every((s) => s.html.includes("Shared owner note")),
  ).toBe(true);
});
test("layout reflow is lossless, fields insert at cursor or last-column end, menus restore focus", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  const hf = defaultHeaderFooter();
  hf.shared.header = {
    layout: "thirds",
    slots: ["One", "Two", "Three"].map((text) => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  };
  await f.editRemote({ header_footer: hf });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const band = await open(page);
  await band.getByRole("textbox", { name: "header column 3" }).click();
  await band.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Left", exact: true }).click();
  await expect(band.getByRole("textbox")).toHaveText("OneTwoThree");
  await band.getByRole("button", { name: "Insert band field" }).click();
  await page.getByRole("menuitem", { name: /Page count/ }).click();
  await expect(band.getByRole("textbox")).toHaveText("OneTwoThree3");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(band.getByRole("textbox")).toHaveText("OneTwoThree");
  const text = band.getByRole("textbox");
  await text.click();
  await text.evaluate((el) => {
    const range = document.createRange();
    range.setStart(el.querySelector("p")!.firstChild!, 1);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await text.press("ArrowRight");
  await text.press("ArrowLeft");
  await band.getByRole("button", { name: "Insert band field" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search band fields" }),
  ).toBeFocused();
  await page.getByRole("menuitem", { name: /Page number/ }).click();
  await expect(text.locator('[data-field="page.number"]')).toHaveText("2");
  await expect(text).toHaveText("O2neTwoThree");
  await expect(text).toBeFocused();
  await band.getByRole("button", { name: "Layout", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Left", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "Center", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    band.getByRole("button", { name: "Layout", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(band).toBeFocused();
  await band.press("Enter");
  await band.getByRole("button", { name: "Insert band field" }).click();
  await page.getByRole("menuitem", { name: /Page count/ }).click();
  await expect(band.getByRole("textbox")).toContainText("Three3");
});

test("band menus are accessible, controls keep 44px hit areas, and bars flip only in small margins", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const band = await open(page);
  const bar = band.getByRole("toolbar");
  await expect(bar).toHaveCSS("height", "40px");
  expect(
    await bar.evaluate((e) => {
      const b = e.getBoundingClientRect(),
        r = e.parentElement!.getBoundingClientRect();
      return Math.round(r.top - b.bottom);
    }),
  ).toBe(14);
  for (const name of ["Layout", "Insert band field"]) {
    await bar.getByRole("button", { name, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .include(".band-popover")
      .analyze();
    expect(results.violations).toEqual([]);
    const targets = await page
      .locator(".band-popover button")
      .evaluateAll((es) =>
        es.map((e) => ({
          w: e.getBoundingClientRect().width,
          h: e.getBoundingClientRect().height,
        })),
      );
    expect(targets.every((t) => t.w >= 44 && t.h >= 44)).toBe(true);
    await page.keyboard.press("Escape");
  }
  for (const width of [1180, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(bar).toHaveCSS("height", "40px");
    expect(
      await bar.evaluate(
        (el) =>
          el.getBoundingClientRect().right <=
          el.closest(".editor-document-region")!.getBoundingClientRect().right -
            12,
      ),
    ).toBe(true);
    const hitAreas = await bar.locator("button").evaluateAll((es) =>
      es.map((e) => ({
        w: e.getBoundingClientRect().width,
        h: e.getBoundingClientRect().height,
      })),
    );
    expect(hitAreas.every((b) => b.w >= 44 && b.h >= 44)).toBe(true);
    await bar.getByRole("button", { name: "Done", exact: true }).click();
    await open(page);
  }
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await f.editRemote({
    style_overrides: { margins: { top: 0.5, bottom: 0.5 } },
  });
  await page.reload();
  const small = await open(page);
  await expect(small.getByRole("toolbar")).toHaveAttribute(
    "data-inside",
    "true",
  );
  expect(
    await small
      .getByRole("toolbar")
      .evaluate(
        (e) =>
          e.getBoundingClientRect().top -
          e.parentElement!.getBoundingClientRect().bottom,
      ),
  ).toBe(14);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 768, height: 1000 });
  const tablet = bands(page).first();
  await tablet.scrollIntoViewIfNeeded();
  await tablet.click();
  await expect(tablet).toHaveAttribute("data-band-selected", "true");
  await expect(tablet).toHaveAttribute("data-band-state", "editing");
  await expect(tablet.getByRole("toolbar")).toHaveCSS("height", "44px");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 900 });
  await tablet.scrollIntoViewIfNeeded();
  await tablet.click();
  await expect(page.locator(".band-phone-header")).toContainText(
    "Header · Shared",
  );
  await expect(page.locator(".band-edit-bar")).toHaveAttribute(
    "data-band-dock",
    "keyboard",
  );
  await page
    .locator(".band-phone-header")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Quote", exact: true }).click();
  await page
    .locator(".editor-v2-sheet")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(page.locator(".editor-v2-drawer:modal")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Expand tools sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand tools sidebar", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Expand tools sidebar", exact: true }),
  ).toHaveCount(1);
});

test("band image uploads and reserved workspace logos work in either column and both bands", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#345941";
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png");
  });
  for (const kind of ["header", "footer"]) {
    let band = await open(page, kind);
    // Before a text cursor exists: existing image column, otherwise FIRST column.
    // The default header has an image in column 1; the footer has none.

    await band.getByRole("button", { name: "Image", exact: true }).click();
    await page.getByLabel("Upload band image").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(image.split(",")[1], "base64"),
    });
    const img = band.locator(".band-slot > img");
    await expect(img).toHaveCount(1);
    expect(await img.evaluate((e) => e.getBoundingClientRect().height)).toBe(
      18,
    );
    await expect
      .poll(
        () =>
          f.active().header_footer?.shared[kind as "header" | "footer"].image
            ?.slot,
      )
      .toBe(0);
    await page.keyboard.press("Escape");
    await band.press("Enter");
    const last = band.getByRole("textbox", { name: `${kind} column 2` });
    const previous = await last.locator('[data-field="page.count"]').count();
    await band.getByRole("button", { name: "Insert band field" }).click();
    await page.getByRole("menuitem", { name: /Page count/ }).click();
    await expect(last.locator('[data-field="page.count"]')).toHaveCount(
      previous + 1,
    );
    const rendered = f.renders.length;
    await page
      .getByRole("button", { name: "Preview PDF", exact: true })
      .click();
    await expect.poll(() => f.renders.length).toBe(rendered + 1);
    const heights = await pdfImageHeights(f.renders.at(-1)!.pdf_base64, 2);
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((height) => height >= 17.99 && height <= 18.01)).toBe(
      true,
    );
    await page
      .getByRole("button", { name: "Close PDF preview", exact: true })
      .click();
    band = await open(page, kind);
    await band.getByRole("textbox", { name: `${kind} column 1` }).click();
    await band.getByRole("button", { name: "Image", exact: true }).click();
    await page
      .getByRole("button", { name: "Use workspace logo", exact: true })
      .click();
    await expect
      .poll(
        () =>
          f.active().header_footer?.shared[kind as "header" | "footer"].image
            ?.src,
      )
      .toBe("workspace-logo");
    await band.getByRole("textbox", { name: `${kind} column 2` }).click();
    await band.getByRole("button", { name: "Image", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Remove image", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Use workspace logo", exact: true })
      .click();
    await expect
      .poll(
        () =>
          f.active().header_footer?.shared[kind as "header" | "footer"].image
            ?.slot,
      )
      .toBe(1);
    await page.keyboard.press("Escape");
    await band.press("Enter");
    await band.getByRole("button", { name: "Image", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove image", exact: true })
      .click();
    await expect(band.locator(".band-slot > img")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("band marks preserve selection and page fields never enter body menus; focus follows reading order", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const band = await open(page);
  const text = band.getByRole("textbox", { name: "header column 2" });
  await text.fill("Shared words");
  await text.press("ControlOrMeta+A");
  await band.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(text.locator("strong")).toHaveText("Shared words");
  await expect(text).toBeFocused();
  await expect(
    band.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const first = band.getByRole("textbox", { name: "header column 1" });
  await first.fill("First word");
  await first.dblclick({ position: { x: 8, y: 8 } });
  await band.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(first.locator("em")).toHaveText("First");
  await expect(first).toBeFocused();
  await page.keyboard.press("Escape");
  await band.press("Shift+Tab");
  const coverLast = page.locator('[data-block-id="block-text-0"]');
  await expect(coverLast).toBeFocused();
  await coverLast
    .getByRole("button", { name: "Add a block below", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(band).toBeFocused();
  await band.press("Tab");
  await expect(page.locator('[data-block-id="block-heading-1"]')).toBeFocused();
  const footer = bands(page, "footer").last();
  await footer.focus();
  await footer.press("Tab");
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(page.locator(".field-options")).not.toContainText("page.number");
  await expect(page.locator(".field-options")).not.toContainText("page.count");
  await open(page);
  const list = band.getByRole("textbox", { name: "header column 2" });
  await list.fill("");
  await list.pressSequentially("1. A numbered band note");
  await expect(list.locator("ol li")).toContainText("A numbered band note");
  await expect(list).toBeFocused();
  await expect
    .poll(() =>
      JSON.stringify(f.active().header_footer?.shared.header.slots[1]),
    )
    .toContain("A numbered band note");
  await expect(page.getByRole("button", { name: /Couldn.t save/ })).toHaveCount(
    0,
  );
});

test("Studio edits shared template bands with history, and proposals inherit the saved result", async ({
  page,
}) => {
  const { staff } = await import("../tests/helpers");
  const f = await editorFixture(page, false, { content });
  let saved: any;
  await page.route("**/api/templates", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: await f.repo.entities("templates") });
    saved = route.request().postDataJSON();
    await f.repo.put("templates", saved);
    return route.fulfill({ json: saved });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/templates");
  const band = await open(page);
  await band
    .getByRole("textbox", { name: "header column 2" })
    .fill("Template shared note");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(bands(page).last()).not.toContainText("Template shared note");
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(bands(page).last()).toContainText("Template shared note");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect
    .poll(
      () =>
        saved?.header_footer?.shared?.header?.slots[1]?.content[0]?.content[0]
          ?.text,
    )
    .toBe("Template shared note");
  const created = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: saved.id,
      title: "New proposal",
    },
    staff,
  );
  expect(created.header_footer?.shared).toEqual(saved.header_footer.shared);
  const reset = page.locator(".band-reset");
  await expect(reset).toContainText("Restores the built-in header and footer.");
  await reset
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  await expect(bands(page).first()).not.toContainText("Template shared note");
  await page
    .getByRole("status")
    .filter({ hasText: "Shared header and footer reset" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(bands(page).first()).toContainText("Template shared note");
  await page
    .getByRole("button", { name: "+ New template", exact: true })
    .click();
  const settings = page.locator(".band-settings");
  await expect(
    settings.getByRole("button", { name: "Edit shared header", exact: true }),
  ).toBeDisabled();
  await settings
    .getByRole("switch", { name: "Show on cover", exact: true })
    .check();
  await settings
    .getByRole("button", { name: "Edit shared header", exact: true })
    .click();
  await expect(bands(page).first()).toHaveAttribute(
    "data-band-state",
    "editing",
  );
});

test("Styles edits scroll to a band, and Reset uses current template bands with Undo and missing-template fallback", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  const template = (await f.repo.entities<any>("templates"))[0];
  const builtIn = defaultHeaderFooter();
  template.header_footer = {
    ...builtIn,
    overrides: undefined,
    shared: {
      ...builtIn.shared,
      header: {
        layout: "left",
        slots: [
          {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Current template header" }],
              },
            ],
          },
        ],
      },
    },
    distanceIn: 0.4,
    showOnCover: true,
  };
  await f.repo.put("templates", template);
  const hf = defaultHeaderFooter();
  hf.showFooter = false;
  hf.overrides.cover = { footer: "hidden" };
  await f.editRemote({ header_footer: hf });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  const settings = page.locator(".band-settings");
  await settings
    .getByRole("button", { name: "Edit shared header", exact: true })
    .click();
  await expect(bands(page).first()).toHaveAttribute(
    "data-band-state",
    "editing",
  );
  await page.keyboard.press("Escape");
  await settings
    .getByRole("button", { name: "Reset to template", exact: true })
    .click();
  await expect(bands(page).first()).toContainText("Current template header");
  await expect.poll(() => f.active().header_footer?.distanceIn).toBe(0.4);
  expect(f.active().header_footer?.showFooter).toBe(false);
  expect(f.active().header_footer?.overrides).toEqual(hf.overrides);
  await page
    .getByRole("status")
    .filter({ hasText: "Shared header and footer reset" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect.poll(() => f.active().header_footer?.distanceIn).toBe(0.3);
  await expect(bands(page).first()).not.toContainText(
    "Current template header",
  );
  f.repo.catalog.get("templates")!.delete(template.id);
  await settings
    .getByRole("button", { name: "Reset to template", exact: true })
    .click();
  await expect(bands(page).first()).toContainText("Example Studio");
});

// Inspect the actual PDF drawing transforms, rather than only checking HTML/CSS.
async function pdfImageHeights(base64: string, number: number) {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: Uint8Array.from(Buffer.from(base64, "base64")),
  });
  const pdf = await task.promise;
  try {
    const ops = await (await pdf.getPage(number)).getOperatorList();
    let matrix = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const heights: number[] = [];
    for (let n = 0; n < ops.fnArray.length; n++) {
      const op = ops.fnArray[n],
        args = ops.argsArray[n];
      if (op === OPS.save) stack.push([...matrix]);
      else if (op === OPS.restore) matrix = stack.pop() ?? matrix;
      else if (op === OPS.transform) {
        const [a, b, c, d, e, f] = matrix,
          [g, h, i, j, k, l] = args;
        matrix = [
          a * g + c * h,
          b * g + d * h,
          a * i + c * j,
          b * i + d * j,
          a * k + c * l + e,
          b * k + d * l + f,
        ];
      } else if (
        op === OPS.paintImageXObject ||
        op === OPS.paintInlineImageXObject
      )
        heights.push((Math.hypot(matrix[2], matrix[3]) * 96) / 72);
    }
    return heights;
  } finally {
    await task.destroy();
  }
}
