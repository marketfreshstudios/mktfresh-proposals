import { test, expect, type Page, type Locator } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { blockText } from "../src/lib/editor-document";

test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
async function open(page: Page, id: string) {
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/proposals/${id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
}
async function plan(page: Page) {
  return page.locator(".editor-paper .page-sheet").evaluateAll((els) => ({
    format: 1,
    pages: els.length,
    starts: els
      .flatMap(
        (el) => JSON.parse(el.getAttribute("data-source-fragments")!) as any[],
      )
      .filter((v) => v.offset !== undefined),
  }));
}
async function idle(page: Page) {
  // Longer than the content debounce: catches an unintended second metadata save.
  await page.waitForTimeout(1300);
}

test("pagination alone is clean; text and its computed plan use one content revision", async ({
  page,
}) => {
  const f = await editorFixture(page, true);
  await open(page, f.draft.id);
  const revision = f.active().revision;
  const before = await plan(page);
  await page.evaluate(
    (value) =>
      localStorage.setItem(
        `proposal-unsaved:${value.workspace_id ?? "workspace"}:${value.id}`,
        JSON.stringify({
          ...value,
          pagination: { format: 1, pages: 99, starts: [] },
        }),
      ),
    f.active(),
  );
  await page.reload();
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(All changes saved|Draft · Saved)$/,
  );
  await expect(page.locator(".editor-notice-recovered")).toHaveCount(0);
  await page.locator(".editor-paper").evaluate((el) => {
    el.querySelectorAll<HTMLElement>(".tiptap").forEach(
      (p) => (p.style.lineHeight = "64px"),
    );
    el.dispatchEvent(new Event("pagination-layout-change"));
  });
  await expect
    .poll(async () => (await plan(page)).pages)
    .toBeGreaterThan(before.pages);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await idle(page);
  expect(f.patches).toHaveLength(0);
  expect(f.active().revision).toBe(revision);
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(All changes saved|Draft · Saved)$/,
  );
  await expect(page.locator(".editor-notice-recovered")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("proposal-unsaved:"),
      ),
    ),
  ).toEqual([]);
  const paragraph = page.locator(
    `[data-block-id="block-${f.content[1].id}"] .tiptap`,
  );
  await paragraph.fill("This content change also changes the page breaks.");
  await expect.poll(() => f.patches.length).toBe(1);
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(All changes saved|Draft · Saved)$/,
  );
  expect(f.patches[0].pagination).toEqual(await plan(page));
  expect(f.active().revision).toBe(revision + 1);
  await idle(page);
  expect(f.patches).toHaveLength(1);
});

test("a real concurrent edit preserves local rich text as a suggestion and recomputes one merged plan", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let hold = true;
  const f = await editorFixture(page, false, {
    beforeSave: async () => {
      if (hold) await gate;
    },
  });
  await open(page, f.draft.id);
  const localText =
    "My local rich text must survive the other session. ".repeat(75);
  const paragraph = page.locator(
    `[data-block-id="block-${f.content[1].id}"] .tiptap`,
  );
  await paragraph.fill(localText);
  await expect.poll(() => f.patches.length).toBe(1);
  const remoteContent = f
    .active()
    .content.filter((b) => b.type !== "page_break")
    .map((b) =>
      b.id === f.content[1].id
        ? { ...b, text: "Other session text", content: undefined }
        : b,
    );
  const remote = await f.editRemote({
    title: "Other session title",
    content: remoteContent,
  });
  hold = false;
  release();
  const banner = page.locator(".editor-notice-recovered");
  await expect(page.locator(".editor-notice-stale")).toBeVisible();
  await expect(paragraph).toHaveText(localText.trim());
  expect(blockText(f.active().content[1])).toBe("Other session text");
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(paragraph).toHaveText("Other session text");
  await expect(banner).toBeVisible();
  await page.getByText("See my saved changes", { exact: true }).click();
  await expect(page.locator(".recovery-copy")).toContainText(localText.trim());
  await idle(page);
  expect(f.patches).toHaveLength(1);
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(paragraph).toHaveText(localText.trim());
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(All changes saved|Draft · Saved)$/,
  );
  await expect.poll(() => f.patches.length).toBe(2);
  expect(f.patches[1].revision).toBe(remote.revision);
  expect(f.patches[1].pagination).toEqual(await plan(page));
  expect(
    f.patches[1].pagination.starts.some(
      (s: any) => s.after_break === f.content[2].id || s.explicit,
    ),
  ).toBe(true);
  expect(blockText(f.active().content[1])).toBe(localText);
  expect(f.active().revision).toBe(remote.revision + 1);
  await idle(page);
  expect(f.patches).toHaveLength(2);
  await expect(banner).toHaveCount(0);
});

test("a conflict keeps the newest pre-conflict text read-only until Reload then Keep", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let hold = true;
  const f = await editorFixture(page, false, {
    beforeSave: async () => {
      if (hold) await gate;
    },
  });
  await open(page, f.draft.id);
  const paragraph = page.locator(
    `[data-block-id="block-${f.content[1].id}"] .tiptap`,
  );
  const newest =
    "The newest local text before the 409 must survive Reload and Keep.";
  await paragraph.fill(newest);
  await expect.poll(() => f.patches.length).toBe(1);
  const remote = await f.editRemote({
    title: "Other session changed the title",
  });
  hold = false;
  release();
  await expect(page.locator(".editor-notice-stale")).toBeVisible();
  await expect(paragraph).toHaveAttribute("contenteditable", "false");
  await expect(paragraph).toHaveText(newest);
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.locator(".editor-notice-recovered")).toBeVisible();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect.poll(() => blockText(f.active().content[1])).toBe(newest);
  await expect(paragraph).toBeEditable();
  expect(f.active().revision).toBe(remote.revision + 1);
  expect(f.patches).toHaveLength(2);
  expect(f.patches[1].pagination).toEqual(await plan(page));
});

test("back waits for an in-flight save; Escape stays in the editor", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const f = await editorFixture(page, false, { beforeSave: async () => gate });
  await open(page, f.draft.id);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/proposals/${f.draft.id}$`));
  await page
    .locator(`[data-block-id="block-${f.content[1].id}"] .tiptap`)
    .fill("Save me before leaving.");
  await expect.poll(() => f.patches.length).toBe(1);
  await page
    .getByRole("button", { name: "Back to proposals", exact: true })
    .click();
  await expect(page.locator(".editor-save-status")).toHaveText("Saving…");
  await expect(page).toHaveURL(new RegExp(`/proposals/${f.draft.id}$`));
  release();
  await expect(page).toHaveURL(/\/proposals$/);
  expect(f.patches).toHaveLength(1);
  expect(blockText(f.active().content[1])).toBe("Save me before leaving.");
});

test("failed saves ask before leaving, retry preserves text, and offline changes stay on device", async ({
  page,
  context,
}) => {
  let fail = true;
  const f = await editorFixture(page, false, {
    beforeSave: async () => {
      if (fail)
        throw Object.assign(new Error("Simulated save outage"), {
          status: 503,
        });
    },
  });
  await open(page, f.draft.id);
  await page
    .locator(`[data-block-id="block-${f.content[1].id}"] .tiptap`)
    .fill("Keep this during the outage.");
  await expect(
    page.getByRole("button", {
      name: /Couldn.t save (—|·) Retry/,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to proposals", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Leave the editor?" });
  await expect(confirm).toContainText("could not be saved");
  await confirm
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/proposals/${f.draft.id}$`));
  fail = false;
  await page
    .getByRole("button", { name: /Couldn.t save (—|·) Retry/, exact: true })
    .click();
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(All changes saved|Draft · Saved)$/,
  );
  await expect(page.locator(".editor-save-status")).toHaveAttribute(
    "title",
    /Last saved/,
  );
  await context.setOffline(true);
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(Offline — changes kept on this device|Offline · saved on this device)$/,
  );
  await page
    .locator(`[data-block-id="block-${f.content[1].id}"] .tiptap`)
    .fill("Kept offline on this device.");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Object.values(localStorage).some((v) =>
          v.includes("Kept offline on this device."),
        ),
      ),
    )
    .toBe(true);
  await context.setOffline(false);
  await expect(page.locator(".editor-save-status")).toHaveText(
    /^(All changes saved|Draft · Saved)$/,
  );
  expect(blockText(f.active().content[1])).toBe("Kept offline on this device.");
});

async function centred(button: Locator) {
  await expect(button).toBeVisible();
  const b = (await button.boundingBox())!,
    s = (await button.locator("svg").boundingBox())!;
  expect(Math.abs(s.x + s.width / 2 - b.x - b.width / 2)).toBeLessThanOrEqual(
    1,
  );
  expect(Math.abs(s.y + s.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(
    1,
  );
  expect(b.height).toBe(b.width);
  return b.width;
}
test("proposal and template headers share save states and centred fixed-size panel arrows", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await open(page, f.draft.id);
  const template = (await f.repo.entities<any>("templates"))[0];
  for (const path of [
    `/proposals/${f.draft.id}`,
    `/studio/templates/${template.id}`,
  ]) {
    await page.goto(path);
    const proposal = path.startsWith("/proposals");
    await expect(page.locator(".editor-document-header")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: proposal ? "Back to proposals" : "Back to templates",
        exact: true,
      }),
    ).toBeVisible();
    for (const container of proposal
      ? [".editor-outline", ".editor-sidepanel"]
      : [".studio-template-list", ".editor-sidepanel"]) {
      const arrow = page.locator(`${container} .sidebar-arrow`).first();
      const expanded = await centred(arrow);
      await arrow.click();
      expect(await centred(arrow)).toBe(expanded);
      await arrow.click();
      expect(await centred(arrow)).toBe(expanded);
    }
    if (!proposal) {
      const name = page.getByRole("textbox", {
        name: "Template name",
        exact: true,
      });
      await name.fill("A changed template");
      await expect(page.locator(".editor-save-status")).toHaveText(
        "Edited · not saved",
      );
      // The fixture owns this write too; page plans never write a template alone.
      await page.route("**/api/templates", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await route.fulfill({ json: route.request().postDataJSON() });
      });
      await expect(
        page.locator(".template-editor-header .editor-save-status"),
      ).toHaveText("Saved · changes apply to new proposals");
      await expect(page.locator(".editor-save-status")).toHaveText(
        "Saved · changes apply to new proposals",
      );
      await expect(page.locator(".editor-save-status")).toHaveAttribute(
        "title",
        /Last saved/,
      );
    }
  }
});
