import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { emailEditorFixture } from "./email-editor-fixture";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";

async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_MENU_HOVER === "1") {
    const dir = "docs/screenshots/menu-hover";
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${name}.png`,
      animations: "disabled",
    });
  }
}
async function rowsFit(menu: Locator) {
  const rows = await menu.getByRole("menuitemradio").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        bottom: r.bottom,
        right: r.right,
        width: r.width,
        clips: [...el.querySelectorAll("span,kbd")].some((child) => {
          const c = child.getBoundingClientRect();
          return (
            c.left < r.left ||
            c.right > r.right + 1 ||
            child.scrollWidth > child.clientWidth + 1
          );
        }),
      };
    }),
  );
  for (let n = 0; n < rows.length; n++) {
    expect(rows[n].clips).toBe(false);
    expect(rows[n].x).toBeCloseTo(rows[0].x, 0);
    expect(rows[n].right).toBeCloseTo(rows[0].right, 0);
    if (n) expect(rows[n].y).toBeGreaterThanOrEqual(rows[n - 1].bottom);
  }
  await expect(menu).toBeVisible();
  const bounds = await menu.locator("..").boundingBox();
  const viewport = menu.page().viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(7);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 7);
  expect(bounds!.y).toBeGreaterThanOrEqual(7);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 7);
}
for (const width of [1440, 375])
  for (const template of [false, true]) {
    test(`${template ? "template" : "proposal"} menu rows, checked level, keyboard and sibling menus at ${width}`, async ({
      page,
    }) => {
      const f = await editorFixture(page);
      const t = (await f.repo.entities<any>("templates"))[0];
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(
        template ? `/studio/templates/${t.id}` : `/proposals/${f.draft.id}`,
      );
      const frame = page.locator(
        `[data-block-id="${template ? "template-" : "block-"}${f.content[1].id}"]`,
      );
      await frame.locator(".tiptap").click();
      const trigger = frame.getByRole("button", {
        name: "Text style",
        exact: true,
      });
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Text styles", exact: true });
      await rowsFit(menu);
      const menuBox = (await menu.locator("..").boundingBox())!,
        triggerBox = (await trigger.boundingBox())!;
      if (width === 375)
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(
          triggerBox.y + 1,
        );
      else
        expect(menuBox.y).toBeGreaterThanOrEqual(
          triggerBox.y + triggerBox.height - 1,
        );
      if (!template && width === 1440)
        await shot(page, "text-level-after-1440");
      expect(
        (
          await new AxeBuilder({ page })
            .include(".text-style-popover")
            .analyze()
        ).violations,
      ).toEqual([]);
      await expect(menu.getByRole("menuitemradio")).toHaveCount(4);
      for (const [n, name] of [
        "Paragraph",
        "Heading 1",
        "Heading 2",
        "Heading 3",
      ].entries()) {
        const item = menu.getByRole("menuitemradio", { name, exact: true });
        await expect(item).toBeVisible();
        await expect(item.locator("kbd")).toHaveText(`⌥${n}`);
      }
      await expect(
        menu.getByRole("menuitemradio", { name: "Paragraph", exact: true }),
      ).toHaveAttribute("aria-checked", "true");
      const checked = menu.getByRole("menuitemradio", {
        name: "Paragraph",
        exact: true,
      });
      expect(
        await checked.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).not.toBe("rgba(0, 0, 0, 0)");
      await page.keyboard.press("ArrowDown");
      const current = menu.getByRole("menuitemradio", {
        name: "Heading 1",
        exact: true,
      });
      await expect(current).toHaveAttribute("data-active", "true");
      expect(
        await current.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).not.toBe("rgba(0, 0, 0, 0)");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("title", "Text style · Heading 2");
      await trigger.press("ArrowDown");
      await expect(
        menu.getByRole("menuitemradio", { name: "Heading 2", exact: true }),
      ).toHaveAttribute("aria-checked", "true");
      await expect(
        menu
          .getByRole("menuitemradio", { name: "Heading 2", exact: true })
          .locator(".text-style-check"),
      ).toHaveText("✓");

      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("title", "Text style · Heading 1");
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await frame.getByRole("button", { name: "Size", exact: true }).click();
      const sizes = page.getByRole("menu", { name: "Font size", exact: true });
      await rowsFit(sizes);
      await sizes
        .getByRole("menuitemradio", { name: "30 px", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        sizes.getByRole("menuitemradio", { name: "30 px", exact: true }),
      ).toBeInViewport();
      await page.keyboard.press("Escape");
      await frame
        .getByRole("button", { name: "More block actions", exact: true })
        .click();
      const more = page.getByRole("menu", {
        name: "More block actions",
        exact: true,
      });
      await expect(
        more.getByRole("menuitem", { name: "Start on next page", exact: true }),
      ).toBeVisible();
      const order = await more
        .getByRole("menuitem")
        .evaluateAll((items) =>
          items.map((el) => el.getBoundingClientRect().top),
        );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      await page.keyboard.press("Escape");
      await expect(
        frame.getByRole("button", { name: "More block actions", exact: true }),
      ).toBeFocused();
      if (width === 375) {
        await page.evaluate(() => {
          Object.defineProperty(window.visualViewport!, "height", {
            configurable: true,
            value: 640,
          });
          window.visualViewport!.dispatchEvent(new Event("resize"));
        });
        await trigger.click();
        await rowsFit(menu);
        const box = (await menu.locator("..").boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(633);
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
      }
    });
  }
// Measure rendered colors, compositing translucent backgrounds over their ancestors.
async function paint(control: Locator) {
  return control.evaluate((el) => {
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d")!;
    canvas.width = canvas.height = 1;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const over = (top: number[], bottom: number[]) =>
      top
        .slice(0, 3)
        .map((c, n) => (c * top[3]) / 255 + bottom[n] * (1 - top[3] / 255));
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
    let bg = [255, 255, 255];
    for (const e of chain)
      bg = over(rgba(getComputedStyle(e).backgroundColor), bg);
    const s = getComputedStyle(el),
      fg = over(rgba(s.color), bg);
    const lum = (rgb: number[]) =>
      rgb
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((v, c, n) => v + c * [0.2126, 0.7152, 0.0722][n], 0);
    const a = lum(fg),
      b = lum(bg),
      r = el.getBoundingClientRect();
    return {
      color: s.color,
      background: s.backgroundColor,
      contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      width: r.width,
      height: r.height,
      border: [
        s.borderTopWidth,
        s.borderRightWidth,
        s.borderBottomWidth,
        s.borderLeftWidth,
      ],
      font: s.font,
    };
  });
}
async function activeHover(page: Page, control: Locator, hasText = true) {
  await page.mouse.move(0, 0);
  await control.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
  const before = await paint(control);
  await control.hover();
  await control.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
  if (hasText)
    await expect
      .poll(async () => (await paint(control)).contrast)
      .toBeGreaterThanOrEqual(4.5);
  const after = await paint(control);
  expect(after.color).toBe(before.color);
  expect(after.background).toBe(before.background);
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
  expect(after.border).toEqual(before.border);
  expect(after.font).toBe(before.font);
}
for (const theme of ["light", "dark"])
  test(`Studio active/hover palettes and geometry stay readable in ${theme}`, async ({
    page,
    context,
  }) => {
    await context.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    const f = await emailEditorFixture(page);
    await page.route("**/api/workspace_settings", async (route) => {
      if (route.request().method() === "GET") return route.fallback();
      Object.assign(
        f.settings,
        WorkspaceSettingsSchema.parse(route.request().postDataJSON()),
      );
      await route.fulfill({ json: f.settings });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/studio/workspace?view=styles");
    await activeHover(page, page.locator(".sidebar nav a.active"));
    if (theme === "light") await shot(page, "studio-nav-after-1440");
    await activeHover(
      page,
      page.locator('.workspace-section-list [aria-current="page"]'),
    );
    for (const name of ["Ink", "Accent", "Custom"]) {
      const control = page.getByRole("button", { name, exact: true });
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await activeHover(page, control);
      if (theme === "light" && name === "Ink")
        await shot(page, "studio-segment-after-1440");
    }
    for (const name of ["Standard", "Comfortable", "Desktop", "Phone"]) {
      const control = page.getByRole("button", { name, exact: true });
      await control.click();
      await activeHover(page, control);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(
            ".sidebar, .workspace-section-list, .proposal-styles, .editor-tabs",
          )
          .withRules(["color-contrast"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto("/studio/workspace?view=billing");
    const payment = page.getByRole("combobox", {
      name: "Payment methods",
      exact: true,
    });
    for (const value of ["card", "card_ach"]) {
      await payment.selectOption(value);
      await activeHover(page, payment);
    }
    await page.goto("/studio/products");
    await activeHover(
      page,
      page.locator('.studio-filter-chips [aria-pressed="true"]').first(),
    );
    await page.goto("/studio/workspace?view=brand");
    await page
      .getByRole("button", { name: "Edit primary color", exact: true })
      .click();
    const swatch = page
      .locator('.picker-brand-colors [aria-pressed="true"]')
      .first();
    await activeHover(page, swatch, false);
    await page.keyboard.press("Escape");
    await page.goto("/studio/emails/proposal_sent");
    for (const name of ["Desktop", "Phone", "Show values", "Show fields"]) {
      const choice = page.getByRole("button", { name, exact: true });
      await choice.click();
      await activeHover(page, choice);
    }
    await page.goto("/studio/templates");
    await activeHover(
      page,
      page
        .locator(
          '.studio-segments [aria-current="page"], .studio-segments [aria-selected="true"]',
        )
        .first(),
    );
    const t = (await f.repo.entities<any>("templates"))[0];
    await page.goto(`/studio/templates/${t.id}`);
    for (const name of ["Quote", "Fields", "Blocks", "Styles"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await activeHover(page, tab);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(
            ".sidebar, .workspace-section-list, .proposal-styles, .editor-tabs",
          )
          .withRules(["color-contrast"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto(`/proposals/${f.draft.id}`);
    for (const name of ["Quote", "Fields", "Blocks", "Styles", "Send"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await activeHover(page, tab);
    }
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.goto("/studio/workspace?view=styles");
    for (const target of [
      '.studio-area-chips [aria-current="page"]',
      '.workspace-section-list [aria-current="page"]',
    ])
      await activeHover(page, page.locator(target));
    expect(
      (
        await new AxeBuilder({ page })
          .include(
            ".sidebar, .workspace-section-list, .proposal-styles, .editor-tabs",
          )
          .withRules(["color-contrast"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });

test("a desktop text-level menu flips above a trigger near the viewport bottom", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const frame = page.locator(`[data-block-id="block-${f.content[4].id}"]`);
  await frame.locator(".tiptap").click();
  await frame.evaluate((el) => el.scrollIntoView({ block: "end" }));
  const trigger = frame.getByRole("button", {
    name: "Text style",
    exact: true,
  });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Text styles", exact: true });
  await rowsFit(menu);
  const anchor = (await trigger.boundingBox())!,
    popup = (await menu.locator("..").boundingBox())!;
  expect(anchor.y).toBeGreaterThan(700);
  expect(popup.y + popup.height).toBeLessThanOrEqual(anchor.y + 1);
});
