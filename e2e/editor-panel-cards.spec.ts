import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Item, Template } from "../src/lib/model";
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
  const product = (await f.repo.entities<Item>("pricing_items")).find(
    (item) => item.id === f.active().quote[1].pricing_item_id,
  )!;
  await f.repo.put("pricing_items", {
    ...product,
    display_name: "Website build",
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
    const handle = (await panel
      .getByRole("button", { name: "Drag choice group", exact: true })
      .boundingBox())!;
    const title = (await group
      .getByRole("heading", { name: "Choose one" })
      .boundingBox())!;
    expect(handle.x + handle.width).toBeLessThanOrEqual(title.x);
    expect(
      Math.abs(handle.y + handle.height / 2 - title.y - title.height / 2),
    ).toBeLessThanOrEqual(2);
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
    const display = row.locator(".currency-input-display");
    const amount = row.getByRole("spinbutton", { name: "Amount Own It Now" });
    await expect(display).toHaveText("$2,750.00");
    await expect(display).toBeVisible();
    const amountBox = (await amount.boundingBox())!;
    const fieldBox = (await row.locator(".currency-input").boundingBox())!;
    expect(amountBox.width).toBe(fieldBox.width);
    await amount.click();
    await expect(amount).toHaveValue("2750");
    await expect(display).toBeHidden();
    await amount.blur();
    await expect(display).toBeVisible();
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
    await expect(labels.first()).toHaveValue("Website build");
    await expect(labels.last()).toHaveAttribute(
      "placeholder",
      "Sub-line 2 | One-time",
    );
    await expect(labels.last()).toBeFocused();
    await expect(
      row.getByText("Name these sub-lines so the client can tell them apart."),
    ).toBeVisible();
    await expect(
      row.locator(".subline-warning + .button-wrap .quote-add-subline"),
    ).toBeVisible();
    const read = async () =>
      template
        ? (await f.repo.entities<Template>("templates")).find(
            (t) => t.id === f.templateId,
          )!.default_items!
        : f.active().quote;
    await expect.poll(async () => (await read())[1].sublines.length).toBe(2);
    const changed = await read();
    expect(changed[1].sublines[0]).toEqual({
      ...source[1].sublines[0],
      label: "Website build",
    });
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
      await amount.blur();
      const formatted = row.locator(".currency-input-display").first();
      await expect(formatted).toHaveText("$999,999.99");
      expect(
        await formatted.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(0);
      await amount.fill("2750");
      await amount.blur();
      await expect(formatted).toHaveText("$2,750.00");
      expect(
        await formatted.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(0);
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

// Preserve the owner-approved #154 header while moving the primary into Send.
test("Review & send yields its clay primary to the open Send card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await fixture(page, false);
  const header = page.locator(".editor-document-header");
  const action = header.getByRole("button", {
    name: "Review & send",
    exact: true,
  });
  await expect(action).toHaveClass(/action/);
  await action.click();
  await expect(action).not.toHaveClass(/action/);
  await expect(page.locator(".send-action-card .action")).toBeVisible();
  await openEditorPanel(page, "Quote");
  await expect(action).toHaveClass(/action/);
});
