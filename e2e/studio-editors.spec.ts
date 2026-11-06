import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { workspaceEvent } from "../src/lib/studio";
import { staff } from "../tests/helpers";
async function fixture(page: import("@playwright/test").Page) {
  const f = await editorFixture(page);
  const template = (await f.repo.entities<any>("templates"))[0];
  const block = {
    id: crypto.randomUUID(),
    name: "Reusable introduction",
    block: {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "A clear introduction for {{client.company}}.",
    },
  };
  await f.repo.put("content_library", block);
  await page.route("**/api/content_library**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const value = req.postDataJSON();
      await f.repo.put("content_library", value);
      await workspaceEvent(f.repo, staff, "content_library_saved", {
        entity_id: value.id,
        name: value.name,
      });
      return route.fulfill({ json: value });
    }
    if (req.method() === "DELETE") {
      await f.repo.removeSavedBlock(
        new URL(req.url()).pathname.split("/").pop()!,
      );
      return route.fulfill({ json: { deleted: true } });
    }
    return route.fulfill({ json: await f.repo.entities("content_library") });
  });
  return { ...f, template, block };
}
test("Studio template shell autosaves and reuses Quote, Fields, Blocks and Styles", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${f.template.id}`);
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("New template name");
  await expect
    .poll(async () => (await f.repo.entities<any>("templates"))[0].name)
    .toBe("New template name");
  await expect(page.locator(".template-editor-header")).toContainText(
    "Saved · changes apply to new proposals",
  );
  for (const tab of ["Fields", "Blocks", "Styles"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("tabpanel", { name: tab, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("Header & footer", { exact: true }),
  ).toBeVisible();
});
test("Saved block keeps explicit save, safe types, duplicate and deletion", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/blocks/${f.block.id}`);
  await expect(
    page.getByRole("tab", { name: "Fields", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Block name", { exact: true })
    .fill("Changed introduction");
  expect(
    (await f.repo.entities<any>("content_library")).find(
      (b) => b.id === f.block.id,
    ).name,
  ).toBe(f.block.name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("content_library")).find(
          (b) => b.id === f.block.id,
        ).name,
    )
    .toBe("Changed introduction");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Type", exact: true })
    .selectOption("Bulleted list");
  await expect(
    page.locator(".studio-saved-block-editor .tiptap ul"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(f.block.id));
  const copied = (await f.repo.entities<any>("content_library")).find(
    (b) => b.id !== f.block.id,
  );
  expect(copied.block.id).not.toBe(f.block.block.id);
  expect(copied.block.content.content[0].type).toBe("bulletList");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Delete block", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  await expect(page).toHaveURL(/studio\/templates\?view=blocks/);
  expect(
    (await f.repo.entities<any>("content_library")).some(
      (b) => b.id === f.block.id,
    ),
  ).toBe(true);
  expect(
    (await f.repo.entities<any>("content_library")).some(
      (b) => b.id === copied.id,
    ),
  ).toBe(false);
});

test("Plain contract clauses edit and insert fields without inert rich-text controls", async ({
  page,
}) => {
  const f = await fixture(page);
  const id = crypto.randomUUID();
  await f.repo.put("content_library", {
    id,
    name: "Terms",
    block: {
      id: crypto.randomUUID(),
      type: "contract",
      clauses: [
        {
          id: crypto.randomUUID(),
          title: "Terms",
          body: "Payment is due on completion.",
        },
      ],
    },
  });
  await page.goto(`/studio/blocks/${id}`);
  const text = page.getByRole("textbox", { name: /Clause.*body/i });
  await text.click();
  await text.fill("Plain terms for ");
  await text.press("End");
  const bar = page.getByRole("toolbar", { name: "Clause tools", exact: true });
  await expect(
    bar.getByRole("button", { name: "Insert field", exact: true }),
  ).toBeVisible();
  await expect(
    bar.getByRole("button", { name: /^(Bold|Italic|Text size)/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Client company — {{client.company}}",
      exact: true,
    })
    .click();
  await expect(text).toHaveValue("Plain terms for {{client.company}}");
  await expect(text).toBeFocused();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("content_library")).find((b) => b.id === id)
          .block.clauses[0].body,
    )
    .toBe("Plain terms for {{client.company}}");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Type", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("This block type can't be changed", { exact: true }),
  ).toBeVisible();
});

test("Template Blocks insert saved copies, guard signatures and undo paired insertions", async ({
  page,
}) => {
  const f = await fixture(page);
  f.template.content = f.template.content.filter(
    (b: any) => b.type !== "signature_block",
  );
  await f.repo.put("templates", f.template);
  await page.goto(`/studio/templates/${f.template.id}`);
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Blocks", exact: true });
  await panel
    .getByRole("menuitem", { name: "Reusable introduction", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await f.repo.entities<any>("templates"))[0].content.some(
        (b: any) => b.text === f.block.block.text,
      ),
    )
    .toBe(true);
  await panel
    .getByRole("menuitem", { name: "Signatures", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("templates"))[0].content.filter(
          (b: any) => b.type === "signature_block",
        ).length,
    )
    .toBe(2);
  await expect(
    panel.getByRole("menuitem", { name: "Signatures", exact: true }),
  ).toBeDisabled();
  const stored = (await f.repo.entities<any>("templates"))[0];
  const first = stored.content.findIndex(
    (b: any) => b.type === "signature_block",
  );
  expect(stored.content[first - 1].text).toBe("Signatures");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("templates"))[0].content.filter(
          (b: any) => b.type === "signature_block",
        ).length,
    )
    .toBe(0);
  const heading = panel.getByRole("menuitem", {
    name: "Heading 2",
    exact: true,
  });
  await heading.focus();
  await heading.press("Enter");
  await expect
    .poll(async () =>
      (await f.repo.entities<any>("templates"))[0].content.some(
        (b: any) => b.type === "heading" && b.level === 2,
      ),
    )
    .toBe(true);
  const target = page
    .locator(".template-paged-paper .tiptap")
    .filter({ hasText: "A clear and useful plan." })
    .first();
  const height = (await target.boundingBox())!.height;
  await panel
    .getByRole("menuitem", { name: "Reusable introduction", exact: true })
    .dragTo(target, { targetPosition: { x: 30, y: height - 2 } });
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("templates"))[0].content.filter(
          (b: any) => b.text === f.block.block.text,
        ).length,
    )
    .toBe(2);
});

test("Studio editors evidence and responsive tools", async ({ page }) => {
  const f = await fixture(page);
  const { mkdirSync } = await import("node:fs");
  const dir = "docs/screenshots/studio-v3-editors";
  async function shot(name: string) {
    if (process.env.STUDIO_EDITORS_CAPTURE === "1") {
      mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: `${dir}/${name}.png`,
        animations: "disabled",
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${f.template.id}`);
  for (const [tab, file] of [
    ["Quote", "template-quote"],
    ["Fields", "template-fields"],
    ["Blocks", "template-blocks"],
    ["Styles", "template-styles"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    if (tab === "Quote")
      await page.locator(".quote-row-toggle").first().click();
    await shot(file);
    if (tab === "Blocks") {
      await page
        .getByRole("menuitem", { name: "Reusable introduction", exact: true })
        .scrollIntoViewIfNeeded();
      await shot("template-blocks-saved");
    }
    if (tab === "Styles") {
      await page.locator(".band-reset").scrollIntoViewIfNeeded();
      await shot("template-styles-bands");
    }
  }
  await page
    .getByRole("button", { name: "More editor actions", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Available for new proposals", exact: true })
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Hidden from new proposals", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await f.repo.entities<any>("templates"))[0].active)
    .toBe(false);
  await page.goto(`/studio/blocks/${f.block.id}`);
  for (const button of await page
    .locator(".template-editor-header button")
    .all()) {
    const box = await button.boundingBox();
    if (box) expect(box.x + box.width).toBeLessThanOrEqual(1433);
  }
  await shot("block-fields");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await shot("block-details");
  await page.getByRole("button", { name: "Delete block", exact: true }).click();
  await shot("block-delete");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    localStorage.setItem("theme", "dark");
  });
  await expect(
    page.getByRole("button", { name: "Duplicate", exact: true }),
  ).toHaveCSS("background-color", "rgb(28, 27, 25)");
  await expect(
    page.getByRole("button", { name: "Duplicate", exact: true }),
  ).toHaveCSS("color", "rgb(238, 243, 243)");
  await shot("block-details-dark");
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.getByRole("button", { name: "Open Fields", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Block tools", exact: true }),
  ).toBeVisible();
  await shot("block-tablet-fields");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    localStorage.setItem("theme", "light");
  });
  await page.locator(".studio-blocks .tiptap").click();
  await expect(
    page.getByRole("toolbar", { name: "Text tools", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("toolbar", { name: "Text tools", exact: true })
      .getByRole("button", { name: /^Bold/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("toolbar", { name: "Text tools", exact: true }),
  ).toHaveCSS("opacity", "1");
  await expect(
    page.getByRole("toolbar", { name: "Text tools", exact: true }),
  ).toHaveCSS("background-color", "rgb(28, 27, 24)");
  await shot("block-phone");
  const bar = await page
    .getByRole("toolbar", { name: "Text tools", exact: true })
    .boundingBox();
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(813);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "More editor actions", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Block tools", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await shot("block-phone-details");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Template autosave keeps failed edits and Retry saves them; new-proposal uses this template", async ({
  page,
}) => {
  const f = await fixture(page);
  let fail = true;
  await page.route("**/api/templates", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: "Template save temporarily unavailable" },
      });
    return route.fallback();
  });
  await page.goto(`/studio/templates/${f.template.id}`);
  const name = page.getByLabel("Template name", { exact: true });
  await name.fill("Keep my template work");
  await expect(
    page.getByText(
      "Your changes are still here. Template save temporarily unavailable",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(name).toHaveValue("Keep my template work");
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect
    .poll(async () => (await f.repo.entities<any>("templates"))[0].name)
    .toBe("Keep my template work");
  await page
    .getByRole("button", { name: "New proposal from this", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "New proposal", exact: true }),
  ).toBeVisible();
  await expect(page.locator('select[name="template"]')).toHaveValue(
    f.template.id,
  );
});

test("New block creates an empty text editor and list routes retain availability", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/studio/templates?view=blocks");
  await page.getByRole("button", { name: "New block", exact: true }).click();
  await expect(page).toHaveURL(/studio\/blocks\//);
  await expect(page.getByLabel("Block name", { exact: true })).toHaveValue(
    "Untitled block",
  );
  await expect(page.locator(".studio-blocks .tiptap")).toHaveText("");
});

test("editing template defaults preserves inactive rows while preview totals exclude them", async ({
  page,
}) => {
  const f = await fixture(page);
  const { templateDefaultQuote } = await import("../src/lib/template-quote");
  const catalog = await f.repo.entities<any>("pricing_items");
  const authored = templateDefaultQuote(f.template, catalog).quote;
  const retired = authored[0];
  const product = catalog.find((i) => i.id === retired.pricing_item_id)!;
  await f.repo.put("pricing_items", { ...product, active: false });
  f.template.default_items = authored;
  f.template.default_quote = [];
  await f.repo.put("templates", f.template);
  await page.goto(`/studio/templates/${f.template.id}`);
  await expect(
    page.locator(".quote-row-toggle").filter({ hasText: retired.name }),
  ).toBeVisible();
  await page
    .locator(".quote-row-toggle")
    .filter({ hasText: authored[1].name })
    .click();
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("An updated active default");
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("templates"))[0].default_items?.[1]?.name,
    )
    .toBe("An updated active default");
  const stored = (await f.repo.entities<any>("templates"))[0];
  expect(stored.default_items[0]).toEqual(retired);
  await expect(
    page.locator(".quote-panel footer").getByText("$0", { exact: true }),
  ).toBeVisible();
  const created = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.template.id,
      title: "Defaults stay safe",
    },
    staff,
  );
  expect(
    created.quote.some((i) => i.pricing_item_id === retired.pricing_item_id),
  ).toBe(false);
});
