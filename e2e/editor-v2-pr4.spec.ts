import { staff } from "../tests/helpers";
import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
test("panel rows expand one at a time, retain prices/mappings, fields insert safely and Styles keeps all controls", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const panel = page.locator(".editor-v2-panel");
  const rows = panel.locator(".quote-row");
  await expect(rows).toHaveCount(f.active().quote.length);
  await expect(
    rows.locator("[aria-expanded=true].quote-row-toggle"),
  ).toHaveCount(0);
  await rows.first().locator(".quote-row-toggle").click();
  await expect(rows.first().locator(".quote-row-body")).toBeVisible();
  await rows.nth(1).locator(".quote-row-toggle").click();
  await expect(rows.nth(0).locator(".quote-row-body")).toHaveCount(0);
  await expect(rows.nth(1).locator(".quote-row-body")).toBeVisible();
  await expect(
    panel.getByRole("textbox", { name: "Item name", exact: true }),
  ).toHaveCount(1);
  await rows
    .nth(1)
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await expect(rows.nth(1).getByLabel("Stripe lookup key")).toBeVisible();
  await expect(rows.nth(1).getByLabel("QuickBooks item")).toBeVisible();
  await expect(
    panel.getByText("Plan terms come from Products.", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator("footer > .totals")).toContainText("One-time");
  await expect(panel.locator("footer > .totals")).toContainText("Monthly");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(
    panel.getByRole("searchbox", { name: "Search fields" }),
  ).toHaveCSS("height", "44px");
  await expect(panel.locator(".fields-hint")).toHaveText(
    "Click into a paragraph, then choose a field to insert it. Or type {{ in any paragraph.",
  );
  const field = panel.getByRole("button", {
    name: /^Client first name /,
    exact: true,
  });
  await expect(field.locator("code")).toHaveText("{{client.first_name}}");
  await field.click();
  await expect(
    page.getByText("Click into a paragraph first, then choose a field", {
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByRole("tab", { name: "Styles", exact: true }).click();
  await panel.getByText("Text styles", { exact: true }).click();
  await expect(
    panel.getByRole("group", { name: "Color", exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Colour", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Edit custom color", exact: true }),
  ).toBeVisible();
  await panel.getByText("Typography details", { exact: true }).click();
  await expect(
    panel.getByRole("combobox", { name: "Letter case", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("spinbutton", { name: /letter spacing/ }),
  ).toBeVisible();
  await panel.getByRole("tab", { name: "Send", exact: true }).click();
  await expect(
    panel.getByRole("combobox", { name: "From", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Send to / })).toBeVisible();
  await expect(page.locator(".ai-review-banner")).toHaveCount(0);
});

test("tablet tools overlay the page with a trapped focus and close on Escape", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const before = await page.locator(".editor-paper").boundingBox();
  await page.getByRole("button", { name: /^Open Quote\b/ }).click();
  const drawer = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())!.width).toBe(440);
  expect(await page.locator(".editor-paper").boundingBox()).toEqual(before);
  for (let i = 0; i < 18; i++) await page.keyboard.press("Tab");
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
test("phone sheets trap focus; selected text docks above the visual viewport and toolbar insertion opens a modal block menu", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-phone-header")).toHaveCSS(
    "height",
    "52px",
  );
  await expect(page.locator(".editor-phone-dock")).toBeVisible();
  await expect(page.locator(".editor-sheet-gap").first()).toHaveCSS(
    "height",
    "12px",
  );
  await page.getByRole("button", { name: /^Open Quote\b/ }).click();
  const sheet = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 18; i++) await page.keyboard.press("Tab");
  expect(
    await sheet.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await sheet.getByRole("button", { name: "Close Quote", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const block = page.locator(`[data-block-id="block-${f.content[1].id}"]`);
  const plan = await page
    .locator(".editor-paper")
    .getAttribute("data-pagination");
  await block.locator(".tiptap").click();
  await expect(block.locator(".tiptap")).toBeFocused();
  await expect(
    page
      .locator(".editor-phone-header")
      .getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".document-cover").first()).toBeVisible();
  expect(
    await page.locator(".editor-paper > [data-phone-section]:visible").count(),
  ).toBeGreaterThan(1);
  await expect(page.locator(".editor-paper")).toHaveAttribute(
    "data-pagination",
    plan!,
  );
  const bar = block.getByRole("toolbar", { name: "Text tools", exact: true });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS("position", "fixed");
  await expect(bar).toHaveCSS("height", "48px");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 550,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const dock = (await page.locator(".editor-phone-dock").boundingBox())!;
      return Math.round(dock.y + dock.height);
    })
    .toBe(550);
  const dock = (await page.locator(".editor-phone-dock").boundingBox())!;
  const formatting = (await bar.boundingBox())!;
  expect(
    Math.abs(formatting.y + formatting.height - dock.y),
  ).toBeLessThanOrEqual(1);
  const remove = bar.getByRole("button", { name: "Delete block", exact: true });
  await remove.scrollIntoViewIfNeeded();
  await expect(remove).toBeInViewport();
  expect((await remove.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  const above = block.getByRole("button", {
    name: "Add a block above",
    exact: true,
  });
  const below = block.getByRole("button", {
    name: "Add a block below",
    exact: true,
  });
  await expect(above).toHaveCSS("height", "44px");
  await expect(below).toHaveCSS("height", "44px");
  await above.click();
  const menu = page.getByRole("dialog", { name: "Add a block", exact: true });
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((el) => el.matches(":modal"))).toBe(true);
  await menu.getByRole("menuitem", { name: "Text", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => f.active().content.length).toBe(f.content.length + 1);
  await page
    .locator(".editor-phone-header")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect(page.locator(".document-cover").first()).toBeVisible();
  await expect(page.locator(".editor-phone-dock")).toBeVisible();
});

test("template phone uses the shared unscaled sheets and keyboard edit bar", async ({
  page,
}) => {
  const f = await editorFixture(page);
  const template = (await f.repo.entities<any>("templates"))[0];
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/studio/templates/${template.id}`);
  const paper = page.locator(".template-paged-paper");
  await expect(paper).toHaveAttribute("data-sheet-view", "true");
  await expect(paper).toHaveCSS("transform", "none");
  await paper.locator(".block-frame .tiptap").first().click();
  await expect(page.locator(".editor-edit-bar")).toHaveCSS("position", "fixed");
  await expect(page.locator(".template-cover").first()).not.toBeVisible();
  await page
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  const remove = page
    .locator(".edit-more-menu:popover-open")
    .getByRole("menuitem", { name: "Delete block", exact: true });
  await remove.scrollIntoViewIfNeeded();
  await remove.click({ trial: true });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Done editing template section", exact: true })
    .click();
  await expect(page.locator(".template-cover").first()).toBeVisible();
  await page
    .getByRole("button", { name: "More editor actions", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Template tools", exact: true })
      .getByRole("button", { name: "Undo", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("sent editor publishes on its existing link, keeps invalid work off the client page and locks to the accepted version", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await f.editRemote({
    content: [
      ...f.active().content,
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
  });
  const sent = await f.sendRemote();
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: staff,
        settings: f.settings,
        staff: f.members,
        app_url: "https://canonical.example.test",
      },
    }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          (window as any).__copied = value;
        },
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${sent.id}?action=edit`);
  await expect(
    page.getByRole("button", { name: "Copy client link", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copy client link", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copied))
    .toBe(`https://canonical.example.test/p/${sent.token}`);
  const text = page.locator(
    `[data-block-id="block-${f.content[1].id}"] .tiptap`,
  );
  await text.fill("This saved text is live on the same link.");
  await expect.poll(() => f.active().versions.length).toBe(2);
  expect(f.active().token).toBe(sent.token);
  expect(f.active().jobs).toEqual(sent.jobs);
  const live = await page.evaluate(
    async (token) => (await fetch(`/api/public/${token}`)).json(),
    sent.token,
  );
  expect(live.html).toContain("This saved text is live on the same link.");
  const price = page.locator(
    `[data-block-id="block-${f.content.find((b) => b.type === "pricing_table")!.id}"]`,
  );
  await price.focus();
  await price
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete required block?", exact: true })
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  await expect(page.locator(".editor-save-status")).toContainText(
    "Not live | Add a pricing table",
  );
  expect(f.active().versions).toHaveLength(2);
  const previous = await page.evaluate(
    async (token) => (await fetch(`/api/public/${token}`)).json(),
    sent.token,
  );
  expect(previous.content.some((b: any) => b.type === "pricing_table")).toBe(
    true,
  );
  await page.goto(`/p/${sent.id}?preview=published`);
  await expect(page.getByText("Preview of published version")).toBeVisible();
  await expect(page.locator("#proposal-document")).toContainText(
    "This saved text is live on the same link.",
  );
  await expect(
    page.getByRole("heading", { name: "Your investment" }),
  ).toBeVisible();
  await page.goto(`/proposals/${sent.id}?view=send&focus=readiness`);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Add a pricing table" }),
  ).toBeFocused();
  const { signature } = await import("../tests/helpers");
  await f.signRemote({
    ...signature(f.active().revision),
    reviewed_hash: f.active().versions.at(-1)!.content_hash,
  });
  await text.fill("Local edits made just after the client signed");
  await expect(page.locator(".editor-save-status")).toHaveText(
    "Signed | locked",
  );
  await expect(
    page.getByRole("button", { name: "Duplicate as new draft", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Unpublished changes were not part of the signed version", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".editor-edit-bar,.editor-gutter,.editor-ai-check"),
  ).toHaveCount(0);
  await expect(
    page.locator(".editor-paper [contenteditable=true]"),
  ).toHaveCount(0);
});

test("phone Send Show me closes the sheet before selecting an unreviewed section", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await f.editRemote({
    content: f.content.map((b, n) =>
      n === 1
        ? { ...b, ai_review: { source: "assistant", reviewed: false } }
        : b,
    ),
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("button", { name: "Open Send", exact: true }).click();
  const sheet = page.getByRole("dialog", {
    name: "Proposal tools",
    exact: true,
  });
  await sheet.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.locator(`[data-block-id="block-${f.content[1].id}"]`),
  ).toHaveAttribute("data-selected", "true");
  await expect(
    page
      .locator(".editor-phone-header")
      .getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
});
