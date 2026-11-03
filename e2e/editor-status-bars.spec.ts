import { test, expect, type Locator, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

async function expectHeaderButtons(page: Page, bar: Locator) {
  await expect(bar).toBeVisible();
  await page.mouse.move(0, 700);
  const style = (button: Locator) =>
    button.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        radius: s.borderRadius,
        font: s.font,
        padding: [s.paddingLeft, s.paddingRight],
        border: [s.borderWidth, s.borderStyle, s.borderColor],
        background: s.backgroundColor,
        color: s.color,
      };
    });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const outline = await style(
      page.getByRole("button", { name: "Preview PDF", exact: true }),
    );
    const primary = await style(page.locator(".editor-header-send"));
    expect(outline.height).toBe(36);
    for (const button of await bar.getByRole("button").all()) {
      const actual = await style(button);
      expect(actual.height).toBe(outline.height);
      expect(actual.radius).toBe(outline.radius);
      expect(actual.font).toBe(outline.font);
      const reference = (await button.getAttribute("class"))?.includes(
        "editor-button-primary",
      )
        ? primary
        : outline;
      expect(actual).toEqual(reference);
      const b = (await button.boundingBox())!;
      const bounds = (await bar.boundingBox())!;
      expect(b.y - bounds.y).toBeGreaterThanOrEqual(6);
      expect(bounds.y + bounds.height - b.y - b.height).toBeGreaterThanOrEqual(
        6,
      );
    }
    expect(await bar.evaluate((el) => getComputedStyle(el).columnGap)).toBe(
      "8px",
    );
  }
}

for (const width of [1440, 1024, 768]) {
  test(`recovery, conflict and error actions share header buttons with vertical space at ${width}`, async ({
    page,
  }) => {
    let outage = false;
    const f = await editorFixture(page, false, {
      beforeSave: async () => {
        if (outage)
          throw Object.assign(new Error("Temporary save outage"), {
            status: 503,
          });
      },
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    await page.evaluate((value) => {
      localStorage.setItem(
        `proposal-unsaved:${value.workspace_id ?? "workspace"}:${value.id}`,
        JSON.stringify({ ...value, title: "Recovered local title" }),
      );
    }, f.active());
    await page.reload();
    const recovered = page.locator(".editor-notice-recovered");
    await expectHeaderButtons(page, recovered);
    await recovered
      .getByRole("button", { name: "Discard", exact: true })
      .click();
    await expect(recovered).toHaveCount(0);

    await f.editRemote({ title: "Another session's title" });
    const paragraph = page.locator(
      `[data-block-id="block-${f.content[1].id}"] .tiptap`,
    );
    await paragraph.fill("Preserve my local text through conflict and retry.");
    const stale = page.locator(".editor-notice-stale");
    await expectHeaderButtons(page, stale);
    await stale.getByRole("button", { name: "Reload", exact: true }).click();
    await expectHeaderButtons(page, recovered);
    outage = true;
    await recovered.getByRole("button", { name: "Keep", exact: true }).click();
    const error = page.locator(".editor-notice-error");
    await expectHeaderButtons(page, error);
    await expect(paragraph).toHaveText(
      "Preserve my local text through conflict and retry.",
    );
    outage = false;
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error).toHaveCount(0);
    await expect(page.locator(".editor-save-status")).toHaveText(
      width < 960 ? "Saved" : "Draft · Saved",
    );
    await expect(paragraph).toHaveText(
      "Preserve my local text through conflict and retry.",
    );
  });
}
