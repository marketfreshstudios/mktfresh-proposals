import { mkdirSync } from "node:fs";
import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  userAgent: devices["iPhone 13"].userAgent,
  hasTouch: true,
  isMobile: true,
  actionTimeout: 10000,
});

const capture = process.env.CAPTURE_PHONE_EDITOR;
const shots = "docs/screenshots/phone-editor-tools";
const tabs = ["Quote", "Fields", "Blocks", "Styles", "Send"] as const;

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${capture}-${name}.png` });
}

async function openProposal(page: Page, content?: Block[]) {
  const fixture = await editorFixture(page, false, { content });
  await page.goto(`/proposals/${fixture.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  return fixture;
}

function opener(page: Page, tab: (typeof tabs)[number]) {
  return page.getByRole("button", {
    name: tab === "Quote" ? /^Open Quote\b/ : `Open ${tab}`,
    exact: true,
  });
}

async function tapText(page: Page, text: Locator, offset: number) {
  await text.scrollIntoViewIfNeeded();
  const point = await text.evaluate((node, offset) => {
    const range = window.document.createRange();
    range.setStart(node.querySelector("p")!.firstChild!, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, offset);
  await page.touchscreen.tap(point.x, point.y);
}

async function resizeVisualViewport(page: Page, height: number) {
  await page.evaluate((height) => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: height,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  }, height);
}

test("one tap opens each phone tool and all close paths restore focus", async ({
  page,
}) => {
  await openProposal(page);
  const sheet = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  for (const tab of tabs) {
    const trigger = opener(page, tab);
    const closedDock = (await page
      .locator(".editor-phone-dock")
      .boundingBox())!;
    await trigger.tap();
    await expect(sheet).toBeVisible();
    const dock = sheet.getByRole("tablist", { name: "Proposal tools" });
    const active = dock.getByRole("tab", {
      name: tab === "Quote" ? /^Quote\b/ : tab,
      exact: true,
    });
    await expect(active).toHaveAttribute("aria-selected", "true");
    const inactive = dock.getByRole("tab", {
      name: tab === "Quote" ? "Fields" : /^Quote\b/,
      exact: true,
    });
    const colors = await Promise.all(
      [active, inactive].map((button) =>
        button.evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    );
    expect(colors[0]).not.toBe(colors[1]);
    const close = sheet.getByRole("button", {
      name: `Close ${tab}`,
      exact: true,
    });
    await expect(close).toHaveCSS("width", "44px");
    await expect(close).toHaveCSS("height", "44px");
    if (tab === "Quote") await shot(page, "tools");
    await expect(dock.getByRole("tab")).toHaveCount(5);
    const openDock = (await dock.boundingBox())!;
    expect(Math.abs(openDock.y - closedDock.y)).toBeLessThanOrEqual(1);
    const content = (await sheet.getByRole("tabpanel").boundingBox())!;
    expect(content.y + content.height).toBeLessThanOrEqual(openDock.y + 1);
    if (tab === "Quote") await active.tap();
    else if (tab === "Fields")
      await sheet
        .getByRole("button", { name: "Close Fields", exact: true })
        .tap();
    else if (tab === "Blocks") await page.keyboard.press("Escape");
    else if (tab === "Styles")
      await page.touchscreen.tap(24, (await sheet.boundingBox())!.y - 8);
    else {
      await dock.getByRole("tab", { name: /^Quote\b/, exact: true }).tap();
      await expect(
        dock.getByRole("tab", { name: /^Quote\b/, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await sheet
        .getByRole("button", { name: "Close Quote", exact: true })
        .tap();
    }
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("a text tap keeps the caret and page in place through keyboard movement", async ({
  page,
}) => {
  const fixture = await openProposal(page);
  const document = page.getByRole("region", { name: "Proposal document" });
  const block = document.locator(
    `[data-block-id="block-${fixture.content[1].id}"]`,
  );
  const text = block.locator(".tiptap");
  await text.scrollIntoViewIfNeeded();
  const before = (await text.boundingBox())!;
  const scrollBefore = await document.evaluate((el) => ({
    window: window.scrollY,
    editor: el.scrollTop,
  }));
  await tapText(page, text, 8);
  await shot(page, "text");
  await expect(text).toBeFocused();
  expect(await text.evaluate(() => window.getSelection()?.anchorOffset)).toBe(
    8,
  );
  expect(
    Math.abs((await text.boundingBox())!.y - before.y),
  ).toBeLessThanOrEqual(1);
  expect(
    await document.evaluate((el) => ({
      window: window.scrollY,
      editor: el.scrollTop,
    })),
  ).toEqual(scrollBefore);
  await expect(document.locator(".document-cover").first()).toBeVisible();
  const caretBottom = await text.evaluate(
    () => window.getSelection()!.getRangeAt(0).getBoundingClientRect().bottom,
  );
  const keyboardTop = Math.floor(caretBottom + 65 + 48 - 24);
  await resizeVisualViewport(page, keyboardTop);
  const dock = page.locator(".editor-phone-dock");
  const toolbar = block.getByRole("toolbar", { name: "Text tools" });
  await expect
    .poll(async () => {
      const box = (await dock.boundingBox())!;
      return Math.round(box.y + box.height);
    })
    .toBe(keyboardTop);
  const toolbarTop = (await toolbar.boundingBox())!.y;
  const necessaryScroll = Math.ceil(caretBottom - toolbarTop);
  expect(necessaryScroll).toBeGreaterThan(0);
  await expect
    .poll(() => document.evaluate((el) => el.scrollTop))
    .toBe(scrollBefore.editor + necessaryScroll);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore.window);
  await shot(page, "keyboard");
  await resizeVisualViewport(page, 844);
  await expect
    .poll(async () => {
      const box = (await dock.boundingBox())!;
      return Math.round(box.y + box.height);
    })
    .toBe(844);
  expect(await document.evaluate((el) => el.scrollTop)).toBe(
    scrollBefore.editor + necessaryScroll,
  );
  await opener(page, "Quote").tap();
  const sheet = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close Quote", exact: true }).tap();
  await expect(opener(page, "Quote")).toBeFocused();
});

test("headings, list text, quote amounts and field search take focus on one tap", async ({
  page,
}) => {
  const heading: Block = {
    id: crypto.randomUUID(),
    type: "heading",
    level: 1,
    text: "First section",
  };
  const list: Block = {
    id: crypto.randomUUID(),
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
                  content: [{ type: "text", text: "A useful list item." }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  await openProposal(page, [
    heading,
    list,
    { id: crypto.randomUUID(), type: "pricing_table" },
  ]);
  const document = page.getByRole("region", { name: "Proposal document" });
  for (const block of [heading, list]) {
    const text = document.locator(
      `[data-block-id="block-${block.id}"] .tiptap`,
    );
    await text.scrollIntoViewIfNeeded();
    const before = (await text.boundingBox())!;
    await tapText(page, text, 4);
    await expect(text).toBeFocused();
    const caret = await text.evaluate(
      () => window.getSelection()!.anchorOffset,
    );
    expect(Math.abs(caret - 4)).toBeLessThanOrEqual(1);
    expect(
      Math.abs((await text.boundingBox())!.y - before.y),
    ).toBeLessThanOrEqual(1);
  }

  const sheet = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  const scrollBefore = await document.evaluate((el) => el.scrollTop);
  await opener(page, "Quote").tap();
  const row = sheet.locator(".quote-row").first();
  await row.locator(".quote-row-toggle").tap();
  const amount = row.getByRole("spinbutton", { name: /^Amount / });
  await amount.tap();
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue("2750");
  await expect(amount).toHaveCSS("font-size", "16px");
  await sheet.getByRole("tab", { name: "Fields", exact: true }).tap();
  const search = sheet.getByRole("searchbox", { name: "Search fields" });
  await search.tap();
  await expect(search).toBeFocused();
  await resizeVisualViewport(page, 500);
  await expect
    .poll(async () => {
      const dock = (await sheet.getByRole("tablist").boundingBox())!;
      return Math.round(dock.y + dock.height);
    })
    .toBe(500);
  await search.fill("client");
  await expect(
    sheet.getByRole("button", { name: /^Client company /i }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Close Fields" }).tap();
  expect(await document.evaluate((el) => el.scrollTop)).toBe(scrollBefore);
});

test("touching header and dock controls changes nothing before the click, even while editing text", async ({
  page,
}) => {
  await openProposal(page);
  await expect(page.locator(".phone-header-back")).toHaveAttribute(
    "aria-label",
    "Back to proposal",
  );
  const text = page.locator(".block-frame .tiptap").nth(1);
  await text.scrollIntoViewIfNeeded();
  await text.tap();
  await expect(text).toBeFocused();
  for (const selector of [
    '.editor-phone-dock button[data-phone-tool="Quote"]',
    '.editor-phone-dock button[data-phone-tool="Styles"]',
    ".phone-header-back",
    ".phone-header-more",
  ]) {
    // iOS holds a tap as a hover preview when the touch, before the click,
    // makes new content appear. Replay the touch events up to the click.
    const changed = await page.locator(selector).evaluate(async (el) => {
      const visible = () =>
        new Set(
          [...document.querySelectorAll("body *")].filter((node) => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              box.width > 0 &&
              box.height > 0 &&
              style.visibility !== "hidden" &&
              style.opacity !== "0"
            );
          }),
        );
      const before = visible();
      const box = el.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        pointerId: 9,
        pointerType: "touch",
        isPrimary: true,
      };
      for (const type of ["pointerover", "pointerdown", "pointerup"])
        el.dispatchEvent(new PointerEvent(type, init));
      for (const type of ["mouseover", "mousemove"])
        el.dispatchEvent(new MouseEvent(type, init));
      await new Promise((resolve) => setTimeout(resolve, 60));
      return [...visible()]
        .filter((node) => !before.has(node))
        .map((node) => node.className.toString());
    });
    expect(changed, selector).toEqual([]);
  }
});
