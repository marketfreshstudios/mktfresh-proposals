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
import {
  studioEntityViews,
  writeStudioEntity,
} from "../src/lib/studio-history";
import { blockText } from "../src/lib/editor-document";
import { applyCoverLayout } from "../src/lib/cover";
import type { Audit, Template, Item } from "../src/lib/model";
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
    starter.cover = applyCoverLayout(starter.cover!, "split");
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
          json: await studioEntityViews(
            f.repo,
            "templates",
            await libraryTemplates(
              f.repo,
              await f.repo.entities<Template>("templates"),
            ),
            actor,
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
      const input = req.postDataJSON();
      const value = TemplateInputSchema.parse(input) as Template;
      const current = (await f.repo.entities<Template>("templates")).find(
        (t) => t.id === value.id,
      );
      const saved = await writeStudioEntity(
        f.repo,
        "templates",
        current ?? null,
        value,
        actor,
        {
          revision: input.expected_revision,
        },
      );
      writes.push(saved);
      return r.fulfill({ json: (await libraryTemplates(f.repo, [saved]))[0] });
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
  if (process.env.CAPTURE_EDITABLE_STARTERS === "1") {
    const dir = "docs/screenshots/editable-starters";
    await mkdir(dir, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${dir}/${name}.png`,
      animations: "disabled",
    });
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const url = (f: Fixture) => `/studio/templates/${f.starter.id}`;
const bodyBlock = (f: Fixture) =>
  f.starter.content.find((b) => b.type === "paragraph")!;
const bodyEditor = (page: Page, f: Fixture) =>
  page.locator(`[data-block-id="template-${bodyBlock(f).id}"] .tiptap`).first();
const card = (page: Page, f: Fixture) =>
  page.locator(`.studio-template-card[href="${url(f)}"]`);
const current = async (f: Fixture) =>
  (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.starter.id,
  )!;
const body = (t: Template, f: Fixture) =>
  blockText(t.content.find((b) => b.id === bodyBlock(f).id)!);
const more = (page: Page) =>
  page.getByRole("button", { name: "More editor actions", exact: true });

test("starter cover and text autosave in place and the card shows Edited; Duplicate keeps a separate copy", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto(url(f));
  await expect(page.locator(".template-editor-header")).not.toContainText(
    "read-only",
  );
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.locator(".cover-settings-accordion > summary").click();
  await page.getByLabel("Cover layout", { exact: true }).selectOption("split");
  await page
    .getByLabel("Cover background", { exact: true })
    .selectOption("solid");
  await expect
    .poll(async () => (await current(f)).cover?.background?.type)
    .toBe("solid");
  await expect(
    page.locator(".template-editor-header").getByRole("status"),
  ).toContainText("Saved");
  await expect(page.locator(".document-cover:visible").first()).toHaveAttribute(
    "data-cover-layout",
    "split",
  );
  await shot(page, "starter-cover-edit-1440");

  await bodyEditor(page, f).fill("My custom starter wording.");
  await expect
    .poll(async () => body(await current(f), f))
    .toBe("My custom starter wording.");
  await expect(
    page.locator(".template-editor-header").getByRole("status"),
  ).toContainText("Saved");
  await page.reload();
  await expect(bodyEditor(page, f)).toHaveText("My custom starter wording.");
  await expect(page.locator(".document-cover:visible").first()).toHaveAttribute(
    "data-cover-layout",
    "split",
  );
  expect((await current(f)).cover?.background?.type).toBe("solid");
  await page
    .getByRole("link", { name: "Back to templates", exact: true })
    .click();
  await expect(
    card(page, f).locator('[data-starter-status="edited"]'),
  ).toContainText("Edited");
  await shot(page, "starter-edited-card-1440");

  await page
    .getByRole("button", { name: `Actions for ${f.starter.name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Name your template" });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByLabel("Template name")).toHaveValue(
    `${f.starter.name} (copy)`,
  );
  await dialog
    .getByRole("button", { name: "Duplicate template", exact: true })
    .click();
  await expect(page.locator(".template-editor-header")).toContainText(
    `Based on ${f.starter.name}`,
  );
  const copy = (await f.repo.entities<Template>("templates")).find(
    (t) => t.source_starter_key === f.starter.starter_key,
  )!;
  expect(copy.id).not.toBe(f.starter.id);
  expect(copy.starter_key).toBeUndefined();
  expect(body(copy, f)).toBe("My custom starter wording.");
  expect(copy.cover).toEqual((await current(f)).cover);
  expect(await current(f)).toMatchObject({
    id: f.starter.id,
    starter_key: f.starter.starter_key,
  });
});

test("opening does not log edits, and undoing a saved change returns the starter to Default", async ({
  page,
}) => {
  const f = await fixture(page);
  const back = () =>
    page.getByRole("link", { name: "Back to templates", exact: true }).click();
  const edits = async () =>
    (await f.repo.entities<Audit>("workspace_events")).filter(
      (event) => event.type === "templates_saved",
    );
  const expectDefault = async () => {
    await expect(
      card(page, f).locator('[data-starter-status="default"]'),
    ).toContainText("Default");
    await expect(card(page, f)).not.toContainText(/edited /i);
  };

  await page.goto(url(f));
  const before = await edits();
  await bodyEditor(page, f).click();
  await back();
  await expectDefault();
  expect(f.writes).toHaveLength(0);
  expect(await edits()).toEqual(before);

  await card(page, f).click();
  await bodyEditor(page, f).fill("A real starter change.");
  await expect
    .poll(async () => body(await current(f), f))
    .toBe("A real starter change.");
  const [edited] = await libraryTemplates(f.repo, [await current(f)]);
  expect(edited.starter_edited).toBe(true);
  await expect(
    page.locator(".template-editor-header").getByRole("status"),
  ).toContainText("Saved");

  await page
    .locator(".template-editor-header")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(async () => body(await current(f), f))
    .toBe(body(f.starter, f));
  await expect(
    page.locator(".template-editor-header").getByRole("status"),
  ).toContainText("Saved");
  await back();
  await expectDefault();
});

test("Reset to default confirms, preserves identity, supports Undo and supplies the revision for the next edit", async ({
  page,
}) => {
  const f = await fixture(page, true);
  await page.goto(url(f));
  const reset = page.getByRole("dialog", {
    name: `Reset “${f.starter.name}” to default?`,
  });
  async function openReset() {
    await more(page).click();
    await page
      .getByRole("menuitem", { name: "Reset to default", exact: true })
      .click();
    await expect(
      reset.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
  }
  await openReset();
  await expect(reset).toContainText(
    "Proposals already created from this template keep their copy.",
  );
  await shot(page, "starter-reset-1440");
  await reset.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await current(f)).toEqual(f.starter);
  await openReset();
  await reset
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  const toast = page.getByRole("status").filter({ hasText: "Starter reset" });
  await expect(toast).toBeVisible();
  expect(await current(f)).toEqual(f.seeds[0]);
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => current(f)).toEqual(f.starter);
  await openReset();
  await reset
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  await expect(toast).toBeVisible();
  await bodyEditor(page, f).fill("An edit after reset.");
  await expect
    .poll(async () => body(await current(f), f))
    .toBe("An edit after reset.");
  await page
    .getByRole("button", { name: "New proposal from this", exact: true })
    .click();
  await page.waitForURL(new RegExp(`template=${f.starter.id}`));
});

test("Staff can edit and duplicate starters, while Reset and Hide remain super-admin actions", async ({
  page,
}) => {
  const f = await fixture(page, true, true);
  await page.goto(url(f));
  expect(
    await page.evaluate(
      async () =>
        (await (await fetch("/api/auth/session")).json()).user.staff_role,
    ),
  ).toBe("member");
  await bodyEditor(page, f).fill("A Staff edit.");
  await expect
    .poll(async () => body(await current(f), f))
    .toBe("A Staff edit.");
  await more(page).click();
  await expect(
    page.getByRole("menuitem", { name: "Duplicate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", {
      name: /Reset to default|Hide from new proposals/,
    }),
  ).toHaveCount(0);
});

test("starter quote and styles use the same in-place autosave", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto(url(f));
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Text styles", { exact: true }).click();
  await page.getByRole("spinbutton", { name: /size \(px\)/ }).fill("24");
  await expect
    .poll(async () => (await current(f)).style_overrides?.title?.size)
    .toBe(24);
  await page.getByRole("tab", { name: "Quote", exact: true }).click();
  await page.getByRole("button", { name: "Custom line", exact: true }).click();
  await expect
    .poll(async () => (await current(f)).default_items?.length)
    .toBe(1);
});
