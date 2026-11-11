import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
const content: Block[] = [
  { id: "overview", type: "paragraph", text: "A clear project plan." },
  { id: "next", type: "page_break" },
  { id: "scope", type: "paragraph", text: "The scope and delivery details." },
];
test("cover margin pills enable each shared band independently through undo history", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  await expect(page.locator('[data-band-page="1"]')).toHaveCount(0);
  const zone = page.locator('[data-cover-band="header"]');
  await zone.hover();
  await capture(page, "1h-1440-cover-pill");
  const button = zone.getByRole("button", {
    name: "Use shared header",
    exact: true,
  });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect(
    page.locator('[data-band-frame="header"][data-band-page="1"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-band-frame="footer"][data-band-page="1"]'),
  ).toHaveCount(0);
  await page
    .locator('[data-cover-band="footer"]')
    .getByRole("button", { name: "Use shared footer", exact: true })
    .click();
  await expect(
    page.locator('[data-band-frame="footer"][data-band-page="1"]'),
  ).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(
    page.locator('[data-band-frame="footer"][data-band-page="1"]'),
  ).toHaveCount(0);
  await page
    .locator(".band-notices")
    .locator(".band-notice-row")
    .filter({ hasText: "Header shown on cover" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(
    page.locator('[data-band-frame="header"][data-band-page="1"]'),
  ).toHaveCount(0);
  await expect(zone).toBeVisible();
});
test("touch band selection, keyboard docking and the native phone actions sheet remain accessible", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  const band = page.locator('[data-band-frame="header"]').first();
  await band.scrollIntoViewIfNeeded();
  await band.click();
  await expect(band).toHaveAttribute("data-band-selected", "true");
  await expect(band).toHaveAttribute("data-band-state", "editing");
  await expect(band.getByRole("toolbar")).toHaveCSS("height", "44px");
  await expect(page.locator(".band-touch-scope")).toHaveText(
    "Shared on 1 page",
  );
  await capture(page, "2a-768-tablet-band");
  await band
    .getByRole("textbox", { name: "header column 2" })
    .fill("Tablet shared note");
  await page.keyboard.press("Escape");
  await expect(band).toBeFocused();
  await page.setViewportSize({ width: 375, height: 900 });
  await band.scrollIntoViewIfNeeded();
  await band.click();
  await expect(page.locator(".band-phone-header")).toContainText(
    "Header · Shared",
  );
  await expect(page.locator(".band-phone-header")).toContainText(
    "Changes show on this page only",
  );
  const bar = page.getByRole("toolbar", { name: "Shared header formatting" });
  await expect(bar).toHaveCSS("height", "48px");
  await expect(bar).toHaveCSS("position", "fixed");
  await page.evaluate(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, {
      height: 550,
      width: innerWidth,
      scale: 1,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: scrollY,
      pageLeft: 0,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    window.dispatchEvent(new Event("resize"));
  });
  // Re-enter to attach to the simulated mobile keyboard's viewport.
  await page
    .locator(".band-phone-header")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await band.click();
  await expect
    .poll(async () =>
      Math.round(
        (await bar.boundingBox())!.y + (await bar.boundingBox())!.height,
      ),
    )
    .toBe(550);
  await capture(page, "2b-375-keyboard-band");
  await bar
    .getByRole("button", { name: "header actions", exact: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Header on page 2",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("header > p")).toHaveText("Shared on 1 page");
  await capture(page, "2c-375-band-sheet");
  await expect(sheet.getByRole("menuitem").first()).toHaveCSS(
    "min-height",
    "56px",
  );
  expect(
    (await new AxeBuilder({ page }).include(".band-phone-sheet").analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(
    await sheet.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(
    bar.getByRole("button", { name: "header actions", exact: true }),
  ).toBeFocused();
  await page
    .locator(".band-phone-header")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect(band).toContainText("Tablet shared note");
});

const capture = async (page: import("@playwright/test").Page, name: string) => {
  if (!process.env.CAPTURE_HF3) return;
  const { mkdir } = await import("node:fs/promises");
  await mkdir("docs/screenshots/header-footer-pr3", { recursive: true });
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: Math.min(innerHeight, window.visualViewport?.height ?? innerHeight),
  }));
  await page.screenshot({
    path: `docs/screenshots/header-footer-pr3/${name}.png`,
    clip: { x: 0, y: 0, ...viewport },
  });
};
async function actions(
  page: import("@playwright/test").Page,
  band: import("@playwright/test").Locator,
) {
  await band.scrollIntoViewIfNeeded();
  await band.hover();
  const kind = await band.getAttribute("data-band-frame");
  await band
    .getByRole("button", { name: `${kind} actions`, exact: true })
    .click();
}
test("per-page menus preserve geometry, confirm and Undo restore unique edits, PDF and Styles agree", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      ...content,
      { id: "third", type: "page_break" },
      { id: "end", type: "paragraph", text: "Project next steps." },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  const band = page.locator('[data-band-frame="header"][data-band-page="2"]');
  const plan = await page
    .locator(".editor-paper")
    .getAttribute("data-pagination");
  await actions(page, band);
  await capture(page, "1d-1440-shared-menu");
  expect(
    (await new AxeBuilder({ page }).include(".band-popover-more").analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("menuitem", { name: /Make unique to this page/ })
    .click();
  await band
    .getByRole("textbox", { name: "header column 2" })
    .fill("A unique page note");
  await band.getByRole("button", { name: "Done", exact: true }).click();
  await expect(band).toHaveAttribute("data-band-source", "unique");
  await expect(
    page.locator('[data-band-frame="header"][data-band-page="3"]'),
  ).not.toContainText("A unique page note");
  await page
    .locator(".editor-paper .page-sheet")
    .nth(1)
    .click({ position: { x: 20, y: 260 } });
  await expect(band).not.toBeFocused();
  await page.mouse.move(1400, 900);
  await capture(page, "1e-1440-unique");
  await expect(
    page.getByRole("img", { name: "Unique header", exact: true }),
  ).toHaveCount(1);
  expect(
    await page
      .getByRole("img", { name: "Unique header", exact: true })
      .evaluate((el) =>
        Math.round(
          el.getBoundingClientRect().left -
            el.previousElementSibling!.getBoundingClientRect().right,
        ),
      ),
  ).toBe(8);
  await capture(page, "1j-1440-sections-markers");
  await actions(page, band);
  await page
    .getByRole("menuitem", { name: "Use shared header", exact: true })
    .click();
  await capture(page, "1f-1440-confirm");
  expect(
    (await new AxeBuilder({ page }).include(".band-popover-confirm").analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menuitem", { name: "Use shared header", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Use shared header", exact: true })
    .click();
  await page
    .locator(".band-popover-confirm")
    .getByRole("button", { name: "Use shared header", exact: true })
    .click();
  await expect(band).toHaveAttribute("data-band-source", "shared");
  await page
    .locator(".band-notices")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(band).toContainText("A unique page note");
  await expect(band).toHaveAttribute("data-band-source", "unique");
  await actions(page, band);
  await page.getByRole("menuitem", { name: /Hide on this page/ }).click();
  await expect(band).toHaveAttribute("data-band-source", "hidden");
  await expect(band.locator("[data-page-band]")).toHaveCount(0);
  await expect(page.locator(".editor-paper")).toHaveAttribute(
    "data-pagination",
    plan!,
  );
  await actions(page, band);
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await page
    .getByRole("menuitem", { name: "Edit this page's header", exact: true })
    .click();
  await expect(band.getByRole("textbox").first()).toBeEmpty();
  await band.getByRole("button", { name: "Done", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(band).toHaveAttribute("data-band-source", "hidden");
  // Restore the edited unique band through the same session history.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(band).toContainText("A unique page note");
  const footer = page.locator('[data-band-frame="footer"][data-band-page="2"]');
  await footer.scrollIntoViewIfNeeded();
  await footer.hover();
  await footer
    .getByRole("button", { name: "footer actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /Hide on this page/ }).click();
  await expect(
    page.getByRole("img", {
      name: "Unique header · Footer hidden",
      exact: true,
    }),
  ).toHaveCount(1);
  await capture(page, "1j-1440-sections-markers");
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Pages with their own", exact: true }),
  ).toContainText("Page 2 | footer hidden");
  await expect(page.locator(".band-settings")).toContainText(
    "Shared on 1 page | 1 unique",
  );
  await expect(page.locator(".band-settings")).toContainText(
    "Shared on 1 page | 1 hidden",
  );
  await capture(page, "1i-1440-styles");
  if (process.env.CAPTURE_PANEL_CARDS === "1") {
    const { mkdir } = await import("node:fs/promises");
    const directory = "docs/screenshots/editor-panel-cards-rest";
    await mkdir(directory, { recursive: true });
    const shared = page.locator(".shared-bands-card");
    await shared.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/2d-own-pages-1440.png` });
    await shared.screenshot({ path: `${directory}/2d-own-pages-card.png` });
  }
  await page
    .getByRole("button", { name: "Go to page 2 header", exact: true })
    .click();
  await expect(band).toBeFocused();
  await page
    .getByRole("button", { name: "Use shared on every page", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use shared on every page", exact: true })
    .last()
    .click();
  await expect(
    page.locator('[data-band-source="unique"],[data-band-source="hidden"]'),
  ).toHaveCount(0);
  await page
    .locator(".band-notices")
    .getByRole("button", { name: "Undo", exact: true })
    .last()
    .click();
  await expect(band).toHaveAttribute("data-band-source", "unique");
  await expect(footer).toHaveAttribute("data-band-source", "hidden");
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const sheets = f.renders[0].layout.sheets!;
  expect(sheets[1].html).toContain("A unique page note");
  expect(sheets[1].html).not.toContain('data-page-band="footer"');
  expect(sheets[2].html).not.toContain("A unique page note");
  expect(sheets[2].html).toContain("Page 3 of 3");
  const bytes = Buffer.from(f.renders[0].pdf_base64, "base64");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  try {
    const pdf = await task.promise;
    const text = async (n: number) =>
      (await (await pdf.getPage(n)).getTextContent()).items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ");
    expect(await text(2)).toContain("A unique page note");
    expect(await text(2)).not.toContain("Page 2 of 3");
    expect(await text(3)).not.toContain("A unique page note");
    expect(await text(3)).toContain("Page 3 of 3");
    if (process.env.CAPTURE_HF3)
      await (
        await import("node:fs/promises")
      ).writeFile(".data/hf3-overrides-preview.pdf", bytes);
  } finally {
    await task.destroy();
  }
  await page
    .getByRole("button", { name: "Close PDF preview", exact: true })
    .click();
  const sharedFooter = page.locator(
    '[data-band-frame="footer"][data-band-page="3"]',
  );
  await actions(page, sharedFooter);
  await expect(
    page.getByRole("menuitem", { name: /Edit shared footer/ }),
  ).toContainText("Changes show on this page only");
  await page.getByRole("menuitem", { name: /Edit shared footer/ }).click();
  await expect(sharedFooter.locator(".band-shared-count")).toHaveText(
    "Shared on 1 page",
  );
  await sharedFooter.getByRole("button", { name: "Done", exact: true }).click();
  await actions(
    page,
    page.locator('[data-band-frame="header"][data-band-page="3"]'),
  );
  await page.getByRole("menuitem", { name: /Hide on this page/ }).click();
  await expect(page.locator(".band-settings")).toContainText(
    "Shared on 0 pages | 1 unique | 1 hidden",
  );
});
test("reflow follows the anchor once; deleting it transfers the band and page deletion Undo restores both", async ({
  page,
}) => {
  const many: Block[] = Array.from({ length: 25 }, (_, n) => ({
    id: `paragraph-${n}`,
    type: "paragraph",
    text:
      `Project section ${n + 1}. ` +
      "A considered description of the work and expected outcomes. ".repeat(4),
  }));
  const f = await editorFixture(page, false, { content: many });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  const second = page.locator('[data-band-frame="header"][data-band-page="2"]');
  const anchor = (await second.getAttribute("data-band-anchor"))!;
  await actions(page, second);
  await page
    .getByRole("menuitem", { name: /Make unique to this page/ })
    .click();
  await second
    .getByRole("textbox", { name: "header column 2" })
    .fill("This band follows its section");
  await second.getByRole("button", { name: "Done", exact: true }).click();
  const firstText = page.locator('[data-block-id="block-paragraph-0"] .tiptap');
  await firstText.fill("A longer introduction. ".repeat(190));
  const moved = page.locator(
    `[data-band-frame="header"][data-band-anchor="${anchor}"]`,
  );
  await expect
    .poll(async () => Number(await moved.getAttribute("data-band-page")))
    .toBeGreaterThan(2);
  await expect(moved.getByRole("status")).toContainText(
    "Moved here from page 2 with its section",
  );
  await moved.scrollIntoViewIfNeeded();
  await capture(page, "1k-1440-reflow-note");
  await moved.getByRole("button", { name: "OK", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.locator("[data-layout-settled=true]").waitFor();
  await expect(moved.getByRole("status")).toHaveCount(0);
  const original = await page
    .locator(".block-frame[data-block-id]")
    .evaluateAll((es) => es.map((e) => e.getAttribute("data-block-id")));
  const frame = page.locator(`[data-block-id="block-${anchor}"]`);
  await frame.scrollIntoViewIfNeeded();
  await frame.click();
  await frame
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  await expect(frame).toHaveCount(0);
  await expect(page.locator('[data-band-source="unique"]')).toContainText(
    "This band follows its section",
  );
  await expect(
    page.locator(`[data-band-anchor="${anchor}"][data-band-source="unique"]`),
  ).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(frame).toHaveCount(1);
  await expect(
    page.locator(`[data-band-anchor="${anchor}"][data-band-source="unique"]`),
  ).toContainText("This band follows its section");
  expect(
    await page
      .locator(".block-frame[data-block-id]")
      .evaluateAll((es) => es.map((e) => e.getAttribute("data-block-id"))),
  ).toEqual(original);
});
test("deleting a whole page drops its band with an eight-second Undo that restores the page and override", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      ...content,
      { id: "third", type: "page_break" },
      { id: "end", type: "paragraph", text: "Final page." },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  const band = page.locator('[data-band-frame="header"][data-band-page="2"]');
  await actions(page, band);
  await page
    .getByRole("menuitem", { name: /Make unique to this page/ })
    .click();
  await band
    .getByRole("textbox", { name: "header column 2" })
    .fill("A page-specific message");
  await band.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete page 2", exact: true })
    .click();
  await expect(page.locator(".editor-paper .page-sheet")).toHaveCount(2);
  await expect(page.locator(".band-notices")).toContainText(
    "Page 2's header was removed",
  );
  await expect(page.locator('[data-band-source="unique"]')).toHaveCount(0);
  await page
    .locator(".band-notices")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(page.locator(".editor-paper .page-sheet")).toHaveCount(3);
  await expect(band).toContainText("A page-specific message");
  await expect
    .poll(() => f.active().content.map((b) => b.id))
    .toEqual(["overview", "next", "scope", "third", "end"]);
});

test("a focused band opens its context menu with Shift+F10; arrows and Enter choose without starting the wrong action", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const band = page.locator('[data-band-frame="header"]').first();
  await band.focus();
  await band.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: /Edit shared header/ }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: /Make unique to this page/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(band).toHaveAttribute("data-band-source", "unique");
  await expect(band).toHaveAttribute("data-band-state", "editing");
  await page.keyboard.press("Escape");
  await expect(band).toBeFocused();
  await band.press("Shift+F10");
  await page.keyboard.press("Escape");
  await expect(band).toBeFocused();
});
