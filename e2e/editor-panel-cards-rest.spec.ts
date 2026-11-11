import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { openEditorPanel } from "./editor-ui";
import type { Template } from "../src/lib/model";

const shots = "docs/screenshots/editor-panel-cards-rest";
const capture = process.env.CAPTURE_PANEL_CARDS === "1";
test.use({ actionTimeout: 10000 });
async function open(page: Page) {
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(
    page
      .getByRole("tab", { name: "Quote", exact: true })
      .or(page.getByRole("button", { name: /^Open Quote/ }))
      .first(),
  ).toBeVisible();
  return f;
}
function panel(page: Page) {
  return page.locator(
    ".editor-v2-panel:not(.sidebar-rail), dialog.tools-sheet[open]",
  );
}
async function shot(page: Page, name: string, width: number, theme: string) {
  if (!capture) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}-${width}-${theme}.png` });
  if (width === 1440)
    await panel(page).screenshot({
      path: `${shots}/${name}-panel-${theme}.png`,
    });
}
for (const width of [1440, 768, 375])
  for (const theme of ["light", "dark"] as const) {
    test(`Fields, Blocks, Styles and Send cards at ${width} ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(
        (mode) => localStorage.setItem("proposal-theme", mode),
        theme,
      );
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1700 : 1100,
      });
      await open(page);
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      for (const [tab, frame] of [
        ["Fields", "2b"],
        ["Blocks", "2c"],
        ["Styles", "2d"],
        ["Send", "2e"],
      ] as const) {
        if (tab === "Blocks") {
          const visibleTab = page
            .getByRole("tab", { name: "Blocks", exact: true })
            .filter({ visible: true });
          if (await visibleTab.count()) await visibleTab.click();
          else
            await page
              .getByRole("button", { name: "Open Blocks", exact: true })
              .click();
        } else await openEditorPanel(page, tab);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const surface = panel(page);
        await expect(
          surface.locator(".editor-panel-card").first(),
        ).toBeVisible();
        for (const summary of await surface
          .locator(".editor-panel-card > summary")
          .all()) {
          await expect(summary).toHaveAttribute("aria-expanded", /true|false/);
        }
        if (tab === "Fields") {
          const row = surface.getByRole("button", {
            name: /Client first name/,
          });
          await expect(row).toBeVisible();
          expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(52);
          await surface
            .getByRole("searchbox", { name: "Search fields" })
            .fill("email");
          const groups = surface.locator("details.editor-panel-card");
          for (const card of await groups.all())
            await expect(card).toHaveAttribute("open", "");
          await surface
            .getByRole("searchbox", { name: "Search fields" })
            .clear();
        }
        if (tab === "Styles") {
          const shared = surface.locator(".shared-bands-card");
          await expect(
            shared.getByRole("button", { name: "Edit header", exact: true }),
          ).toBeVisible();
          await expect(
            shared.getByRole("button", { name: "Edit footer", exact: true }),
          ).toBeVisible();
          await expect(
            surface.getByRole("button", {
              name: "Save to template",
              exact: true,
            }),
          ).toBeDisabled();
        }
        if (tab === "Send") {
          await expect(surface.locator(".send-readiness-card")).toHaveAttribute(
            "open",
            "",
          );
          await expect(surface.locator(".readiness-badge").first()).toHaveCSS(
            "border-radius",
            "0px",
          );
          await expect(
            surface.getByRole("button", { name: /^Send to / }),
          ).toBeDisabled();
        }
        const overflow = await surface.evaluate(
          (el) => el.scrollWidth > el.clientWidth + 1,
        );
        expect(overflow).toBe(false);
        const violations = (
          await new AxeBuilder({ page })
            .include(
              width < 1100
                ? "dialog.tools-sheet[open]"
                : ".editor-v2-panel:not(.sidebar-rail)",
            )
            .analyze()
        ).violations;
        expect(violations).toEqual([]);
        await surface
          .locator(".panel-card-title")
          .first()
          .dispatchEvent("pointerdown");
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        );
        await shot(page, frame, width, theme);
      }
    });
  }
for (const width of [1440, 375]) {
  test(`Save to template confirms, writes styles and shared bands, clears redundant draft overrides and supports Undo at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const f = await open(page);
    const template = (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.active().template_id,
    )!;
    await openEditorPanel(page, "Styles");
    const surface = panel(page);
    await surface
      .getByRole("spinbutton", { name: "Spacing below header", exact: true })
      .fill("31");
    await surface
      .getByRole("spinbutton", { name: "Spacing below header", exact: true })
      .blur();
    await expect
      .poll(() => f.active().header_footer?.headerSpacing.spaceToContent)
      .toBe(31);
    await expect(
      surface.getByRole("button", { name: "Save to template", exact: true }),
    ).toBeEnabled();
    await surface
      .getByRole("button", { name: "Save to template", exact: true })
      .scrollIntoViewIfNeeded();
    await shot(page, "save-to-template", width, "light");
    await surface
      .getByRole("button", { name: "Save to template", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Save styles to ${template.name}?`,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(dialog).toContainText("Existing proposals don't change.");
    if (capture)
      await page.screenshot({
        path: `${shots}/save-to-template-confirm-${width}-light.png`,
      });
    await dialog
      .getByRole("button", { name: "Save to template", exact: true })
      .click();
    const toast = page
      .getByRole("status")
      .filter({ hasText: "Styles saved to template" });
    await expect(toast).toBeVisible();
    const saved = (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === template.id,
    )!;
    expect(saved.header_footer?.headerSpacing.spaceToContent).toBe(31);
    expect(saved.content).toEqual(template.content);
    expect(saved.cover).toEqual(template.cover);
    expect(saved.default_items).toEqual(template.default_items);
    await expect.poll(() => f.active().style_overrides).toEqual({});
    await toast.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(async () =>
        (await f.repo.entities<Template>("templates")).find(
          (t) => t.id === template.id,
        ),
      )
      .toEqual(template);
  });
}
