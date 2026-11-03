import { test, expect } from "@playwright/test";
import { setup, staff } from "../tests/helpers";
import type { Block, RichText } from "../src/lib/model";
const words = (node: RichText): string =>
  node.text ?? node.content?.map(words).join("") ?? "";
test("editor history, layered chrome and searchable anchored insertion", async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(8000);
  const { repo, service, draft, settings, members } = await setup();
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  const content: Block[] = [
    { id: crypto.randomUUID(), type: "heading", text: "Scope" },
    { id: first, type: "paragraph", text: "First paragraph" },
    { id: second, type: "paragraph", text: "Second paragraph" },
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  let active = await service.edit(
    draft.id,
    { revision: draft.revision, content },
    staff,
  );
  const template = (await repo.entities<any>("templates"))[0];
  template.content = structuredClone(content);
  await repo.put("templates", template);
  await repo.put("content_library", {
    id: crypto.randomUUID(),
    name: "Welcome note",
    block: { type: "paragraph", text: "Saved welcome" },
  } as any);
  const otherTemplate = {
    ...structuredClone(template),
    id: crypto.randomUUID(),
    name: "Other document",
    content: [
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "Keep this document",
      },
    ],
  };
  await repo.put("templates", otherTemplate);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      parts = new URL(request.url()).pathname
        .split("/")
        .filter(Boolean)
        .slice(1);
    try {
      let value: unknown;
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (request.method() === "PATCH")
          active = await service.edit(active.id, request.postDataJSON(), staff);
        value = parts[1] ? active : { items: [active], total: 1 };
      } else if (request.method() === "POST") {
        value = request.postDataJSON();
        await repo.put(parts[0] as any, value as any);
      } else value = await repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: String(error) } });
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${active.id}`);
  const bar = page.getByRole("toolbar", {
    name: "Document formatting",
    exact: true,
  });
  const undo = page
      .locator(
        '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
      )
      .getByRole("button", { name: "Undo", exact: true }),
    redo = page
      .locator(
        '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
      )
      .getByRole("button", { name: "Redo", exact: true });
  const block = (id: string) => page.locator(`[data-block-id="block-${id}"]`),
    text = block(first).locator(".tiptap");
  const savedText = () => {
    const b = active.content.find((b) => b.id === first)!;
    return b.content ? words(b.content) : b.text;
  };
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await text.fill("Edited paragraph");
  await expect.poll(savedText).toBe("Edited paragraph");
  await text.press("Control+z");
  await expect.poll(savedText).toBe("First paragraph");
  await text.press("Control+Shift+z");
  await expect.poll(savedText).toBe("Edited paragraph");
  await text.press("Meta+z");
  await expect.poll(savedText).toBe("First paragraph");
  await text.press("Meta+Shift+z");
  await expect.poll(savedText).toBe("Edited paragraph");
  await undo.click();
  await expect.poll(savedText).toBe("First paragraph");
  await page.keyboard.press("Control+y");
  await expect.poll(savedText).toBe("Edited paragraph");
  await text.click();
  await bar.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(
    bar.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await text.pressSequentially(" bold");
  await expect.poll(savedText).toContain("bold");
  // Structural undo/redo follows the normal revision-checked autosave path.
  await block(first).click();
  await block(first)
    .getByRole("button", { name: "Move down", exact: true })
    .click();
  await expect
    .poll(() => active.content.map((b) => b.id).indexOf(first))
    .toBe(2);
  await undo.click();
  await expect
    .poll(() => active.content.map((b) => b.id).indexOf(first))
    .toBe(1);
  await redo.click();
  await expect
    .poll(() => active.content.map((b) => b.id).indexOf(first))
    .toBe(2);
  await block(second).click();
  await block(second)
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  await expect
    .poll(() => active.content.some((b) => b.id === second))
    .toBe(false);
  await block(first).click();
  const reuseButton = block(first).getByRole("button", {
    name: "Save for reuse",
    exact: true,
  });
  await reuseButton.scrollIntoViewIfNeeded();
  const hit = await reuseButton.evaluate((el) => {
    const box = el.getBoundingClientRect(),
      hit = document
        .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        ?.closest("button");
    return {
      target: el.getAttribute("aria-label"),
      hit: hit?.getAttribute("aria-label"),
      box: { x: box.x, y: box.y, h: box.height },
      hitBox: hit
        ? {
            x: hit.getBoundingClientRect().x,
            y: hit.getBoundingClientRect().y,
            h: hit.getBoundingClientRect().height,
          }
        : null,
    };
  });
  expect(hit.hit, JSON.stringify(hit)).toBe("Save for reuse");
  await reuseButton.click();
  const ownedDialog = page.getByRole("dialog", {
    name: "Save for reuse",
    exact: true,
  });
  await expect(
    ownedDialog.getByRole("status").filter({ hasText: "Block deleted" }),
  ).toBeVisible();
  await page
    .getByRole("status")
    .filter({ hasText: "Block deleted" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(() => active.content.some((b) => b.id === second))
    .toBe(true);
  await ownedDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await redo.click();
  await expect
    .poll(() => active.content.some((b) => b.id === second))
    .toBe(false);
  await undo.click();
  await expect
    .poll(() => active.content.some((b) => b.id === second))
    .toBe(true);
  await block(first).click();
  await block(first)
    .getByRole("button", { name: "Duplicate block", exact: true })
    .click();
  await expect.poll(() => active.content.length).toBe(content.length + 1);
  await undo.click();
  await expect.poll(() => active.content.length).toBe(content.length);
  // DnD keyboard reorder in the quote is part of the same history.
  const quoteIds = active.quote.map((i) => i.id);
  const handle = page
    .locator(".editor-sidepanel .quote-sortable > .drag-handle")
    .first();
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("ArrowDown");
  await expect(
    page
      .locator('[id^="DndLiveRegion"]')
      .filter({ hasText: `over droppable area ${quoteIds[1]}.` }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => active.quote.map((i) => i.id)).not.toEqual(quoteIds);
  const reordered = active.quote.map((i) => i.id);
  await undo.click();
  await expect.poll(() => active.quote.map((i) => i.id)).toEqual(quoteIds);
  await redo.click();
  await expect.poll(() => active.quote.map((i) => i.id)).toEqual(reordered);
  // A block's text history wins over a later quote action, then falls through.
  await text.click();
  await text.press("Control+z");
  await expect.poll(savedText).toBe("Edited paragraph");
  expect(active.quote.map((i) => i.id)).toEqual(reordered);
  await text.press("Control+z");
  await expect.poll(savedText).toBe("First paragraph");
  expect(active.quote.map((i) => i.id)).toEqual(reordered);
  await text.press("Control+z");
  await expect.poll(() => active.quote.map((i) => i.id)).toEqual(quoteIds);
  // A plain amount input keeps native undo: the document handler must not consume it.
  const native = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      ".editor-sidepanel input:not([type=checkbox]):not([type=radio])",
    )!;
    input.focus();
    const e = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(native).toBe(false);
  await block(first).click();
  await block(first)
    .getByRole("button", { name: "Add block below", exact: true })
    .click();
  const menu = page.getByRole("dialog", { name: "Add a block", exact: true });
  await expect(
    menu.getByRole("searchbox", { name: "Search blocks" }),
  ).toBeFocused();
  await expect(
    menu.getByRole("menuitem", { name: "Pricing table", exact: true }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole("group", { name: "Saved blocks", exact: true }),
  ).toBeVisible();
  expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(320);
  await menu.getByRole("searchbox").fill("numbered");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      active.content.some(
        (b) => b.content?.content?.[0]?.type === "orderedList",
      ),
    )
    .toBe(true);
  await undo.click();
  await expect
    .poll(() =>
      active.content.some(
        (b) => b.content?.content?.[0]?.type === "orderedList",
      ),
    )
    .toBe(false);
  await redo.click();
  await expect
    .poll(() =>
      active.content.some(
        (b) => b.content?.content?.[0]?.type === "orderedList",
      ),
    )
    .toBe(true);
  const title = active.title;
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .fill("A revised title");
  await expect.poll(() => active.title).toBe("A revised title");
  await undo.click();
  await expect.poll(() => active.title).toBe(title);
  // Tokens and actual hit testing both enforce scrolling controls under pinned chrome.
  await page.setViewportSize({ width: 375, height: 800 });
  await page
    .getByRole("button", { name: "Full document", exact: true })
    .click();
  await text.click();
  expect(await bar.locator(".formatting-label").first().isVisible()).toBe(
    false,
  );
  const layers = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".quote-editor-top")!,
      bar = document.querySelector<HTMLElement>(".document-formatting-bar")!,
      control = document.querySelector<HTMLElement>(
        ".draft-block .block-tools",
      )!;
    return [control, bar, header].map((el) =>
      Number(getComputedStyle(el).zIndex),
    );
  });
  expect(layers[0]).toBeLessThan(layers[1]);
  expect(layers[1]).toBeLessThan(layers[2]);
  await text.evaluate((el) =>
    (el.closest<HTMLElement>(".editor-document-region") ?? window).scrollBy(
      0,
      el.getBoundingClientRect().top - 20,
    ),
  );
  expect(
    await page.locator(".quote-editor-top").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + 40, Math.max(1, r.y + 20)),
      );
    }),
  ).toBe(true);
  const last = page.locator(".draft-block").last();
  await last.evaluate((el) =>
    (el as HTMLElement).focus({ preventScroll: true }),
  );
  const plus = last.getByRole("button", {
    name: "Add block below",
    exact: true,
  });
  await plus.evaluate((el) => {
    el.scrollIntoView({ block: "end" });
    (
      document.querySelector<HTMLElement>(".editor-document-region") ?? window
    ).scrollBy(0, 80);
  });
  await plus.click();
  await expect(menu).toHaveAttribute("data-placement", "above");
  expect(
    (await menu.boundingBox())!.y + (await menu.boundingBox())!.height,
  ).toBeLessThanOrEqual((await plus.boundingBox())!.y);
  // A server page update can move the anchor without a scroll/resize event.
  // The menu follows it and constrains its own scroll area on the chosen side.
  await plus.evaluate((el) => (el.style.translate = "0 -40px"));
  await expect
    .poll(async () => {
      const m = (await menu.boundingBox())!,
        a = (await plus.boundingBox())!;
      return a.y - (m.y + m.height);
    })
    .toBeCloseTo(6, 0);
  await plus.evaluate((el) => (el.style.translate = ""));
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  // Toggles/radios have no native text undo; they must still reach document history.
  expect(
    await page.evaluate(() => {
      const control =
        document.querySelector<HTMLInputElement>(
          '.editor-sidepanel input[type="checkbox"]',
        ) ??
        document.querySelector<HTMLInputElement>(
          '.editor-paper input[type="checkbox"]',
        );
      if (!control) throw new Error("Fixture needs a quote toggle");
      control.focus();
      return [false, true].map((shiftKey) => {
        const event = new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          shiftKey,
          bubbles: true,
          cancelable: true,
        });
        control.dispatchEvent(event);
        return event.defaultPrevented;
      });
    }),
  ).toEqual([true, true]);
  // A reload discards session history, not the saved proposal.
  await expect(
    page.getByText(/^(All changes saved|Draft · Saved)$/, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  // Template editor uses the same menu, groups, keyboard and history engine.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${template.id}`);
  const templateBlock = page.locator(".studio-block-card").nth(1);
  await templateBlock.click();
  await templateBlock
    .getByRole("button", { name: "Add block below", exact: true })
    .click();
  await expect(menu.getByRole("searchbox")).toBeFocused();
  await menu.getByRole("searchbox").fill("Welcome");
  await page.keyboard.press("Enter");
  await expect(page.locator(".studio-block-card")).toHaveCount(
    content.length + 1,
  );
  await page
    .locator(
      '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
    )
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(page.locator(".studio-block-card")).toHaveCount(content.length);
  const beforeSwitch = page.locator(".studio-block-card").nth(1);
  await beforeSwitch.click();
  await beforeSwitch
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  const oldToast = page
    .getByRole("status")
    .filter({ hasText: "Block deleted" });
  await expect(oldToast).toBeVisible();
  if (
    !(await page
      .locator(".template-link")
      .filter({ hasText: "Other document" })
      .isVisible())
  )
    await page
      .getByRole("button", {
        name: /^Expand (Pages|Sections) sidebar$/,
        exact: true,
      })
      .click();
  await page
    .locator(".template-link")
    .filter({ hasText: "Other document" })
    .click();
  await oldToast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".studio-block-card")).toHaveCount(1);
  await expect(page.locator(".studio-block-card")).toContainText("Text");
  await expect(
    page
      .locator(
        '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
      )
      .getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
