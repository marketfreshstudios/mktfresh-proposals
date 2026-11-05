import { expect, test } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

import { clearNeighbours } from "./toolbar-assertions";

for (const width of [1440, 1024])
  for (const separateCover of [true, false])
    test(`cover, body and band toolbars keep neighbouring text clickable at ${width} (${separateCover ? "separate" : "inline"} cover)`, async ({
      page,
    }) => {
      page.setDefaultTimeout(10000);
      const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
      const f = await editorFixture(page, false, {
        content: [
          ...(separateCover
            ? [{ id: ids[0], type: "page_break" as const }]
            : []),
          { id: ids[1], type: "heading", text: "Plan" },
          {
            id: ids[2],
            type: "paragraph",
            text: "The first paragraph stays clickable.",
          },
          {
            id: ids[3],
            type: "paragraph",
            text: "The selected paragraph has a full Size toolbar.",
          },
          {
            id: ids[4],
            type: "paragraph",
            text: "The next paragraph also stays clickable.",
          },
        ],
      });
      await page.setViewportSize({ width, height: 1000 });
      for (const path of [
        `/proposals/${f.draft.id}`,
        `/studio/templates/${f.draft.template_id}`,
      ]) {
        await page.goto(path);
        await expect(
          page.locator('.editor-page-sheets[data-layout-settled="true"]'),
        ).toBeVisible();
        const prepared = page.getByRole("textbox", {
          name: "Cover client name",
          exact: true,
        });
        await prepared.click();
        await clearNeighbours(
          page.getByRole("toolbar", { name: "Cover text formatting" }),
          page.locator('[data-cover-kind="prepared_for"]'),
        );
        const title = page.getByRole("textbox", {
          name: "Proposal title",
          exact: true,
        });
        // A real native click must reach the title from another selected cover line.
        await title.click();
        await expect(title).toBeFocused();
        await clearNeighbours(
          page.getByRole("toolbar", { name: "Cover text formatting" }),
          page.locator('[data-cover-kind="title"]'),
        );
        await page.keyboard.press("Escape");
        const selected = page.locator(`[data-block-id$="${ids[3]}"]`);
        await selected.locator(".tiptap").click();
        await clearNeighbours(selected.locator(".editor-edit-bar"), selected);
        await page.locator(`[data-block-id$="${ids[2]}"] .tiptap`).click();
        await expect(
          page.locator(`[data-block-id$="${ids[2]}"] .tiptap`),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        const header = page
          .locator('[data-band-frame="header"][tabindex]')
          .first();
        if (!(await header.count())) continue;
        await header.scrollIntoViewIfNeeded();
        await header.click();
        await clearNeighbours(page.locator(".band-edit-bar"), header);
        await page
          .locator(".band-edit-bar")
          .getByRole("button", { name: "Done", exact: true })
          .click();
      }
    });

test("dense paragraphs keep scrolling toolbar actions and menu focus stable", async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  const id = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    content: [
      { id: crypto.randomUUID(), type: "heading", text: "Overview" },
      {
        id,
        type: "paragraph",
        text: "A long, useful paragraph with line-boundary text. ".repeat(260),
        ai_review: { source: "assistant", reviewed: false },
      },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  const owner = page.locator(`[data-block-id="block-${id}"]`);
  await owner.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await owner.locator(".tiptap").click();
  const bar = owner.locator(".editor-edit-bar");
  await clearNeighbours(bar, owner);
  for (const name of ["More block actions", "Text style", "Size"]) {
    const button = bar.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(owner).toHaveAttribute("data-selected", "true");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  }
});
