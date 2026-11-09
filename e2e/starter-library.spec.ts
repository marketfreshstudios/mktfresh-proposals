import { test, expect, type Page } from "@playwright/test";
test.use({ actionTimeout: 10000 });
import { mkdir } from "node:fs/promises";
import { editorFixture } from "./editor-fixture";
import { staff } from "../tests/helpers";
import { workspaceStarterTemplates } from "../seed/starter-templates";
import {
  libraryStarterAction,
  libraryTemplates,
  TemplateInputSchema,
} from "../src/lib/template-library";
import { blockText } from "../src/lib/editor-document";
import type { Template, Item } from "../src/lib/model";
async function fixture(page: Page, edited = false, member = false) {
  const f = await editorFixture(page),
    seeds = workspaceStarterTemplates(
      f.repo.workspaceId,
      await f.repo.entities<Item>("pricing_items"),
    );
  for (const t of seeds) await f.repo.put("templates", t);
  const starter = structuredClone(seeds[0]);
  if (edited) {
    starter.content[1].text = "Owner's custom overview";
    await f.repo.put("templates", starter);
  }
  const writes: any[] = [],
    actor = {
      ...staff,
      staff_role: member ? ("member" as const) : ("owner" as const),
    };
  await page.route("**/api/auth/**", (r) =>
    r.fulfill({
      json: {
        user: actor,
        settings: f.settings,
        staff: f.members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: "fixture",
      },
    }),
  );
  await page.route("**/api/templates**", async (r) => {
    const parts = new URL(r.request().url()).pathname
        .split("/")
        .filter(Boolean),
      req = r.request();
    try {
      if (req.method() === "GET")
        return r.fulfill({
          json: await libraryTemplates(
            f.repo,
            await f.repo.entities<Template>("templates"),
          ),
        });
      if (parts[3])
        return r.fulfill({
          json: await libraryStarterAction(
            f.repo,
            actor,
            parts[2],
            parts[3],
            req.postDataJSON(),
          ),
        });
      const value = TemplateInputSchema.parse(req.postDataJSON());
      writes.push(value);
      if (
        (await f.repo.entities<Template>("templates")).find(
          (t) => t.id === value.id,
        )?.starter_key
      )
        return r.fulfill({
          status: 403,
          json: { error: "Starters are read-only" },
        });
      await f.repo.put("templates", value);
      return r.fulfill({ json: value });
    } catch (e) {
      return r.fulfill({
        status: (e as any).status ?? 400,
        json: { error: (e as Error).message },
      });
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { ...f, starter, seeds, writes };
}
async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_STARTER_LIBRARY) {
    await mkdir("docs/screenshots/starter-library", { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/starter-library/${name}.png`,
    });
  }
}
async function attempt(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto(`/studio/templates/${f.starter.id}`);
  const b = f.starter.content.find((b) => b.type === "paragraph")!;
  const text = page
    .locator(`[data-block-id="template-${b.id}"] .tiptap`)
    .first();
  await text.scrollIntoViewIfNeeded();
  await text.click();
  await text.fill("My retained customization.");
  await expect(page.locator(".starter-edit-notice")).toHaveText(
    /This is a Yeswell starter. Make a copy to customize it./,
  );
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    ),
  ).toEqual(f.starter);
  expect(f.writes).toEqual([]);
  await page
    .locator(".studio-template-main")
    .evaluate((el) => el.scrollTo({ top: 0 }));
  return b;
}
test("starter typing stays read-only; named copy gets the attempted edit and provenance", async ({
  page,
}) => {
  const f = await fixture(page),
    b = await attempt(page, f);
  await shot(page, "starter-edit-bar-1440");
  await page
    .locator(".starter-edit-notice")
    .getByRole("button", { name: "Make a copy", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Name your template" });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByLabel("Template name")).toHaveValue(
    `${f.starter.name} (copy)`,
  );
  await shot(page, "name-dialog-1440");
  await dialog.getByRole("button", { name: "Make copy", exact: true }).click();
  await page.waitForURL(/\/studio\/templates\/(?!.*\?)/);
  await expect(page.locator(".template-editor-header")).toContainText(
    `Based on ${f.starter.name}`,
  );
  const copy = (await f.repo.entities<Template>("templates")).find(
    (t) => t.source_starter_key === f.starter.starter_key,
  )!;
  expect(copy.starter_key).toBeUndefined();
  expect(blockText(copy.content.find((v) => v.id === b.id)!)).toBe(
    "My retained customization.",
  );
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    ),
  ).toEqual(f.starter);
  await shot(page, "copy-based-on-1440");
  const copiedText = page
    .locator(`[data-block-id="template-${b.id}"] .tiptap`)
    .first();
  await copiedText.scrollIntoViewIfNeeded();
  await copiedText.click();
  await copiedText.fill("A second edit to my copy.");
  await expect
    .poll(async () =>
      blockText(
        (await f.repo.entities<Template>("templates"))
          .find((t) => t.id === copy.id)!
          .content.find((v) => v.id === b.id)!,
      ),
    )
    .toBe("A second edit to my copy.");
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    ),
  ).toEqual(f.starter);
  await page.goto("/studio/templates");
  const card = page
    .locator(".studio-template-card")
    .filter({ hasText: copy.name });
  await expect(card).toContainText(`Based on ${f.starter.name}`);
});
test("starter cards preview/use/copy and reset with backup and exact Undo; Staff has no reset/hide", async ({
  page,
}) => {
  const f = await fixture(page, true);
  await page.goto("/studio/templates");
  await expect(page.locator(".starter-pill")).toHaveCount(7);
  await page
    .getByRole("button", { name: `Actions for ${f.starter.name}`, exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Reset to starter", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Delete/ })).toHaveCount(0);
  await shot(page, "cards-menu-1440");
  await page
    .getByRole("menuitem", { name: "Reset to starter", exact: true })
    .click();
  const reset = page.getByRole("dialog", {
    name: `Reset ${f.starter.name} to the latest starter?`,
  });
  await expect(
    reset.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await shot(page, "reset-dialog-1440");
  await reset
    .getByRole("button", { name: "Make a copy first", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Name your template" })
    .getByRole("button", { name: "Make copy", exact: true })
    .click();
  const toast = page.getByRole("status").filter({ hasText: "Starter reset" });
  await expect(toast).toBeVisible();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    )!.content,
  ).toEqual(f.seeds[0].content);
  const backup = (await f.repo.entities<Template>("templates")).find(
    (t) => t.source_starter_key === f.starter.starter_key,
  )!;
  expect(backup.content).toEqual(f.starter.content);
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    ),
  ).toEqual(f.starter);
  await page
    .getByRole("button", { name: `Actions for ${f.starter.name}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Reset to starter", exact: true })
    .click();
  await page
    .getByRole("dialog", {
      name: `Reset ${f.starter.name} to the latest starter?`,
    })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    ),
  ).toEqual(f.starter);
  await page
    .getByRole("button", { name: `Actions for ${f.starter.name}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Reset to starter", exact: true })
    .click();
  await page
    .getByRole("dialog", {
      name: `Reset ${f.starter.name} to the latest starter?`,
    })
    .getByRole("button", { name: "Reset to starter", exact: true })
    .click();
  await expect(toast).toBeVisible();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    )!.content,
  ).toEqual(f.seeds[0].content);
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await page.goto(`/studio/templates/${f.starter.id}`);
  await page
    .getByRole("button", { name: "New proposal from this", exact: true })
    .click();
  await page.waitForURL(new RegExp(`template=${f.starter.id}`));
});
test("style, quote and insert attempts prompt without changing the library; phone bar fits", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto(`/studio/templates/${f.starter.id}`);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Text styles", { exact: true }).click();
  await page.getByRole("spinbutton", { name: /size \(px\)/ }).fill("24");
  await expect(page.locator(".starter-edit-notice")).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.reload();
  await page.getByRole("tab", { name: "Quote", exact: true }).click();
  await page.getByRole("button", { name: "Custom line", exact: true }).click();
  await expect(page.locator(".starter-edit-notice")).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.reload();
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Blocks" })
    .getByRole("menuitem", { name: /Paragraph/ })
    .first()
    .click();
  await expect(page.locator(".starter-edit-notice")).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.reload();
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.locator(".cover-settings-accordion>summary").click();
  await page.getByLabel("Cover layout", { exact: true }).selectOption("split");
  await expect(page.locator(".starter-edit-notice")).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.setViewportSize({ width: 375, height: 850 });
  await attempt(page, f);
  const bar = await page.locator(".starter-edit-notice").boundingBox(),
    button = await page
      .locator(".starter-edit-notice")
      .getByRole("button", { name: "Make a copy", exact: true })
      .boundingBox();
  expect(button!.y).toBeGreaterThanOrEqual(bar!.y + 8);
  expect(button!.y + button!.height).toBeLessThanOrEqual(
    bar!.y + bar!.height - 7,
  );
  await shot(page, "starter-edit-bar-375");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
});
test("Staff can copy but cannot reset or hide a starter", async ({ page }) => {
  const f = await fixture(page, true, true);
  await page.goto("/studio/templates");
  expect(
    await page.evaluate(
      async () =>
        (await (await fetch("/api/auth/session")).json()).user.staff_role,
    ),
  ).toBe("member");
  await page
    .getByRole("button", { name: `Actions for ${f.starter.name}`, exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Make a copy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", {
      name: /Reset to starter|Hide from new proposals/,
    }),
  ).toHaveCount(0);
});
test("an unfinished recovered style opens a clean editable copy with an explicit explanation", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.addInitScript(
    ({ id, value, workspace }) => {
      for (const key of ["workspace", workspace])
        localStorage.setItem(
          `studio-unsaved:${key}:templates:${id}`,
          JSON.stringify(value),
        );
    },
    {
      id: f.starter.id,
      value: { ...f.starter, style_overrides: { body: { size: 0 } } },
      workspace: f.repo.workspaceId,
    },
  );
  await page.goto(`/studio/templates/${f.starter.id}`);
  await page
    .getByRole("button", { name: "Restore my edits", exact: true })
    .click();
  await page
    .locator(".starter-edit-notice")
    .getByRole("button", { name: "Make a copy", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Name your template" })
    .getByRole("button", { name: "Make copy", exact: true })
    .click();
  await page.waitForURL(/copy=without-edit/);
  await expect(
    page.getByText(
      "The unfinished change could not be applied. Continue editing here.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.source_starter_key === f.starter.starter_key,
    )!.style_overrides,
  ).toBeUndefined();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.starter.id,
    ),
  ).toEqual(f.starter);
});
