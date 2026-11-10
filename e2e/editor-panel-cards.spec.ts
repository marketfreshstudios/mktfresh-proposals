import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Template } from "../src/lib/model";
import { editorFixture } from "./editor-fixture";
import { openEditorPanel } from "./editor-ui";
import { cssColorToken } from "./css-color-token";

test.use({ actionTimeout: 10000 });

const shots = "docs/screenshots/editor-panel-cards-quote";
const capture = process.env.CAPTURE_PANEL_CARDS === "1";

async function fixture(page: Page, template: boolean) {
  const group = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    quote: ([first, second]) => [
      {
        ...second,
        name: "Own It Over Time",
        order: 0,
        optional: true,
        default_selected: true,
        choice_group_id: group,
        sublines: [
          { ...first.sublines[0], id: crypto.randomUUID(), amount: 50000 },
          { ...second.sublines[0], amount: 17500 },
        ],
      },
      {
        ...first,
        name: "Own It Now",
        order: 1,
        description:
          "Design and build, paid upfront. The site is yours at launch.",
        optional: true,
        default_selected: false,
        choice_group_id: group,
        sublines: [{ ...first.sublines[0], amount: 275000 }],
      },
      {
        ...second,
        id: crypto.randomUUID(),
        name: "Care Standard",
        order: 2,
        optional: true,
        default_selected: true,
        choice_group_id: null,
        sublines: [
          { ...second.sublines[0], id: crypto.randomUUID(), amount: 8500 },
        ],
      },
    ],
  });
  const t = (await f.repo.entities<Template>("templates"))[0];
  if (template) {
    t.default_items = structuredClone(f.active().quote);
    await f.repo.put("templates", t);
  }
  await page.goto(
    template ? `/studio/templates/${t.id}` : `/proposals/${f.draft.id}`,
  );
  await expect(
    page
      .getByRole("tab", { name: "Quote", exact: true })
      .or(page.getByRole("button", { name: /^Open Quote\b/ }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await openEditorPanel(page, "Quote");
  return { ...f, templateId: t.id };
}

async function shot(page: Page, frame: string, width: number, theme: string) {
  if (!capture) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({
    path: `${shots}/${frame}-${width}-${theme}.png`,
    animations: "disabled",
  });
  if (width === 1440)
    await page.locator(".editor-v2-panel:not(.sidebar-rail)").screenshot({
      path: `${shots}/${frame}-panel-${theme}.png`,
      animations: "disabled",
    });
}

for (const template of [false, true]) {
  test(`${template ? "template" : "proposal"} Quote cards retain defaults, focus the added label, and keep one undo step`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1500 });
    const f = await fixture(page, template);
    const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
    await expect(panel).toHaveCSS("width", "380px");
    const body = panel.locator(".editor-tab-content");
    await expect(body).toHaveCSS(
      "background-color",
      await cssColorToken(body, "--surface-preview"),
    );
    const group = panel.locator(".editor-choice-group");
    await expect(group).toHaveCSS("border-radius", "14px");
    await expect(group.locator(".quote-choice-well")).toHaveCSS(
      "background-color",
      await cssColorToken(group, "--surface-sunken"),
    );
    const rows = panel.locator(".quote-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator(".quote-row-caption small")).toHaveText(
      "Default",
    );
    await expect(rows.nth(1).locator(".quote-row-caption small")).toHaveCount(
      0,
    );
    await expect(rows.nth(2).locator(".quote-row-caption small")).toHaveText(
      "Optional | Default",
    );
    await expect(rows.locator("input[type=radio]")).toHaveCount(0);
    await expect(panel).not.toContainText("Catalog");
    const toggle = rows.nth(1).locator(".quote-row-toggle");
    await toggle.press("Enter");
    const row = rows.nth(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      row.getByRole("radio", { name: "Make default selection" }),
    ).not.toBeChecked();
    await expect(row.getByText("Shown as the item price")).toHaveCount(0);
    await expect(row.locator(".quote-mapping-details").first()).toBeVisible();
    await expect(row.locator(".quote-item-footer")).not.toContainText(
      "Add sub-line",
    );
    if (!template) {
      await row.locator(".quote-price-heading").click();
      await shot(page, "2a", 1440, "light");
    }
    const before = template
      ? (await f.repo.entities<Template>("templates")).find(
          (t) => t.id === f.templateId,
        )!.default_items!
      : f.active().quote;
    const source = structuredClone(before);
    await row
      .getByRole("button", { name: "Add sub-line", exact: true })
      .click();
    const labels = row.getByRole("textbox", {
      name: "Sub-line label for Own It Now",
    });
    await expect(labels).toHaveCount(2);
    await expect(labels.last()).toBeFocused();
    await expect(
      row.getByText("Name these sub-lines so the client can tell them apart."),
    ).toBeVisible();
    const read = async () =>
      template
        ? (await f.repo.entities<Template>("templates")).find(
            (t) => t.id === f.templateId,
          )!.default_items!
        : f.active().quote;
    await expect.poll(async () => (await read())[1].sublines.length).toBe(2);
    const changed = await read();
    expect(changed[1].sublines[0]).toEqual(source[1].sublines[0]);
    expect(changed[1].sublines[1]).toMatchObject({
      amount: 0,
      interval: "one_time",
      qty: 1,
    });
    for (const n of [0, 2]) expect(changed[n]).toEqual(source[n]);
    if (!template) await shot(page, "2a2", 1440, "light");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(async () => (await read())[1].sublines)
      .toEqual(source[1].sublines);
    await row.getByRole("radio", { name: "Make default selection" }).check();
    await expect
      .poll(async () => (await read()).map((i) => i.default_selected))
      .toEqual([false, true, true]);
    await row.getByRole("button", { name: "Done editing quote line" }).click();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(row.locator(".quote-row-caption small")).toHaveText("Default");
  });
}

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"]) {
    test(`Quote cards fit with readable controls and keyboard disclosures at ${width} ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(
        (mode) => localStorage.setItem("proposal-theme", mode),
        theme,
      );
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1500 : 1000,
      });
      await fixture(page, false);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const panel = page.locator(
        width === 1440
          ? ".editor-v2-panel:not(.sidebar-rail)"
          : "dialog.tools-sheet[open]",
      );
      const row = panel.locator(".quote-row").nth(1);
      await row.locator(".quote-row-toggle").click();
      const amount = row.getByRole("spinbutton", { name: /^Amount/ }).first();
      await amount.fill("999999.99");
      expect(
        await amount.evaluate((input) => input.scrollWidth - input.clientWidth),
      ).toBeLessThanOrEqual(0);
      await amount.fill("2750");
      const interval = row.getByRole("combobox", { name: /^Interval/ }).first();
      await expect(interval).toHaveCSS("width", "116px");
      expect(
        await panel.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await row
        .getByRole("button", { name: "Add sub-line", exact: true })
        .click();
      await expect(
        row.getByRole("textbox", { name: /^Sub-line label/ }).last(),
      ).toBeFocused();
      await row.locator(".quote-row-toggle").scrollIntoViewIfNeeded();
      await shot(page, "2a2", width, theme);
      const mapping = row
        .locator(".quote-mapping-details")
        .first()
        .locator("summary");
      await mapping.focus();
      await page.keyboard.press("Enter");
      await expect(
        row.getByRole("textbox", { name: "Stripe lookup key" }).first(),
      ).toBeVisible();
      await page.keyboard.press("Enter");
      const violations = (
        await new AxeBuilder({ page })
          .include(
            width === 1440 ? ".editor-v2-panel" : "dialog.tools-sheet[open]",
          )
          .analyze()
      ).violations;
      expect(violations).toEqual([]);
      expect(await panel.innerText()).not.toContain("·");
    });
  }
}
