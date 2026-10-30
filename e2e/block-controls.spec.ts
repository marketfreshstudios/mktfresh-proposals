import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import type { Block } from "../src/lib/model";

test("block controls own one block and never move document content on hover, focus or touch", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(8000);
  const { repo, service, draft, settings, members } = await setup();
  const content: Block[] = [
    { id: crypto.randomUUID(), type: "heading", text: "Your next chapter" },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "We’ll plan a clear scope together, keep you informed, and prepare the next steps.",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "This second section keeps its position when the controls for a neighbour appear.",
    },
    {
      id: crypto.randomUUID(),
      type: "contract",
      text: "Agreement",
      clauses: [
        {
          id: crypto.randomUUID(),
          heading: "1. Scope",
          show_when: null,
          body: "The agreed scope is described in this proposal.",
        },
        {
          id: crypto.randomUUID(),
          heading: "2. Changes",
          show_when: null,
          body: "We will agree any changes in writing.",
        },
      ],
    },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  let active = await service.edit(
    draft.id,
    { revision: draft.revision, content },
    staff,
  );
  const template = (await repo.entities<any>("templates")).find(
    (t) => t.id === draft.template_id,
  )!;
  template.content = structuredClone(content);
  await repo.put("templates", template);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (req.method() === "PATCH")
          active = await service.edit(active.id, req.postDataJSON(), staff);
        value = parts[1] ? active : { items: [active], total: 1 };
      } else if (req.method() === "POST") {
        value = req.postDataJSON();
        await repo.put(parts[0] as any, value as any);
      } else value = await repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  const dir = ".data/evidence/block-controls";
  await mkdir(dir, { recursive: true });
  const captures: {
    file: string;
    state: string;
    width: number;
    theme: string;
  }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function shot(state: string, width: number, theme: string) {
    await page.evaluate(() => document.fonts.ready);
    const file = `${state}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    captures.push({ file, state, width, theme });
  }
  async function showBlock(block: Locator, width: number, editor: string) {
    if (editor === "proposal" && width === 375 && !(await block.isVisible())) {
      const id = await block.evaluate(
        (el) => el.closest(".document-section")!.id,
      );
      await page
        .getByRole("button", { name: "‹ Sections", exact: true })
        .click();
      await page
        .locator(".phone-section-list button")
        .nth(Number(id.split("-").at(-1)))
        .click();
    }
    await block.evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -190);
    });
  }
  async function positions(p: Page) {
    return p.locator(".block-frame").evaluateAll((els) => ({
      scroll: scrollY,
      blocks: els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: (el as HTMLElement).dataset.blockId,
          x: r.x,
          y: r.y + scrollY,
          w: r.width,
          h: r.height,
        };
      }),
    }));
  }
  async function unchanged(before: Awaited<ReturnType<typeof positions>>) {
    const after = await positions(page);
    expect(after.blocks.length).toBe(before.blocks.length);
    expect(Math.abs(after.scroll - before.scroll)).toBeLessThanOrEqual(1);
    for (let n = 0; n < before.blocks.length; n++)
      for (const key of ["x", "y", "w", "h"] as const)
        expect(
          Math.abs(after.blocks[n][key] - before.blocks[n][key]),
          `${before.blocks[n].id} ${key}`,
        ).toBeLessThanOrEqual(1);
  }
  for (const theme of ["light", "dark"]) {
    await context.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const editor of ["proposal", "template"]) {
        const path =
          editor === "proposal"
            ? `/proposals/${active.id}`
            : `/studio/templates/${template.id}`;
        if (process.env.BLOCK_BASELINE_URL && width !== 768) {
          await page.goto(`${process.env.BLOCK_BASELINE_URL}${path}`);
          await expect(
            page.locator(
              editor === "proposal" ? ".quote-workspace" : ".studio-blocks",
            ),
          ).toBeVisible();
          if (editor === "proposal" && width === 375)
            await page.locator(".phone-section-list button").first().click();
          const old = page.locator(
            editor === "proposal" ? ".draft-block" : ".studio-block-card",
          );
          await (
            editor === "proposal" ? old.locator(".tiptap").first() : old.nth(1)
          ).hover();
          await shot(`${editor}-before`, width, theme);
          if (editor === "proposal") {
            const clause = page.locator(".contract-editor details").first();
            await showBlock(clause, width, editor);
            await clause.locator("summary").click();
            await clause.hover();
          } else
            await page.locator(".contract-clause-list button").first().hover();
          await shot(`${editor}-clause-before`, width, theme);
        }
        await page.goto(path);
        await expect(
          page.locator(
            editor === "proposal" ? ".quote-workspace" : ".studio-blocks",
          ),
        ).toBeVisible();
        if (editor === "proposal" && width === 375)
          await page.locator(".phone-section-list button").first().click();
        if (editor === "proposal")
          await expect(page.locator(".tiptap").first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const blocks = page.locator(".block-frame");
        expect(await blocks.count()).toBe(7);
        for (let n = 0; n < (await blocks.count()); n++) {
          const block = blocks.nth(n);
          await showBlock(block, width, editor);
          await page.keyboard.press("Escape");
          await page.mouse.move(1, 1);
          const before = await positions(page);
          // Target the content owned by this frame, rather than a nested clause.
          await block.hover({ position: { x: 5, y: 20 } });
          await expect(block).toHaveAttribute("data-active", "true");
          await unchanged(before);
          await expect(
            page.locator('.block-frame[data-active="true"]'),
          ).toHaveCount(1);
          await expect(page.locator(".block-tools:visible")).toHaveCount(1);
          await expect(
            page.locator(".block-sortable > .drag-handle:visible"),
          ).toHaveCount(1);
          const dragHandle = block
            .locator("..")
            .locator(":scope > .drag-handle");
          await dragHandle.hover();
          if (width === 375) {
            const rect = (await dragHandle.boundingBox())!;
            expect(rect.width).toBeGreaterThanOrEqual(44);
            expect(rect.height).toBeGreaterThanOrEqual(44);
            expect(rect.x).toBeGreaterThanOrEqual(0);
          }

          await expect(block).toHaveAttribute("data-active", "true");
          await unchanged(before);
          await block.evaluate((el) =>
            (el as HTMLElement).focus({ preventScroll: true }),
          );
          await unchanged(before);
          await page.mouse.move(1, 1);
          await expect(block).toHaveAttribute("data-active", "true");
          await unchanged(before);
          await page.keyboard.press("Escape");
          await expect(
            page.locator('.block-frame[data-active="true"]'),
          ).toHaveCount(0);
          await unchanged(before);
        }
        const paragraph = blocks.nth(1);
        await showBlock(paragraph, width, editor);
        // A touchscreen tap uses the same pointer selection path, with no hover dependency.
        await paragraph.dispatchEvent("pointerdown", {
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
        });
        await expect(paragraph).toHaveAttribute("data-selected", "true");
        await page.mouse.move(1, 1);
        await expect(paragraph.locator(":scope > .block-tools")).toBeVisible();
        if (editor === "proposal") {
          await expect(paragraph.locator(".tiptap")).toContainText(
            "We’ll plan a clear scope together",
          );
          await expect(blocks.nth(2).locator(".tiptap")).toContainText(
            "This second section keeps its position",
          );
        }
        await shot(`${editor}-after`, width, theme);
        const next = blocks.nth(2);
        await showBlock(next, width, editor);
        await next.evaluate((el) =>
          (el as HTMLElement).focus({ preventScroll: true }),
        );
        await expect(next).toHaveAttribute("data-selected", "true");
        await expect(paragraph).toHaveAttribute("data-active", "false");
        const clause = page.getByRole("group", {
          name:
            editor === "proposal" ? "Proposal clause 1" : "Template clause 1",
          includeHidden: true,
          exact: true,
        });
        await showBlock(clause, width, editor);
        await clause.evaluate((el) =>
          (el as HTMLElement).focus({ preventScroll: true }),
        );
        await expect(clause).toHaveAttribute("data-active", "true");
        await expect(page.locator(".block-tools:visible")).toHaveCount(1);
        await shot(`${editor}-clause-after`, width, theme);
        // Actual content editing keeps the selected toolbar visible after the pointer leaves.
        if (editor === "proposal") {
          await showBlock(paragraph, width, editor);
          await paragraph.locator(".tiptap").click();
          await page.mouse.move(1, 1);
          await expect(paragraph).toHaveAttribute("data-selected", "true");
        } else {
          await clause
            .getByRole("button", { name: "Clause settings", exact: true })
            .click();
          await expect(
            page.getByRole("textbox", { name: "Clause body", exact: true }),
          ).toBeVisible();
          if (width < 1100) await page.keyboard.press("Escape");
        }
      }
    }
  }
  // Review changes state, never inserts or removes a row above the content.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${active.id}`);
  const ai = page.locator('.block-frame[data-ai="true"]');
  await expect(ai).toHaveCount(1);
  await ai.scrollIntoViewIfNeeded();
  await ai.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  const before = await positions(page);
  await ai.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.locator('.block-frame[data-ai="true"]')).toHaveCount(0);
  await unchanged(before);
  // The gutter remains an operational keyboard drag handle, not a decorative icon.
  const roots = page.locator(
    ".document-section > .block-sortable > .block-frame",
  );
  const secondId = await roots.nth(1).getAttribute("data-block-id");
  await roots.first().evaluate((el) => (el as HTMLElement).focus());
  const handle = roots.first().locator("..").locator(":scope > .drag-handle");
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  await page.keyboard.press("ArrowDown");

  await expect(
    page
      .locator('[id^="DndLiveRegion"]')
      .filter({ hasText: "over droppable area " + secondId }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(roots.first()).toHaveAttribute("data-block-id", secondId!);
  expect(errors).toEqual([]);
  await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
