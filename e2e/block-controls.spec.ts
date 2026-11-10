import { openEditorPanel } from "./editor-ui";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import type { Block } from "../src/lib/model";

test("block controls own one block and never move document content on hover, focus or touch", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
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
  let failReuse = false;
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
        else if (parts[2] === "review")
          active = await service.reviewSections(
            active.id,
            req.postDataJSON(),
            staff,
          );
        value = parts[1] ? active : { items: [active], total: 1 };
      } else if (req.method() === "POST") {
        if (parts[0] === "content_library" && failReuse) {
          failReuse = false;
          throw new Error("Storage unavailable — try again");
        }
        value = req.postDataJSON();
        await repo.put(parts[0] as any, value as any);
      } else value = await repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({
        status: (e as any).status ?? 400,
        json: { error: String(e) },
      });
    }
  });
  const dir = ".data/evidence/editor-followup";
  const captureEvidence = process.env.CAPTURE_EDITOR_EVIDENCE === "1";
  if (captureEvidence) await mkdir(dir, { recursive: true });
  const captures: {
    file: string;
    state: string;
    width: number;
    theme: string;
  }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function shot(state: string, width: number, theme: string) {
    if (!captureEvidence) return;
    await page.evaluate(() => document.fonts.ready);
    const file = `${state}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    captures.push({ file, state, width, theme });
  }
  async function showBlock(block: Locator, width: number, editor: string) {
    if (editor === "proposal" && width === 375 && !(await block.isVisible())) {
      await page
        .locator(".editor-phone-header")
        .getByRole("button", { name: "Done", exact: true })
        .click();
      await expect(block).toBeVisible();
    }
    if (width === 375) {
      await block.evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        const pinned = document.querySelector<HTMLElement>(
          ".editor-phone-header,.template-editor-header",
        );
        const top = pinned?.getBoundingClientRect().bottom ?? 0;
        let canvas: HTMLElement | null = el.parentElement;
        while (
          canvas &&
          !(
            canvas.scrollHeight > canvas.clientHeight + 1 &&
            /auto|scroll/.test(getComputedStyle(canvas).overflowY)
          )
        )
          canvas = canvas.parentElement;
        (canvas ?? window).scrollBy(
          0,
          el.getBoundingClientRect().top - top - 48,
        );
      });
      return;
    }
    await block.evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      // A collision-aware toolbar may flip or move away from its block. Keep
      // the test's text target below the pinned header independently of that bar.
      const canvas =
        innerWidth >= 700
          ? el.closest<HTMLElement>(
              ".editor-document-region,.studio-template-main",
            )
          : null;
      const top =
        canvas?.getBoundingClientRect().top ??
        document
          .querySelector(".template-editor-header,.editor-document-header")
          ?.getBoundingClientRect().bottom ??
        0;
      (canvas ?? window).scrollBy(0, el.getBoundingClientRect().top - top - 96);
    });
  }
  async function positions(p: Page) {
    await p.evaluate(() => document.fonts.ready);
    // A phone tap enters a different section view. Measure after that transition
    // and its existing sheet projection have committed, then detect any movement.
    await p.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const sheets = p.locator(".editor-page-sheets:visible");
    if (await sheets.count())
      await expect(sheets).toHaveAttribute("data-layout-settled", "true");
    return p.locator(".block-frame").evaluateAll((els) => ({
      scroll: scrollY,
      canvasScroll:
        document.querySelector<HTMLElement>(".editor-document-region")
          ?.scrollTop ?? 0,
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
    expect(
      Math.abs(after.canvasScroll - before.canvasScroll),
    ).toBeLessThanOrEqual(1);
    for (let n = 0; n < before.blocks.length; n++)
      for (const key of ["x", "y", "w", "h"] as const)
        expect(
          Math.abs(after.blocks[n][key] - before.blocks[n][key]),
          `${before.blocks[n].id} ${key}`,
        ).toBeLessThanOrEqual(1);
  }
  async function clickText(text: Locator) {
    // The owner retained the prototype bar above its block. Click an exposed
    // text point rather than the preceding block's covered centre.
    const point = await text.evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (const y of [1, r.height - 1, r.height / 2])
        for (let x = r.width - 1; x > 0; x -= 4) {
          const hit = document.elementFromPoint(r.left + x, r.top + y);
          if (hit && el.contains(hit)) return { x, y };
        }
      throw new Error("No exposed text point outside floating controls");
    });
    await text.click({ position: point });
  }
  async function noTextOverlap(block: Locator) {
    const intersections = await block.evaluate((selected) => {
      // The prototype intentionally floats the edit bar above the selected block.
      // Only that bar is exempt; gutter and AI controls must still avoid other text.
      const controls = [
        ...selected.querySelectorAll<HTMLElement>(
          ":scope > .phone-block-actions button,:scope > .block-insert,:scope > .editor-gutter button,:scope > .editor-ai-check",
        ),
        ...selected.parentElement!.querySelectorAll<HTMLElement>(
          ":scope > .drag-handle,:scope > .block-frame > .editor-gutter > .drag-handle",
        ),
      ];
      const texts: DOMRect[] = [];
      document
        .querySelectorAll<HTMLElement>(".block-frame > .block-content")
        .forEach((content) => {
          if (content === selected.querySelector(":scope > .block-content"))
            return;
          const walker = document.createTreeWalker(
            content,
            NodeFilter.SHOW_TEXT,
          );
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (
              !node.textContent?.trim() ||
              node.parentElement?.closest(
                "[data-editor-chrome],:is(.editor-edit-bar,.phone-block-actions),.block-insert,.drag-handle,.heading-measure",
              )
            )
              continue;
            const closed = node.parentElement?.closest("details:not([open])");
            if (closed && !node.parentElement?.closest("summary")) continue;
            if (node.parentElement?.closest(".block-frame") === selected)
              continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            texts.push(...Array.from(range.getClientRects()));
          }
          content
            .querySelectorAll<HTMLElement>("textarea,input")
            .forEach((input) => {
              if (input.closest(".block-frame") !== selected)
                texts.push(input.getBoundingClientRect());
            });
        });
      return controls.flatMap((control) => {
        if (!control.checkVisibility()) return [];
        const a = control.getBoundingClientRect();
        return texts
          .filter(
            (b) =>
              b.width &&
              b.height &&
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
          )
          .map((b) =>
            JSON.stringify({
              control: control.getAttribute("aria-label"),
              a: { x: a.x, y: a.y, w: a.width, h: a.height },
              b: { x: b.x, y: b.y, w: b.width, h: b.height },
              margin: getComputedStyle(selected).margin,
            }),
          );
      });
    });
    expect(
      intersections,
      (await block.getAttribute("aria-label")) ?? "Block",
    ).toEqual([]);
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
            await expect(page.locator(".editor-paper")).toBeVisible();
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
          await expect(page.locator(".editor-paper")).toBeVisible();
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
          // Phone selection intentionally enters the prototype's section view.
          // Measure hover/focus stability once that view is active, not across navigation.
          if (width === 375) {
            await block.focus();
            await showBlock(block, width, editor);
          }
          const before = await positions(page);
          // Target the content owned by this frame, rather than a nested clause.
          const owned = await block.evaluate((el) => {
            const bounds = el.getBoundingClientRect(),
              walker = document.createTreeWalker(
                el.querySelector(":scope > .block-content")!,
                NodeFilter.SHOW_TEXT,
              );
            let node;
            while ((node = walker.nextNode())) {
              if (
                !node.textContent?.trim() ||
                node.parentElement?.closest(".block-frame") !== el ||
                node.parentElement?.closest(
                  "[data-editor-chrome],:is(.editor-edit-bar,.phone-block-actions),.drag-handle,small",
                )
              )
                continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const r = Array.from(range.getClientRects()).find(
                (r) => r.width && r.height,
              );
              if (r)
                return {
                  x: r.left - bounds.left + Math.min(5, r.width / 2),
                  y: r.top - bounds.top + r.height / 2,
                };
            }
            return { x: 5, y: Math.min(5, bounds.height / 2) };
          });
          await block.hover({ position: owned });
          await expect(block).toHaveAttribute("data-active", "true");
          await unchanged(before);
          await expect(
            page.locator('.block-frame[data-active="true"]'),
          ).toHaveCount(1);
          await expect(
            page.locator(":is(.editor-edit-bar,.phone-block-actions):visible"),
          ).toHaveCount(1);
          await expect(
            page.locator(
              ":is(.block-sortable > .drag-handle,.editor-gutter > .drag-handle):visible",
            ),
          ).toHaveCount(width === 375 ? 0 : 1);
          const dragHandle = block
            .locator("..")
            .locator(
              ":scope > .drag-handle,:scope > .block-frame > .editor-gutter > .drag-handle",
            );
          if (width !== 375) await dragHandle.hover();
          else if (
            await block
              .getByRole("button", { name: "Add a block above", exact: true })
              .count()
          ) {
            const pill = block.getByRole("button", {
              name: "Add a block above",
              exact: true,
            });
            await pill.hover();
            const rect = (await pill.boundingBox())!;
            expect(rect.height).toBe(32);
            expect(rect.x).toBeGreaterThanOrEqual(0);
          }

          await expect(block).toHaveAttribute("data-active", "true");
          await unchanged(before);
          await block.evaluate((el) =>
            (el as HTMLElement).focus({ preventScroll: true }),
          );
          await unchanged(before);
          await noTextOverlap(block);
          expect(
            await block
              .locator(
                ":scope > :is(.editor-edit-bar,.phone-block-actions) button",
              )
              .evaluateAll((buttons) =>
                buttons.every(
                  (button) => !!button.getAttribute("title")?.trim(),
                ),
              ),
          ).toBe(true);
          await page.mouse.move(1, 1);
          await expect(block).toHaveAttribute("data-active", "true");
          await unchanged(before);
          await page.keyboard.press("Escape");
          await expect(
            page.locator('.block-frame[data-active="true"]'),
          ).toHaveCount(0);
          if (width !== 375) await unchanged(before);
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
        await expect(
          paragraph.locator(
            ":scope > :is(.editor-edit-bar,.phone-block-actions)",
          ),
        ).toBeVisible();
        if (editor === "proposal") {
          await expect(paragraph.locator(".tiptap")).toContainText(
            "We’ll plan a clear scope together",
          );
          await expect(blocks.nth(2).locator(".tiptap")).toContainText(
            "This second section keeps its position",
          );
        }
        await shot(`${editor}-after`, width, theme);
        if (width !== 768) {
          const phoneTemplate = editor === "template" && width === 375;
          const action = async (name: string) => {
            if (!phoneTemplate)
              return paragraph.getByRole("button", { name, exact: true });
            const menu = page.locator(".edit-more-menu:popover-open");
            if (!(await menu.isVisible()))
              await page
                .getByRole("button", {
                  name: "More block actions",
                  exact: true,
                })
                .click();
            return menu.getByRole("menuitem", { name, exact: true });
          };
          await (await action("Save for reuse")).click();
          const dialog = page.getByRole("dialog", {
            name: "Save as reusable block",
            exact: true,
          });
          await expect(
            dialog.getByRole("textbox", { name: "Name", exact: true }),
          ).not.toHaveValue("");
          await dialog
            .getByRole("textbox", { name: "Name", exact: true })
            .fill("Reusable scope");
          await expect(paragraph).toHaveAttribute("data-selected", "true");
          await shot(`${editor}-reuse-dialog`, width, theme);
          if (editor === "proposal" && width === 1440 && theme === "light") {
            failReuse = true;
            await dialog
              .getByRole("button", { name: "Save block", exact: true })
              .click();
            await expect(
              page
                .getByRole("alert")
                .filter({ hasText: "Storage unavailable" }),
            ).toBeVisible();
            await expect(dialog).toBeVisible();
          }
          await dialog
            .getByRole("button", { name: "Save block", exact: true })
            .click();
          await expect(dialog).toHaveCount(0);
          await expect(
            page
              .getByRole("status")
              .filter({ hasText: "Saved as Reusable scope" }),
          ).toBeVisible();
          await expect(await action("Save for reuse")).toHaveAttribute(
            "title",
            "Saved as Reusable scope",
          );
          await expect(
            page.getByRole("link", { name: "Open", exact: true }),
          ).toHaveAttribute("href", /^\/studio\/blocks\/[a-f0-9-]{36}$/);
          const savedId = (await page
            .getByRole("link", { name: "Open", exact: true })
            .getAttribute("href"))!
            .split("/")
            .at(-1);
          const sourceFrame = await paragraph.getAttribute("data-block-id");
          // Saving for reuse now stamps a reference and autosaves the document.
          // Confirm it persisted before testing layout or navigating elsewhere.
          await expect
            .poll(async () => {
              const document =
                editor === "proposal"
                  ? active
                  : (await repo.entities<any>("templates")).find(
                      (t) => t.id === template.id,
                    );
              return document.content.find(
                (b: Block) => b.id && sourceFrame?.endsWith(b.id),
              )?.saved_block_id;
            })
            .toBe(savedId);
          await expect(paragraph).toHaveAttribute("data-selected", "true");
          await shot(`${editor}-reuse-success`, width, theme);
          const id = await paragraph.getAttribute("data-block-id");
          await (await action("Delete block")).click();
          await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCount(0);
          await expect(
            page.getByRole("status").filter({ hasText: "Block deleted" }),
          ).toBeVisible();
          await shot(`${editor}-delete-undo`, width, theme);
          await page
            .getByRole("status")
            .filter({ hasText: "Block deleted" })
            .getByRole("button", { name: "Undo", exact: true })
            .click();
          await expect(page.locator(`[data-block-id="${id}"]`)).toBeVisible();
          // A real outside pointer-down hides the selected rail and insertion buttons.
          await paragraph.evaluate((el) =>
            (el as HTMLElement).focus({ preventScroll: true }),
          );
          await page.mouse.click(2, 900);
          await expect(
            page.locator('.block-frame[data-selected="true"]'),
          ).toHaveCount(0);
          await expect(
            page.locator(
              ":is(.editor-edit-bar,.phone-block-actions):visible,.block-insert:visible",
            ),
          ).toHaveCount(0);
          await paragraph.evaluate((el) =>
            (el as HTMLElement).focus({ preventScroll: true }),
          );
          await showBlock(blocks.nth(2), width, editor);
          await clickText(blocks.nth(2).locator(".tiptap"));
          await expect(blocks.nth(2)).toHaveAttribute("data-selected", "true");
          await expect(paragraph).toHaveAttribute("data-selected", "false");
          if (editor === "proposal") {
            await showBlock(paragraph, width, editor);
            await clickText(paragraph.locator(".tiptap"));
            const format = page.getByRole("toolbar", {
              name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
              exact: true,
            });
            await expect(
              format.getByRole("button", { name: "Bold", exact: true }),
            ).toBeEnabled();
            await format
              .getByRole("button", { name: "Bold", exact: true })
              .click();
            await expect(paragraph).toHaveAttribute("data-selected", "true");
            await paragraph
              .getByRole("button", {
                name: /^Add (a )?block below$/,
                exact: true,
              })
              .click();
            await expect(
              page.getByRole("dialog", { name: "Add a block", exact: true }),
            ).toBeVisible();
            await expect(paragraph).toHaveAttribute("data-selected", "true");
            await page
              .getByRole("dialog", { name: "Add a block", exact: true })
              .getByRole("searchbox", { name: "Search blocks", exact: true })
              .click();
            await expect(paragraph).toHaveAttribute("data-selected", "true");
            await shot("formatting-bar", width, theme);
            if (width === 375) await page.keyboard.press("Escape");
            const emptyPaper = await page
              .locator(".editor-paper")
              .evaluate((paper) => {
                const box = paper.getBoundingClientRect(),
                  bar = document
                    .querySelector(
                      ":is(.editor-edit-bar,.phone-formatting-bar)",
                    )!
                    .getBoundingClientRect(),
                  x = Math.min(innerWidth - 5, box.right - 5);
                for (
                  let y = Math.max(
                    box.top + 5,
                    innerWidth < 700 ? 58 : bar.bottom + 5,
                  );
                  y < Math.min(innerHeight - 5, box.bottom - 5);
                  y += 4
                )
                  if (
                    document.elementFromPoint(x, y) === paper ||
                    document.elementFromPoint(x, y)?.matches(".page-sheet")
                  )
                    return { x, y };
                throw new Error(
                  "No empty paper margin visible below formatting bar",
                );
              });
            await page.mouse.click(emptyPaper.x, emptyPaper.y);
            await expect(paragraph).toHaveAttribute("data-selected", "false");
            await paragraph.evaluate((el) =>
              (el as HTMLElement).focus({ preventScroll: true }),
            );
            if (width === 1440) {
              const outline = page
                .locator(".editor-outline > .editor-sidebar-header")
                .first();
              if (await outline.isVisible()) await outline.click();
              else {
                await page
                  .getByRole("button", {
                    name: /^(Expand|Collapse) (Pages|Sections) sidebar$/,
                    exact: true,
                  })
                  .click();
                const sections = page.getByRole("dialog", {
                  name: /^(Pages|Sections)$/,
                  exact: true,
                });
                await sections
                  .locator("header, .editor-sidebar-header")
                  .first()
                  .click();
                await sections
                  .getByRole("button", {
                    name: /^(Done|Collapse Sections sidebar)$/,
                    exact: true,
                  })
                  .click();
              }
              await expect(paragraph).toHaveAttribute("data-selected", "false");
              await paragraph.evaluate((el) =>
                (el as HTMLElement).focus({ preventScroll: true }),
              );
              await page
                .locator(".editor-sidepanel")
                .getByRole("tab", { name: "Quote", exact: true })
                .click();
              await expect(paragraph).toHaveAttribute("data-selected", "false");
            }
            if (width < 700) await openEditorPanel(page, "Send");
            else
              await page
                .locator(".quote-editor-top")
                .getByRole("button", { name: "Review & send", exact: true })
                .click();
            await page.getByText("Link settings", { exact: true }).click();
            await expect(
              page.locator('input[aria-label="Valid until"]:visible'),
            ).toBeVisible();
            await shot("review-validity", width, theme);
            if (width === 375)
              await page
                .getByRole("dialog", { name: "Proposal tools", exact: true })
                .getByRole("button", {
                  name: /^(Done|Collapse tools sidebar)$/,
                  exact: true,
                })
                .click();
          }
        }

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
        await expect(
          page.locator(":is(.editor-edit-bar,.phone-block-actions):visible"),
        ).toHaveCount(1);
        await shot(`${editor}-clause-after`, width, theme);
        // Actual content editing keeps the selected toolbar visible after the pointer leaves.
        if (editor === "proposal") {
          await showBlock(paragraph, width, editor);
          await clickText(paragraph.locator(".tiptap"));
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
  // Template insertion uses the same edges/slash flow; the inspector has no obsolete add/delete toolbar.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${template.id}`);
  const templateBlocks = page.locator(".studio-block-card");
  await templateBlocks
    .first()
    .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await templateBlocks
    .first()
    .getByRole("button", { name: /^Add (a )?block below$/, exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Add a block", exact: true })
    .getByRole("menuitem", { name: "Text", exact: true })
    .click();
  await expect(templateBlocks).toHaveCount(6);
  const inspectorText = templateBlocks.nth(1).locator(".tiptap");
  await expect(inspectorText).toBeFocused();
  await inspectorText.press("/");
  await page
    .getByRole("dialog", { name: "Add a block", exact: true })
    .getByRole("menuitem", { name: "Heading 1", exact: true })
    .click();
  await expect(templateBlocks).toHaveCount(6);
  await expect(templateBlocks.nth(1).locator(".tiptap")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Add block", exact: true }),
  ).toHaveCount(0);
  // Review changes state, never inserts or removes a row above the content.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${active.id}`);
  const ai = page.locator('.block-frame[data-ai="true"]');
  await expect(ai).toHaveCount(1);
  await ai.scrollIntoViewIfNeeded();
  await ai.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  const localText = "Local review text survives a concurrent editor conflict.";
  await ai.locator(".tiptap").fill(localText);
  active = await service.edit(
    active.id,
    {
      revision: active.revision,
      title: "A different session updated this draft",
    },
    staff,
  );
  await expect(page.locator(".editor-notice-stale")).toBeVisible();
  await expect(ai.locator(".tiptap")).toHaveText(localText);
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  const recovery = page.locator(".editor-notice-recovered");
  await expect(recovery).toBeVisible();
  await ai.focus();
  const before = await positions(page);
  await ai
    .getByRole("button", {
      name: /^(Mark reviewed|Mark this AI-written block reviewed)$/,
      exact: true,
    })
    .click();
  await expect(page.locator('.block-frame[data-ai="true"]')).toHaveCount(0);
  await unchanged(before);
  await expect(recovery).toBeVisible();
  // The gutter remains an operational keyboard drag handle, not a decorative icon.
  const roots = page.locator(
    ".document-section > .block-sortable > .block-frame",
  );
  const secondId = await roots.nth(2).getAttribute("data-block-id");
  await roots.nth(1).evaluate((el) => (el as HTMLElement).focus());
  const handle = roots
    .nth(1)
    .locator("..")
    .locator(
      ":scope > .drag-handle,:scope > .block-frame > .editor-gutter > .drag-handle",
    );
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
  await expect(roots.nth(1)).toHaveAttribute("data-block-id", secondId!);
  expect(errors).toEqual([]);
  if (captureEvidence)
    await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
