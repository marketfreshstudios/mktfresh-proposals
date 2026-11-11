import { captureReview5 } from "./owner-review5-captures";
import { expect, test } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

import { attachedBar } from "./toolbar-assertions";

for (const width of [1440, 1280, 1024])
  for (const separateCover of [true, false])
    test(`cover, body and band toolbars stay full-size above the selection at ${width} (${separateCover ? "separate" : "inline"} cover)`, async ({
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
        await attachedBar(
          page.getByRole("toolbar", { name: "Cover text formatting" }),
          page.locator('[data-cover-kind="prepared_for"]'),
        );
        const title = page.getByRole("textbox", {
          name: "Proposal title",
          exact: true,
        });
        // The attached bar may cover the line above; Escape dismisses it first.
        await page.keyboard.press("Escape");
        await title.click();
        await expect(title).toBeFocused();
        await attachedBar(
          page.getByRole("toolbar", { name: "Cover text formatting" }),
          page.locator('[data-cover-kind="title"]'),
        );
        await page.keyboard.press("Escape");
        const selected = page.locator(`[data-block-id$="${ids[3]}"]`);
        await selected.locator(".tiptap").click();
        await attachedBar(selected.locator(".editor-edit-bar"), selected);
        await page.keyboard.press("Escape");
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
        const column = header.getByRole("textbox", {
          name: "header column 1",
          exact: true,
        });
        await column.click();
        await expect(column).toBeFocused();
        await attachedBar(page.locator(".band-edit-bar"), header);
        await page
          .locator(".band-edit-bar")
          .getByRole("button", { name: "Done", exact: true })
          .click();
      }
    });

test("dense paragraphs keep full-size toolbar actions and menu focus stable", async ({
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
  await attachedBar(bar, owner);
  for (const name of ["More block actions", "Text style", "Size"]) {
    const button = bar.getByRole("button", {
      name: name === "Size" ? /^Size (Default|Mixed|[0-9]+)$/ : name,
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(owner).toHaveAttribute("data-selected", "true");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  }
});

for (const width of [1440, 1280, 1024])
  test(`attached bar stays natural and follows the viewport at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const id = crypto.randomUUID();
    const f = await editorFixture(page, false, {
      content: [
        { id: crypto.randomUUID(), type: "page_break" },
        {
          id,
          type: "paragraph",
          text: "The selected paragraph stays attached while scrolling. ".repeat(
            25,
          ),
        },
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          text: "Following content provides scrolling room. ".repeat(200),
        },
      ],
    });
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(
      page.locator('.editor-page-sheets[data-layout-settled="true"]'),
    ).toBeVisible();
    const owner = page.locator(`[data-block-id="block-${id}"]`);
    await owner.locator(".tiptap").click();
    const bar = owner.locator(".editor-edit-bar");
    const natural = await bar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    for (const target of [180, 400, 800, 20]) {
      await owner.evaluate((el, y) => {
        const canvas = el.closest(".editor-document-region")!;
        canvas.scrollTop += el.getBoundingClientRect().top - y;
      }, target);
      await attachedBar(bar, owner);
      expect((await bar.boundingBox())!.width).toBeCloseTo(natural, 0);
      if (width === 1440)
        await captureReview5(
          page,
          `bar-${target === 180 ? "top" : target === 400 ? "middle" : target === 800 ? "bottom" : "sticky"}-1440`,
        );
      if (target > 100) {
        const b = (await bar.boundingBox())!,
          a = (await owner.boundingBox())!;
        expect(b.y + b.height).toBeLessThanOrEqual(a.y + 1);
      }
    }
  });
