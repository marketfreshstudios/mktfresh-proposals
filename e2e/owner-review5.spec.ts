import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
test("Blocks and plus menu insert the signer pair once, with its heading and one Undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const id = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    content: [{ id, type: "paragraph", text: "Selected introduction" }],
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(`[data-block-id="block-${id}"] .tiptap`).click();
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await page
    .locator(".blocks-panel")
    .getByRole("menuitem", { name: "Signatures", exact: true })
    .click();
  await expect
    .poll(
      () =>
        f.active().content.filter((b) => b.type === "signature_block").length,
    )
    .toBe(2);
  expect(f.active().content.map((b) => b.type)).toEqual([
    "paragraph",
    "heading",
    "signature_block",
    "signature_block",
  ]);
  await expect(
    page
      .locator(".blocks-panel")
      .getByRole("menuitem", { name: "Client signature", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => f.active().content.length).toBe(1);
  const frame = page.locator(`[data-block-id="block-${id}"]`);
  await frame.locator(".tiptap").click();
  await frame
    .getByRole("button", { name: "Add a block below", exact: true })
    .click();
  await page
    .locator(".block-popover")
    .getByRole("menuitem", { name: "Signatures", exact: true })
    .click();
  await expect
    .poll(
      () =>
        f.active().content.filter((b) => b.type === "signature_block").length,
    )
    .toBe(2);
});
test("Blocks supports pointer drop and Studio inserts the same signatures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const id = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    content: [{ id, type: "paragraph", text: "Drop after this paragraph" }],
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  const item = page
    .locator(".blocks-panel")
    .getByRole("menuitem", { name: "Heading 2", exact: true });
  const target = page.locator(`[data-block-id="block-${id}"]`);
  const textTarget = target.locator(".tiptap");
  const height = (await textTarget.boundingBox())!.height;
  await item.dragTo(textTarget, { targetPosition: { x: 30, y: height - 2 } });
  await expect
    .poll(() =>
      f.active().content.some((b) => b.type === "heading" && b.level === 2),
    )
    .toBe(true);
  await page.goto(`/studio/templates/${f.draft.template_id}`);
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await page
    .locator(".blocks-panel")
    .getByRole("menuitem", { name: "Signatures", exact: true })
    .click();
  await expect(
    page.locator(
      ".template-paged-paper .editor-signature,.template-paged-paper .document-signature",
    ),
  ).toHaveCount(2);
});
test("375px add sheet lists all signer blocks with duplicate explanations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const id = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    content: [{ id, type: "paragraph", text: "Phone proposal" }],
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(`[data-block-id="block-${id}"] .tiptap`).click();
  await page
    .getByRole("button", { name: "Add a block below", exact: true })
    .click();
  for (const name of ["Signatures", "Client signature", "Company signature"])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await page.getByRole("menuitem", { name: "Signatures", exact: true }).click();
  await expect
    .poll(
      () =>
        f.active().content.filter((b) => b.type === "signature_block").length,
    )
    .toBe(2);
});
