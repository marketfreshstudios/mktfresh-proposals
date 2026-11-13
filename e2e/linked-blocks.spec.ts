import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { staff, testSignatureImage } from "../tests/helpers";
import {
  writeStudioEntity,
  studioEntityViews,
} from "../src/lib/studio-history";
import { savedBlockViews, prepareLinkedSave } from "../src/lib/saved-blocks";
import { stampSavedBlocks } from "../src/lib/linked-blocks";
import { blockText } from "../src/lib/editor-document";
import type { SavedBlock, Template, Block } from "../src/lib/model";
async function fixture(page: Page) {
  const f = await editorFixture(page);
  await page.route("**/api/content_library**", async (route) => {
    try {
      const req = route.request(),
        all = await f.repo.entities<SavedBlock>("content_library");
      if (req.method() === "POST") {
        const raw = req.postDataJSON(),
          before = all.find((r) => r.id === raw.id) ?? null;
        const {
          expected_revision,
          update_drafts,
          update_draft_ids,
          ...entity
        } = raw;
        const value = await writeStudioEntity(
          f.repo,
          "content_library",
          before,
          entity,
          staff,
          {
            revision: expected_revision,
            updateDrafts: update_drafts,
            draftIds: update_draft_ids,
          },
        );
        return route.fulfill({ json: value });
      }
      return route.fulfill({
        json: await savedBlockViews(
          f.repo,
          await studioEntityViews(f.repo, "content_library", all, staff),
        ),
      });
    } catch (e) {
      return route.fulfill({
        status: (e as any).status ?? 400,
        json: { error: (e as Error).message },
      });
    }
  });
  await page.route(`**/api/proposals/${f.draft.id}`, async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: await f.repo.get(f.draft.id) });
    return route.fallback();
  });
  await page.route(
    `**/api/proposals/${f.draft.id}/replace-saved-block`,
    async (route) => {
      try {
        const input = route.request().postDataJSON();
        return route.fulfill({
          json: await f.service.replaceSavedBlock(
            f.draft.id,
            input.revision,
            input.saved_block_id,
            staff,
          ),
        });
      } catch (e) {
        return route.fulfill({
          status: (e as any).status ?? 400,
          json: { error: (e as Error).message },
        });
      }
    },
  );
  return f;
}
const shots = "docs/screenshots/linked-blocks";
async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_LINKED_BLOCKS) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({
      path: `${shots}/${name}.png`,
      animations: "disabled",
    });
  }
}
async function shotBoth(page: Page, name: string, width = 1440) {
  if (!process.env.CAPTURE_LINKED_BLOCKS) return;
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const layout = page.locator(".editor-page-sheets[data-layout-settled]");
    if (await layout.count())
      await expect(layout.first()).toHaveAttribute(
        "data-layout-settled",
        "true",
      );
    await shot(page, `${name}-${theme}-${width}`);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
}
for (const kind of ["proposal", "template"] as const)
  test(`${kind}: shift/cmd/keyboard multi-selection saves an ordered group and excludes protected blocks`, async ({
    page,
  }) => {
    const f = await fixture(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const template = (await f.repo.entities<Template>("templates"))[0];
    await page.goto(
      kind === "proposal"
        ? `/proposals/${f.draft.id}`
        : `/studio/templates/${template.id}`,
    );
    const frames = page.locator(
      kind === "proposal"
        ? '.editor-paper .block-frame[data-block-id^="block-"]'
        : '.studio-blocks .block-frame[data-block-id^="template-"]',
    );
    await frames.first().click({ position: { x: 8, y: 8 } });
    await frames
      .last()
      .click({ modifiers: ["Shift"], position: { x: 8, y: 8 } });
    await expect(page.locator('[data-multi-selected="true"]')).toHaveCount(7);
    await expect(
      page.getByRole("toolbar", { name: "Selected blocks", exact: true }),
    ).toContainText("7 blocks selected");
    await shotBoth(page, `${kind}-selection`);
    await page
      .getByRole("button", { name: "Selected blocks actions", exact: true })
      .click();
    const saveAction = page.getByRole("menuitem", {
      name: "Save as reusable block",
      exact: true,
    });
    await expect(saveAction).toBeFocused();
    await saveAction.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Duplicate", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(saveAction).toBeFocused();
    await saveAction.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Save as reusable block",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(dialog).toContainText(
      `The pricing table and signatures stay in the ${kind}.`,
    );
    await shotBoth(page, `${kind}-save-dialog`);
    await dialog
      .getByLabel("Name", { exact: true })
      .fill("Reusable case study");
    await dialog
      .getByRole("button", { name: "Save block", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Saved as Reusable case study" }),
    ).toBeVisible();
    const row = (await f.repo.entities<SavedBlock>("content_library")).find(
      (r) => r.name === "Reusable case study",
    )!;
    expect(row.type).toBe("group");
    expect(row.blocks).toHaveLength(5);
    expect(
      row.blocks!.some((b) =>
        ["pricing_table", "signature_block", "contract"].includes(b.type),
      ),
    ).toBe(false);
    await expect
      .poll(
        async () =>
          (kind === "proposal"
            ? (await f.repo.get(f.draft.id))!.content
            : (await f.repo.entities<Template>("templates")).find(
                (t) => t.id === template.id,
              )!.content
          ).filter((b) => b.saved_block_id === row.id).length,
      )
      .toBe(5);
    await page.keyboard.press("Escape");
    await frames.first().focus();
    await page.keyboard.press("Shift+ArrowDown");
    await expect(page.locator('[data-multi-selected="true"]')).toHaveCount(2);
    await frames
      .last()
      .click({ modifiers: ["Control"], position: { x: 8, y: 8 } });
    await expect(page.locator('[data-multi-selected="true"]')).toHaveCount(3);
    await frames
      .last()
      .click({ modifiers: ["Meta"], position: { x: 8, y: 8 } });
    await expect(page.locator('[data-multi-selected="true"]')).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-multi-selected="true"]')).toHaveCount(0);
  });
test("template insertion keeps the whole group in one undo step; local edits restore or unlink", async ({
  page,
}) => {
  const f = await fixture(page),
    template = (await f.repo.entities<Template>("templates"))[0];
  const blocks: Block[] = [
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "Reusable results",
      level: 1,
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "A successful result.",
    },
    { id: crypto.randomUUID(), type: "paragraph", text: "A second result." },
  ];
  const group: SavedBlock = {
    id: crypto.randomUUID(),
    name: "Results group",
    type: "group",
    blocks,
    block: blocks[0],
    version: 1,
  };
  await f.repo.put("content_library", group);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${template.id}`);
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await page
    .locator(".blocks-panel summary")
    .filter({ hasText: "Saved blocks" })
    .click();
  const original = template.content.length;
  await page
    .getByRole("menuitem", { name: "Results group", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.length,
    )
    .toBe(original + 3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.length,
    )
    .toBe(original);
  await page
    .getByRole("menuitem", { name: "Results group", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.filter(
          (b) => b.saved_block_id === group.id,
        ).length,
    )
    .toBe(3);
  const linkedParagraph = (
    await f.repo.entities<Template>("templates")
  )[0].content.find(
    (b) => b.saved_block_id === group.id && b.saved_block_position === 1,
  )!;
  const text = page.locator(
    `[data-block-id="template-${linkedParagraph.id}"] .tiptap`,
  );
  await text.fill("Locally customized result.");
  await expect(
    page.locator(".linked-block-note").filter({ hasText: "Edited here" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      JSON.stringify((await f.repo.entities<Template>("templates"))[0].content),
    )
    .toContain("Locally customized result.");
  await writeStudioEntity(
    f.repo,
    "content_library",
    group,
    {
      ...group,
      blocks: blocks.map((b, n) =>
        n === 1 ? { ...b, text: "Updated shared result." } : b,
      ),
    },
    staff,
  );
  await page.reload();
  await expect(text).toContainText("Locally customized result.");
  await page
    .getByRole("button", { name: "Restore linked version", exact: true })
    .click();
  await expect(text).toContainText("Updated shared result.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toContainText("Locally customized result.");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(text).toContainText("Updated shared result.");
  await page.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.filter(
          (b) => b.saved_block_id === group.id,
        ).length,
    )
    .toBe(0);
});
test("saved group mini document shows Used in and save scope; phone select mode is docked", async ({
  page,
}) => {
  const f = await fixture(page),
    template = (await f.repo.entities<Template>("templates"))[0];
  const group: SavedBlock = {
    id: crypto.randomUUID(),
    name: "Shared story",
    type: "group",
    block: { type: "paragraph", text: "Story" },
    blocks: [
      { id: crypto.randomUUID(), type: "paragraph", text: "Story" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Results" },
    ],
    version: 1,
  };
  await f.repo.put("content_library", group);
  await f.repo.put("templates", {
    ...template,
    content: stampSavedBlocks(group),
  });
  await f.editRemote({
    content: [...stampSavedBlocks(group), ...f.draft.content],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/blocks/${group.id}`);
  await expect(
    page.getByRole("tab", { name: "Used in", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".saved-block-usage")).toContainText(
    "Updates on save",
  );
  await expect(page.locator(".saved-block-usage")).toContainText(
    "Also update 1 draft",
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".saved-block-usage")).not.toContainText("·");
  await shotBoth(page, "used-in");
  const story = page.locator(".studio-blocks .tiptap").first();
  await story.fill("Updated shared story.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(async () =>
      blockText((await f.repo.entities<Template>("templates"))[0].content[0]),
    )
    .toBe("Updated shared story.");
  expect(blockText((await f.repo.get(f.draft.id))!.content[0])).toBe("Story");
  await page.getByRole("radio", { name: /Also update 1 draft/ }).check();
  await story.fill("Updated draft story.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(async () => blockText((await f.repo.get(f.draft.id))!.content[0]))
    .toBe("Updated draft story.");
  expect((await f.repo.get(f.draft.id))!.events.at(-1)!.type).toBe(
    "saved_block_updated",
  );
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveCount(0);
  await page.goto("/studio/templates?view=blocks");
  const groupRow = page
    .locator(".saved-block-table .studio-table-row")
    .filter({ hasText: "Shared story" });
  await expect(groupRow).toContainText("Group | 2 blocks");
  await expect(groupRow).toContainText("In 1 template");
  await shot(page, "group-list-1440");
  await page.goto(`/proposals/${f.draft.id}`);
  await page.setViewportSize({ width: 375, height: 812 });
  const first = page
    .locator('.editor-paper .block-frame[data-block-id^="block-"]')
    .first();
  await first.click({ position: { x: 8, y: 8 } });
  await page
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Select more", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Select Proposal block 2", exact: true })
    .check();
  const dock = page.getByRole("toolbar", {
    name: "Selected blocks",
    exact: true,
  });
  await expect(dock).toContainText("2 selected");
  await expect(
    page.getByRole("navigation", { name: "Proposal tools", exact: true }),
  ).toBeHidden();
  await expect(
    dock.getByRole("button", { name: "Save as block", exact: true }),
  ).toBeVisible();
  expect((await dock.boundingBox())!.y).toBeGreaterThan(700);
  for (const button of await dock.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await shotBoth(page, "phone-selection", 375);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(dock).toContainText("2 selected");
  expect((await dock.boundingBox())!.y).toBeGreaterThan(900);
  await dock.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".block-selection-check")).toHaveCount(0);
});

test("one eligible block stays a single type and a fully protected selection cannot save", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const frames = page.locator(
    '.editor-paper .block-frame[data-block-id^="block-"]',
  );
  await frames.nth(1).click({ position: { x: 8, y: 8 } });
  await page
    .getByRole("button", { name: "Save for reuse", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Save as reusable block",
    exact: true,
  });
  await dialog.getByLabel("Name", { exact: true }).fill("One paragraph");
  await dialog.getByRole("button", { name: "Save block", exact: true }).click();
  const saved = (await f.repo.entities<SavedBlock>("content_library")).find(
    (r) => r.name === "One paragraph",
  )!;
  expect(saved.type).toBeUndefined();
  expect(saved.blocks).toBeUndefined();
  expect(saved.block.type).toBe("paragraph");
  await expect
    .poll(async () => (await f.repo.get(f.draft.id))!.content[1].saved_block_id)
    .toBe(saved.id);
  await frames.nth(1).click({ position: { x: 8, y: 8 } });
  await frames
    .nth(5)
    .click({ modifiers: ["Control"], position: { x: 8, y: 8 } });
  await page
    .getByRole("button", { name: "Selected blocks actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Save as reusable block", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Save as reusable block",
    exact: true,
  });
  await expect(dialog).toContainText(
    "The pricing table stays in the proposal.",
  );
  await dialog.getByLabel("Name", { exact: true }).fill("Only eligible member");
  await dialog.getByRole("button", { name: "Save block", exact: true }).click();
  const reduced = (await f.repo.entities<SavedBlock>("content_library")).find(
    (r) => r.name === "Only eligible member",
  )!;
  expect(reduced.type).toBe("group");
  expect(reduced.blocks).toHaveLength(1);
  await frames.nth(5).click({ position: { x: 8, y: 8 } });
  await page
    .getByRole("button", { name: "Save for reuse", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Save as reusable block",
    exact: true,
  });
  await expect(dialog).toContainText(
    "The pricing table stays in the proposal.",
  );
  await expect(
    dialog.getByRole("button", { name: "Save block", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await frames.last().click({ modifiers: ["Shift"], position: { x: 8, y: 8 } });
  await page
    .getByRole("button", { name: "Selected blocks actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Save as reusable block", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Save as reusable block",
    exact: true,
  });
  await expect(dialog).toContainText(
    "The pricing table and signatures stay in the proposal.",
  );
  await expect(
    dialog.getByRole("button", { name: "Save block", exact: true }),
  ).toBeDisabled();
  expect(
    (await f.repo.entities<SavedBlock>("content_library")).filter(
      (r) => r.name === "One paragraph",
    ),
  ).toHaveLength(1);
});

test("group drag and keyboard insertion each remain one undo step", async ({
  page,
}) => {
  const f = await fixture(page),
    template = (await f.repo.entities<Template>("templates"))[0],
    blocks: Block[] = [
      { id: crypto.randomUUID(), type: "paragraph", text: "Dragged one" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Dragged two" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Dragged three" },
    ],
    group: SavedBlock = {
      id: crypto.randomUUID(),
      name: "Three details",
      type: "group",
      blocks,
      block: blocks[0],
    };
  await f.repo.put("content_library", group);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${template.id}`);
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await page
    .locator(".blocks-panel summary")
    .filter({ hasText: "Saved blocks" })
    .click();
  const source = page.getByRole("menuitem", {
      name: /^Three details/,
      exact: true,
    }),
    original = template.content.length;
  await source.dragTo(
    page
      .locator('.studio-blocks .block-frame[data-block-id^="template-"]')
      .nth(1),
  );
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.length,
    )
    .toBe(original + 3);
  await page
    .getByRole("toolbar", { name: "Template history", exact: true })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.length,
    )
    .toBe(original);
  await source.focus();
  await source.press("Enter");
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.filter(
          (b) => b.saved_block_id === group.id,
        ).length,
    )
    .toBe(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates"))[0].content.length,
    )
    .toBe(original);
});

test("an unsigned sent proposal confirms same-link replacement, publishes only a new version and sends no email", async ({
  page,
}) => {
  const f = await fixture(page),
    group: SavedBlock = {
      id: crypto.randomUUID(),
      name: "Published case study",
      block: {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "Original case study",
      },
    };
  await f.repo.put("content_library", group);
  await f.editRemote({
    content: [...f.draft.content, ...stampSavedBlocks(group)],
  });
  const sent = await f.sendRemote(),
    emails = await f.repo.entities("email_log");
  await writeStudioEntity(
    f.repo,
    "content_library",
    group,
    { ...group, block: { ...group.block, text: "Latest case study" } },
    staff,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  await page
    .getByRole("button", { name: "More editor actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Replace with latest block", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Replace with latest block",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await expect(dialog).toContainText("same client link");
  await shotBoth(page, "replace-confirm");
  await dialog
    .getByRole("button", { name: "Replace block", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const current = (await f.repo.get(sent.id))!;
  expect(current.token).toBe(sent.token);
  expect(current.versions).toHaveLength(2);
  expect(current.versions[0]).toEqual(sent.versions[0]);
  expect(blockText(current.content.at(-1)!)).toBe("Latest case study");
  expect(await f.repo.entities("email_log")).toEqual(emails);
});

test("deleting an image in a saved group removes only that member and undo restores it", async ({
  page,
}) => {
  const f = await fixture(page),
    row: SavedBlock = {
      id: crypto.randomUUID(),
      name: "Photo story",
      type: "group",
      version: 1,
      block: { type: "paragraph", text: "Keep this story" },
      blocks: [
        { id: crypto.randomUUID(), type: "paragraph", text: "Keep this story" },
        {
          id: crypto.randomUUID(),
          type: "image",
          src: testSignatureImage,
          alt: "Case study photo",
          width_percent: 10,
        },
      ],
    };
  await f.repo.put("content_library", row);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/blocks/${row.id}`);
  const image = page.getByRole("group", {
    name: "block image: Case study photo",
    exact: true,
  });
  await image.focus();
  await image.press("Enter");
  await page
    .getByRole("toolbar", { name: "Image actions", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(image).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".studio-blocks")).toContainText("Keep this story");
  await page
    .getByRole("toolbar", { name: "Template history", exact: true })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(image).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<SavedBlock>("content_library")).find(
          (b) => b.id === row.id,
        )?.blocks?.length,
    )
    .toBe(2);
});
