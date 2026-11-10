import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";
const id = () => crypto.randomUUID();
const content = (): Block[] => [
  { id: id(), type: "heading", level: 1, text: "Overview" },
  {
    id: id(),
    type: "paragraph",
    text: "Hello {{client.name}}, a useful proposal for your team.",
    ai_review: { source: "assistant", reviewed: false },
  },
  { id: id(), type: "pricing_table" },
  { id: id(), type: "signature_block", role: "client" },
  { id: id(), type: "contract", text: "Terms", clauses: [] },
];
async function open(page: Page, width = 1440, long = false) {
  const blocks = content();
  if (long)
    blocks[1].text =
      "A long, useful paragraph with line-boundary text. ".repeat(260);
  const f = await editorFixture(page, false, { content: blocks });
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".quote-workspace")).toHaveAttribute(
    "data-panels-ready",
    "true",
  );
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  if (width < 960)
    await page.getByRole("button", { name: /^Open Quote\b/ }).click();
  if (width < 960) await page.keyboard.press("Escape");
  return { ...f, blocks };
}
async function select(page: Page, block: Block) {
  const frame = page.locator(`[data-block-id="block-${block.id}"]`);
  await frame.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await frame.focus();
  await expect(frame).toHaveAttribute("data-selected", "true");
  return frame;
}
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
for (const width of [1440, 1180, 1024, 924])
  test(`edit bars stay one line with visible Delete and More at ${width}`, async ({
    page,
  }) => {
    const f = await open(page, width);
    for (const b of [f.blocks[1], f.blocks[2]]) {
      const frame = await select(page, b),
        bar = frame.locator(".editor-edit-bar");
      if (b.type === "paragraph") await frame.locator(".tiptap").click();
      await expect(bar).toBeVisible();
      await expect(bar).toHaveCSS("opacity", "1");
      await expect(bar).toHaveCSS("margin", "0px");
      await expect(bar).toHaveCSS("background-color", "rgb(24, 34, 38)");
      if (b.type === "paragraph") {
        const field = bar.getByRole("button", {
          name: "Insert field",
          exact: true,
        });
        const fit = await field.evaluate((el) => {
          const button = el.getBoundingClientRect(),
            label = el
              .querySelector(".edit-field-label")!
              .getBoundingClientRect();
          return label.left >= button.left && label.right <= button.right;
        });
        expect(fit).toBe(true);
      }
      await expect(
        bar.getByRole("button", { name: "More block actions", exact: true }),
      ).toBeVisible();
      const geometry = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          main = el.closest(".editor-document-region")!,
          m = main.getBoundingClientRect(),
          header = document.querySelector(".editor-document-header")!,
          del = el.querySelector<HTMLElement>('[aria-label="Delete block"]')!,
          d = del.getBoundingClientRect();
        return {
          height: r.height,
          right: r.right,
          limit: innerWidth - 8,
          scrolling: el.scrollWidth > el.clientWidth,
          main: [main.scrollWidth, main.clientWidth],
          header: [header.scrollWidth, header.clientWidth],
          deleteVisible: d.left >= 8 && d.right <= innerWidth - 8,
          hit: del.contains(
            document.elementFromPoint(
              d.left + d.width / 2,
              d.top + d.height / 2,
            ),
          ),
        };
      });
      expect(geometry.height).toBeCloseTo(40, 0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.limit + 1);
      expect(geometry.scrolling).toBe(false);
      expect(geometry.main[0]).toBe(geometry.main[1]);
      expect(geometry.header[0]).toBe(geometry.header[1]);
      expect(geometry.deleteVisible).toBe(true);
      expect(geometry.hit).toBe(true);
      const dup = bar.getByRole("button", {
        name: "Duplicate block",
        exact: true,
      });
      if (b.type === "pricing_table") {
        await expect(dup).toBeDisabled();
        await expect(dup).toHaveAttribute("aria-disabled", "true");
        await expect(dup).toHaveAttribute(
          "title",
          "Only one pricing table per proposal",
        );
      } else await expect(dup).toBeEnabled();
      await bar
        .getByRole("button", { name: "Delete block", exact: true })
        .click();
      if (b.type === "pricing_table")
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      else {
        await page
          .getByRole("status")
          .filter({ hasText: "Block deleted" })
          .getByRole("button", { name: "Undo", exact: true })
          .click();
        await expect(frame).toBeVisible();
      }
    }
    const sig = await select(page, f.blocks[3]);
    await expect(
      sig.getByRole("button", { name: "Duplicate block", exact: true }),
    ).toBeDisabled();
    await expect(sig.locator(".edit-settings-label")).toBeVisible();
    await expect(sig.locator(".edit-settings-label")).toHaveText("Settings");
    await sig
      .getByRole("button", { name: "Block settings", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Signature settings", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Signature settings", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        ".document-cover :is(.editor-edit-bar,.editor-gutter,.editor-ai-check)",
      ),
    ).toHaveCount(0);
  });
test("924px preserves the modal tools drawer: scrim, focus trap and Escape", async ({
  page,
}) => {
  const f = await open(page, 924);
  const trigger = page.getByRole("button", { name: /^Open Quote\b/ });
  const drawer = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  await trigger.click();
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((el) => el.matches(":modal"))).toBe(true);
  const backdrop = await drawer.evaluate(
    (el) => getComputedStyle(el, "::backdrop").backgroundColor,
  );
  expect(backdrop).not.toBe("rgba(0, 0, 0, 0)");
  const controls = drawer.locator(
    'button:not(:disabled):not([tabindex="-1"]),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
  );
  async function nativeWrap(key: "Tab" | "Shift+Tab", target: typeof controls) {
    await page.keyboard.press(key);
    if (!(await target.evaluate((el) => el === document.activeElement))) {
      // Chromium's native modal may visit browser chrome between its last and
      // first controls. It must never focus the inert proposal underneath.
      expect(
        await page.evaluate(() => ({
          body: document.activeElement === document.body,
          pageFocused: document.hasFocus(),
        })),
      ).toEqual({ body: true, pageFocused: false });
      await page.keyboard.press(key);
    }
    await expect(target).toBeFocused();
  }
  await controls.last().focus();
  await nativeWrap("Tab", controls.first());
  await nativeWrap("Shift+Tab", controls.last());
  await page
    .locator(`[data-block-id="block-${f.blocks[1].id}"] .tiptap`)
    .evaluate((el) => (el as HTMLElement).focus());
  await expect(controls.last()).toBeFocused();
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBeGreaterThan(0);
  await page.mouse.click(box.x / 2, 100);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("text style conversions preserve chips; formatting retains selection and focus; Option uses Digit codes", async ({
  page,
}) => {
  const f = await open(page),
    frame = await select(page, f.blocks[1]),
    input = frame.locator(".tiptap");
  await input.click();
  const bar = frame.locator(".editor-edit-bar");
  await bar.getByRole("button", { name: "Text style", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Heading 2/ }).click();
  await expect(frame.locator(".tiptap")).toHaveText(
    "Hello Client Name, a useful proposal for your team.",
  );
  await bar.getByRole("button", { name: "Text style", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Paragraph/ }).click();
  await expect(frame.locator(".field-chip")).toHaveAttribute(
    "data-field",
    "client.name",
  );
  await input.click();
  await input.press("ControlOrMeta+a");
  await bar.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input.locator("strong")).toContainText("Hello");
  await input.press("Alt+Digit2");
  await expect(frame.locator(".tiptap")).toHaveText(
    "Hello Client Name, a useful proposal for your team.",
  );
  await expect(frame.locator("h3")).toBeVisible();
});
test("gutter insertion, menus, extra commands and AI review use existing actions", async ({
  page,
}) => {
  const f = await open(page),
    frame = await select(page, f.blocks[1]);
  await expect(frame.locator(".editor-ai-check")).toBeVisible();
  const colors = await frame.evaluate((el) => ({
    line: getComputedStyle(el, "::before").backgroundColor,
    check: getComputedStyle(el.querySelector(".editor-ai-check")!)
      .borderTopColor,
  }));
  expect(colors.line).toBe("rgb(180, 83, 42)");
  expect(colors.check).toBe(colors.line);
  await frame
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  await expect(
    page.getByRole("menu", { name: "More block actions", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menu", { name: "More block actions", exact: true }),
  ).toHaveCount(0);
  await expect(frame).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(frame).toHaveAttribute("data-selected", "false");
  await select(page, f.blocks[0]);
  await page
    .getByRole("button", { name: "Add a block above", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Text", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  await expect.poll(() => f.active().content[0].id).not.toBe(f.blocks[0].id);
  const inserted = f.active().content[0].id;
  await expect(
    page.locator(`[data-block-id="block-${inserted}"]`),
  ).toHaveAttribute("data-selected", "true");
  await select(page, f.blocks[1]);
  await page
    .getByRole("button", { name: "Add a block below", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  await expect
    .poll(
      () =>
        f.active().content.findIndex((b) => b.id === f.blocks[2].id) -
        f.active().content.findIndex((b) => b.id === f.blocks[1].id),
    )
    .toBe(2);
  await select(page, f.blocks[1]);
  await frame
    .getByRole("button", {
      name: "Mark this AI-written block reviewed",
      exact: true,
    })
    .click();
  const toast = page.getByRole("status").filter({ hasText: "Marked reviewed" });
  await expect(toast).toBeVisible();
  await expect(frame.locator(".editor-ai-check")).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.locator(".editor-ai-check")).toBeVisible();
  const contract = await select(page, f.blocks[4]);
  await contract
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add clause", exact: true }).click();
  await expect
    .poll(
      () =>
        f.active().content.find((b) => b.id === f.blocks[4].id)?.clauses
          ?.length,
    )
    .toBe(1);
});

test("toolbar roving keys and Tab traverse text, bar, above, handle, below and AI check", async ({
  page,
}) => {
  const f = await open(page),
    frame = await select(page, f.blocks[1]),
    input = frame.locator(".tiptap");
  await input.click();
  await input.press("Tab");
  const bar = frame.locator(".editor-edit-bar"),
    style = bar.getByRole("button", { name: "Text style", exact: true });
  await expect(style).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    bar.getByRole("button", { name: "Size", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(style).toBeFocused();
  for (const name of [
    "Add a block above",
    "Drag block 2",
    "Add a block below",
    "Mark this AI-written block reviewed",
  ]) {
    await page.keyboard.press("Tab");
    await expect(
      frame.getByRole("button", { name, exact: true }),
    ).toBeFocused();
  }
  await page.keyboard.press("Shift+Tab");
  await expect(
    frame.getByRole("button", { name: "Add a block below", exact: true }),
  ).toBeFocused();
});
test("selected chrome, menus and review check never change page starts or PDF page count", async ({
  page,
}) => {
  const f = await open(page, 1440, true),
    paper = page.locator(".editor-paper");
  const read = async () =>
    JSON.parse((await paper.getAttribute("data-pagination"))!);
  const before = await read();
  expect(before.pages).toBeGreaterThan(2);
  const render = async (plan: any) =>
    page.evaluate(
      async ({ id, pagination }) => {
        const response = await fetch(`/api/proposals/${id}/preview-pdf`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pagination }),
        });
        if (!response.ok) throw Error(await response.text());
        return response.json();
      },
      { id: f.draft.id, pagination: plan },
    );
  const first = await render(before),
    frame = await select(page, f.blocks[1]);
  await frame.locator(".tiptap").click();
  await expect(frame.locator(".editor-edit-bar")).toBeVisible();
  await expect(frame.locator(".editor-gutter")).toBeVisible();
  await expect(frame.locator(".editor-ai-check")).toBeVisible();
  for (const name of ["More block actions", "Text style"]) {
    await frame.getByRole("button", { name, exact: true }).click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    expect(await read()).toEqual(before);
    await page.keyboard.press("Escape");
  }
  expect(await read()).toEqual(before);
  const selected = await render(await read()),
    { PDFDocument } = await import("pdf-lib");
  expect(
    (
      await PDFDocument.load(Buffer.from(selected.pdf_base64, "base64"))
    ).getPageCount(),
  ).toBe(
    (
      await PDFDocument.load(Buffer.from(first.pdf_base64, "base64"))
    ).getPageCount(),
  );
  expect(selected.layout.pages).toBe(first.layout.pages);
  expect(f.patches).toHaveLength(0);
});
for (const width of [1440, 924])
  test(`Studio template shares text/object bar and gutter at ${width}`, async ({
    page,
  }) => {
    const f = await open(page, width),
      template = (await f.repo.entities<any>("templates"))[0];
    await page.goto(`/studio/templates/${template.id}`);
    await expect(
      page.locator(".template-paged-paper .editor-page-sheets"),
    ).toHaveAttribute("data-layout-settled", "true");
    const history = page.getByRole("toolbar", {
      name: "Template history",
      exact: true,
    });
    await expect(history).toBeVisible();
    await expect(
      history.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    const originalCount = await page.locator(".studio-block-card").count();
    const frame = page.locator(`[data-block-id="template-${f.blocks[1].id}"]`);
    await frame.locator(".tiptap").click();
    const bar = frame.locator(".editor-edit-bar");
    await expect(bar).toBeVisible();
    expect((await bar.boundingBox())!.height).toBeCloseTo(40, 0);
    await expect(
      frame.getByRole("button", { name: "Add a block above", exact: true }),
    ).toBeVisible();
    await frame
      .getByRole("button", { name: "Add a block below", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Text", exact: true }).click();
    await expect(
      page.locator('.block-frame[data-selected="true"] .tiptap'),
    ).toBeFocused();
    await expect(page.locator(".studio-block-card")).toHaveCount(
      originalCount + 1,
    );
    await history.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".studio-block-card")).toHaveCount(originalCount);
    await history.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".studio-block-card")).toHaveCount(
      originalCount + 1,
    );
    const pricing = page.locator(
      `[data-block-id="template-${f.blocks[2].id}"]`,
    );
    await pricing.focus();
    await expect(
      pricing.getByRole("button", { name: "Duplicate block", exact: true }),
    ).toBeDisabled();
  });

for (const theme of ["light", "dark"]) {
  test(`template history matches the proposal header buttons in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    const f = await open(page, 1440);
    const proposalUndo = page
      .locator(".editor-header-history")
      .getByRole("button", { name: "Undo", exact: true });
    await expect(proposalUndo).toBeDisabled();
    const appearance = (el: Element) => {
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        color: s.color,
        opacity: s.opacity,
        background: s.backgroundColor,
        border: s.borderTopWidth,
        radius: s.borderRadius,
        font: s.font,
      };
    };
    const expected = await proposalUndo.evaluate(appearance);
    expect(expected.width).toBe(36);
    expect(expected.height).toBe(36);
    expect(expected.opacity).toBe("0.4");
    const template = (await f.repo.entities<any>("templates"))[0];
    await page.goto(`/studio/templates/${template.id}`);
    const controls = page.getByRole("toolbar", {
      name: "Template history",
      exact: true,
    });
    for (const width of [1440, 924, 700]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(controls).toBeVisible();
      for (const name of ["Undo", "Redo"]) {
        const button = controls.getByRole("button", { name, exact: true });
        await expect(button).toBeDisabled();
        expect(await button.evaluate(appearance)).toEqual(expected);
      }
    }
    await page.setViewportSize({ width: 375, height: 1000 });
    await expect(controls).toBeHidden();
  });
}

test("requested PR 2 captures at 1440, 1024 and unchanged phone 375", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE_EDITOR_V2_CONTROLS !== "1",
    "Only capture the three requested PR images.",
  );
  const f = await open(page, 1440);
  await mkdir("docs/screenshots", { recursive: true });
  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(page.locator(".quote-workspace")).toHaveAttribute(
      "data-panels-ready",
      "true",
    );
    await page.evaluate(() => document.fonts.ready);
    if (width < 700) await expect(page.locator(".editor-paper")).toBeVisible();
    const frame = await select(page, f.blocks[1]);
    await frame.locator(".tiptap").focus();
    await page.screenshot({
      path: `docs/screenshots/editor-v2-controls-${width}-light.png`,
    });
  }
});
