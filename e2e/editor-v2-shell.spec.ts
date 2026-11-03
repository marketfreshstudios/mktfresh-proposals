import { test, expect, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";
import { blockText } from "../src/lib/editor-document";
import { mkdir } from "node:fs/promises";
const id = () => crypto.randomUUID();
function aiContent(): Block[] {
  return ["Overview", "Scope", "Timeline"].flatMap((text, n) => [
    ...(n ? [{ id: id(), type: "page_break" as const }] : []),
    { id: id(), type: "heading" as const, text, level: 1 as const },
    {
      id: id(),
      type: "paragraph" as const,
      text: `${text} local proposal text.`,
      ai_review: { source: "assistant" as const, reviewed: false },
    },
    ...(n === 0
      ? [
          {
            id: id(),
            type: "paragraph" as const,
            text: "A second AI paragraph in the same section.",
            ai_review: { source: "assistant" as const, reviewed: false },
          },
        ]
      : []),
  ]);
}
async function ready(page: Page, proposal: string, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/proposals/${proposal}`);
  await expect(page.locator(".quote-workspace")).toHaveAttribute(
    "data-panels-ready",
    "true",
  );
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
}
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
for (const width of [1440, 1180, 1024, 960, 959, 924, 768, 700])
  test(`v2 shell fits header and selected document with tools open at ${width}`, async ({
    page,
  }) => {
    const f = await editorFixture(page, false, { content: aiContent() });
    await f.editRemote({
      title: "A long proposal title that must stay readable in its tooltip "
        .repeat(4)
        .slice(0, 200),
    });
    await ready(page, f.draft.id, width);
    const frame = page
      .locator(".block-frame")
      .filter({ has: page.locator(".tiptap") })
      .first();
    await frame.locator(".tiptap").click();
    if (width < 960) await page.keyboard.press("Control+Backslash");
    await expect(frame).toHaveAttribute("data-selected", "true");
    const bounds = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".editor-v2-header")!,
        main = document.querySelector<HTMLElement>(".editor-document-region")!,
        send = header.querySelector<HTMLElement>(".editor-header-send")!,
        title = header.querySelector<HTMLElement>(".editor-header-title")!;
      const box = send.getBoundingClientRect();
      return {
        header: [header.scrollWidth, header.clientWidth],
        main: [main.scrollWidth, main.clientWidth],
        send: { left: box.left, right: box.right },
        width: innerWidth,
        ellipsis: getComputedStyle(title).textOverflow,
        title: title.title,
        label: title.getAttribute("aria-label"),
        sibling: title.nextElementSibling?.className,
      };
    });
    expect(bounds.header[0]).toBe(bounds.header[1]);
    expect(bounds.main[0]).toBe(bounds.main[1]);
    expect(bounds.send.left).toBeGreaterThanOrEqual(0);
    expect(bounds.send.right).toBeLessThanOrEqual(width);
    expect(bounds.ellipsis).toBe("ellipsis");
    expect(bounds.title).toHaveLength(200);
    expect(bounds.label).toBe(bounds.title);
    expect(bounds.sibling).toBe("editor-save-status");
    const header = page.locator(".editor-v2-header");
    await expect(
      header.getByRole("button", { name: "Undo", exact: true }),
    ).toHaveCount(width < 960 ? 0 : 1);
    await expect(
      header.getByRole("button", { name: "Redo", exact: true }),
    ).toHaveCount(width < 960 ? 0 : 1);
    await expect(header.locator(".editor-save-status")).toHaveText(
      width < 960 ? "Saved" : "Draft · Saved",
    );
    await expect(page.locator(".sidebar")).toBeHidden();
  });
for (const width of [768, 924])
  test(`tablet header keeps keyboard undo/redo and AI navigation at ${width}`, async ({
    page,
  }) => {
    const content = aiContent(),
      f = await editorFixture(page, false, { content });
    await ready(page, f.draft.id, width);
    const header = page.locator(".editor-v2-header"),
      input = page.locator(`[data-block-id="block-${content[1].id}"] .tiptap`),
      original = content[1].text!,
      changed = "A tablet edit retained by the existing document history.";
    await input.fill(changed);
    await expect(input).toHaveText(changed);
    // Header focus verifies document shortcuts, independently of a text block's
    // selection/history or any visible Undo/Redo control.
    await header
      .getByRole("button", { name: "Back to proposals", exact: true })
      .focus();
    for (const modifier of ["Control", "Meta"]) {
      await page.keyboard.press(`${modifier}+z`);
      await expect(input).toHaveText(original);
      await page.keyboard.press(`${modifier}+Shift+z`);
      await expect(input).toHaveText(changed);
    }
    await expect(
      header.getByRole("button", { name: "Undo", exact: true }),
    ).toHaveCount(0);
    await expect(
      header.getByRole("button", { name: "Redo", exact: true }),
    ).toHaveCount(0);
    const pill = header.getByRole("button", {
      name: "3 to review",
      exact: true,
    });
    await expect(pill).toHaveText("3 to review");
    await expect(pill.locator("svg")).toHaveCount(0);
    await pill.click();
    await expect(
      page.locator(`[data-block-id="block-${content[1].id}"]`),
    ).toHaveAttribute("data-selected", "true");
    await pill.click();
    await expect(
      page.locator(`[data-block-id="block-${content[5].id}"]`),
    ).toHaveAttribute("data-selected", "true");
  });
test("exact breakpoint defaults, mutually exclusive narrow panels, shortcuts and stored choices", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await ready(page, f.draft.id, 1440);
  await expect(page.locator(".editor-v2-sections")).not.toHaveClass(
    /sidebar-rail/,
  );
  await expect(page.locator(".editor-v2-panel")).not.toHaveClass(
    /sidebar-rail/,
  );
  await page.keyboard.press("Control+Backslash");
  await page.keyboard.press("Control+Shift+Backslash");
  await page.reload();
  await expect(page.locator(".editor-v2-sections")).toHaveClass(/sidebar-rail/);
  await expect(page.locator(".editor-v2-panel")).toHaveClass(/sidebar-rail/);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(page.locator(".editor-v2-sections")).toHaveClass(/sidebar-rail/);
  await expect(page.locator(".editor-v2-panel")).not.toHaveClass(
    /sidebar-rail/,
  );
  await page
    .getByRole("button", { name: "Expand Sections sidebar", exact: true })
    .click();
  await expect(page.locator(".editor-v2-sections")).not.toHaveClass(
    /sidebar-rail/,
  );
  await expect(page.locator(".editor-v2-panel")).toHaveClass(/sidebar-rail/);
  await page.reload();
  await expect(page.locator(".editor-v2-sections")).not.toHaveClass(
    /sidebar-rail/,
  );
  await expect(page.locator(".editor-v2-panel")).toHaveClass(/sidebar-rail/);
  await page.setViewportSize({ width: 924, height: 1000 });
  await expect(page.locator(".editor-v2-sections")).toHaveClass(/sidebar-rail/);
  await expect(page.locator(".editor-v2-panel")).toHaveClass(/sidebar-rail/);
  await page.getByRole("button", { name: "Open Fields", exact: true }).click();
  const drawer = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await page
    .getByRole("tab", { name: "Fields", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Styles", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Styles", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
test("AI pill counts sections, cycles in order and wraps, then distinguishes done from never-AI", async ({
  page,
}) => {
  const content = aiContent(),
    f = await editorFixture(page, false, { content });
  await ready(page, f.draft.id, 1440);
  const pill = page.getByRole("button", {
    name: "3 to review · Next",
    exact: true,
  });
  await expect(pill).toHaveText("3 to review · Next ›");
  const pending = content.filter((b) => b.ai_review);
  for (const b of [pending[0], pending[2], pending[3], pending[0]]) {
    await pill.click();
    await expect(
      page.locator(`[data-block-id="block-${b.id}"]`),
    ).toHaveAttribute("data-selected", "true");
  }
  await page
    .getByRole("button", { name: "Mark all reviewed", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm all reviewed", exact: true })
    .click();
  await expect(
    page.getByText("✓ AI review done", { exact: true }),
  ).toBeVisible();
  // New fixture route replaces only test data; a never-AI proposal has no completion pill.
  const clean = await editorFixture(page);
  await ready(page, clean.draft.id, 1440);
  await expect(page.locator(".editor-ai-pill")).toHaveCount(0);
});
test("saving stays editable; a 409 locks controls until Reload and keeps the local version", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let hold = true;
  const f = await editorFixture(page, false, {
    beforeSave: async () => {
      if (hold) await gate;
    },
  });
  await ready(page, f.draft.id, 1440);
  const input = page.locator(
    `[data-block-id="block-${f.content[1].id}"] .tiptap`,
  );
  const local = "Keep my local edit after a revision conflict.";
  await input.fill(local);
  await expect.poll(() => f.patches.length).toBe(1);
  await expect(page.locator(".editor-save-status")).toHaveText("Saving…");
  await expect(input).toBeEditable();
  await f.editRemote({ title: "Another person edited the proposal" });
  hold = false;
  release();
  await expect(page.locator(".editor-notice-stale")).toContainText(
    "This proposal changed in another tab or by another person.",
  );
  await expect(input).toHaveAttribute("contenteditable", "false");
  await expect(page.locator(".block-tools").first()).not.toBeVisible();
  await expect(page.locator(".editor-sidepanel input").first()).toBeDisabled();
  await expect(input).toHaveText(local);
  await page.keyboard.press("Control+z");
  await expect(input).toHaveText(local);
  await page
    .locator(".editor-notice-stale")
    .getByRole("button", { name: "Reload", exact: true })
    .click();
  await expect(page.locator(".editor-notice-recovered")).toBeVisible();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect.poll(() => blockText(f.active().content[1])).toBe(local);
  await expect(input).toBeEditable();
  expect(f.patches).toHaveLength(2);
});
test("375px retains the current phone header and keeps Review & send inside the viewport", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".quote-workspace")).toHaveAttribute(
    "data-shell-mode",
    "phone",
  );
  await expect(page.locator(".editor-v2-header")).toHaveCount(0);
  await expect(page.locator(".phone-section-list")).toBeVisible();
  const send = page.getByRole("button", { name: "Review & send", exact: true });
  await expect(send).toBeVisible();
  const box = (await send.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
test("Escape from a focused formatting trigger closes the picker before deselecting", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await ready(page, f.draft.id, 1440);
  const block = page.locator(`[data-block-id="block-${f.content[1].id}"]`);
  await block.locator(".tiptap").click();
  const bar = page.getByRole("toolbar", {
    name: "Document formatting",
    exact: true,
  });
  const trigger = bar.getByRole("button", {
    name: "Insert field",
    exact: true,
  });
  await trigger.click();
  await trigger.focus();
  await expect(page.locator(".field-picker:popover-open")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".field-picker:popover-open")).toHaveCount(0);
  await expect(block).toHaveAttribute("data-selected", "true");
  await block.locator(".tiptap").click();
  await bar.getByRole("combobox", { name: "Text style", exact: true }).click();
  await expect(
    page.getByRole("listbox", { name: "Text styles", exact: true }),
  ).toBeVisible();
});

test("requested shell screenshots at 1440, 1024 and unchanged phone 375", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE_EDITOR_V2 !== "1",
    "Capture only for the requested PR screenshots.",
  );
  const f = await editorFixture(page, false, { content: aiContent() });
  await mkdir("docs/screenshots", { recursive: true });
  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(page.locator(".quote-workspace")).toHaveAttribute(
      "data-panels-ready",
      "true",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `docs/screenshots/editor-v2-shell-${width}-light.png`,
      fullPage: false,
    });
  }
});
