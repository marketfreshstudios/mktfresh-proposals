import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { emailEditorFixture } from "./email-editor-fixture";
import { editorFixture } from "./editor-fixture";
import { openEditorPanel, openQuoteRow } from "./editor-ui";
const dir = "docs/screenshots/pill-controls";
async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_CONTROLS) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${name}-${process.env.CAPTURE_CONTROLS}.png`,
      animations: "disabled",
    });
  }
}
test("shared controls across Workspace and quote panels", async ({ page }) => {
  await emailEditorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=billing");
  await expect(
    page.getByRole("combobox", { name: "Payment methods", exact: true }),
  ).toBeVisible();
  const workspaceNav = page.getByRole("navigation", {
    name: "Workspace sections",
    exact: true,
  });
  const activeSection = workspaceNav.locator('button[aria-current="page"]');
  await expect(activeSection).toHaveText("Billing defaults");
  await expect(activeSection).toHaveCSS("border-radius", "0px");
  await expect(activeSection).toHaveCSS("border-left-width", "2px");
  await expect(activeSection).not.toHaveCSS(
    "border-left-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Studio navigation", exact: true })
      .locator('a[aria-current="page"]'),
  ).toHaveCSS("border-radius", "10px");
  const metrics = (el: Element) => {
    const s = getComputedStyle(el);
    return {
      family: s.fontFamily,
      size: s.fontSize,
      weight: s.fontWeight,
      height: s.height,
      left: s.paddingLeft,
      radius: s.borderRadius,
      border: s.borderTopWidth,
    };
  };
  const selectMetrics = await page
    .getByRole("combobox", { name: "Payment methods", exact: true })
    .evaluate(metrics);
  await shot(page, "billing-1440");
  await page.goto("/studio/workspace?view=email-sending");
  await expect(
    page.getByRole("heading", { name: "Email sending", exact: true }),
  ).toBeVisible();
  const inputMetrics = await page
    .getByRole("textbox", { name: "Verified sending domain", exact: true })
    .evaluate(metrics);
  expect(selectMetrics).toEqual(inputMetrics);
  await shot(page, "workspace-fields-1440");
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(activeSection).toHaveCSS("border-radius", "10px");
  await expect(
    page
      .getByRole("navigation", { name: "Studio areas", exact: true })
      .locator('a[aria-current="page"]'),
  ).toHaveCSS("border-radius", "10px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  await openEditorPanel(page, "Quote");
  await openQuoteRow(page, 0);
  await expect(
    page.getByRole("button", { name: "Review & send", exact: true }),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(
    page.getByRole("button", { name: "Preview PDF", exact: true }),
  ).toHaveCSS("border-top-width", "1px");
  await expect(
    page.getByRole("button", { name: "Preview PDF", exact: true }),
  ).toHaveCSS("height", "36px");
  await shot(page, "quote-optional-1440");
});
test("template header menu anchors to its trigger", async ({ page }) => {
  const f = await editorFixture(page);
  const t = (await f.repo.entities<any>("templates"))[0];
  t.starter_key = "website";
  await f.repo.put("templates", t);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${t.id}`);
  const trigger = page.getByRole("button", {
    name: "More editor actions",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("dialog", { name: "Template actions" }),
  ).toBeVisible();
  await shot(page, "template-menu-1440");
  if (process.env.CAPTURE_CONTROLS !== "before") {
    const menu = (await page
        .locator(".studio-template-actions")
        .boundingBox())!,
      button = (await trigger.boundingBox())!;
    expect(menu.width).toBeLessThan(350);
    expect(
      Math.abs(menu.x + menu.width - button.x - button.width),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(menu.y - button.y - button.height - 4)).toBeLessThanOrEqual(
      1,
    );
  }
});

const buttonShapeExclusions = [
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  "nav button",
  ".studio-sidebar button",
  ".studio-tablet-chips button",
  ".workspace-section-list button",
  ".studio-segments button",
  ".studio-filter-chips button",
  ".editor-tabs button",
  ".editor-phone-dock button",
  ".bottom-tabs button",
  ".editor-outline button",
  ".sidebar-rail button",
  ".sidebar-arrow",
  ".phone-header-back",
  ".editor-v2-back",
  ".band-phone-header > button:first-child",
  ".editor-header-identity > .button-wrap button",
  ".style-density button",
  ".style-colors button",
  ".band-height button",
  '.style-preview-heading [role="group"] button',
  ".email-canvas-toolbar button",
  ".quote-row-toggle",
  ".field-option",
  ".block-menu-options button",
  ".layout-menu button",
  ".band-fields-menu button",
  '.toolbar-popover [role="menu"] button',
  '.toolbar-popover [role="listbox"] button',
  ".cover-logo-menu button",
  ".action-menu button",
  ".starter-actions-menu button",
  ".phone-section-list > button:not(.btn)",
  ".drag-handle",
  '[aria-roledescription="sortable"]',
  ".image-resize-handle",
  ".image-resize-grip",
  ".band-own-pages button",
  ".studio-account-trigger",
  ".color-picker-trigger",
  ".client-choice-target",
  ".preview-size.segmented button",
].join(",");
async function audit(page: Page) {
  const controls = await page
    .locator('select:visible, input[role="switch"]:visible')
    .evaluateAll((els) =>
      els.map((el) => {
        const css = getComputedStyle(el),
          input = el as HTMLInputElement;
        return {
          name: el.getAttribute("aria-label") ?? input.name,
          tag: el.tagName,
          shared: el.classList.contains(
            el.tagName === "SELECT" ? "shared-select" : "shared-switch",
          ),
          left: parseFloat(css.paddingLeft),
          right: parseFloat(css.paddingRight),
          checked: el.getAttribute("aria-checked"),
          value: input.checked,
          box: el.getBoundingClientRect().toJSON(),
          before: getComputedStyle(el, "::before").height,
          after: getComputedStyle(el, "::after").height,
        };
      }),
    );
  for (const c of controls) {
    expect(c.shared, JSON.stringify(c)).toBe(true);
    expect(c.left, JSON.stringify(c)).toBeGreaterThan(0);
    expect(c.right).toBeGreaterThan(0);
    if (c.tag === "INPUT") {
      expect(c.checked).toBe(String(c.value));
      expect(c.box.height).toBeGreaterThanOrEqual(44);
      expect(parseFloat(c.before) - parseFloat(c.after)).toBe(6);
    }
  }
  const square = await page
    .locator("button:visible,a.btn:visible,a.email-cta:visible")
    .evaluateAll(
      (els, exclusions) =>
        els
          .filter((el) => !el.matches(exclusions))
          .map((el) => {
            const box = el.getBoundingClientRect(),
              style = getComputedStyle(el),
              raw = style.borderTopLeftRadius;
            const radius = raw.endsWith("%")
              ? (parseFloat(raw) * Math.min(box.width, box.height)) / 100
              : parseFloat(raw);
            return {
              name:
                el.getAttribute("aria-label") ??
                el.textContent?.trim().slice(0, 60),
              class: el.className,
              radius,
              width: box.width,
              height: box.height,
              roundIcon: el.matches(".icon-only, .round-icon"),
            };
          })
          .filter(
            (b) =>
              b.radius < Math.min(b.width, b.height) / 2 - 1 ||
              (b.roundIcon && b.width !== b.height),
          ),
      buttonShapeExclusions,
    );
  expect.soft(square, page.url()).toEqual([]);
}
for (const width of [1440, 375])
  test(`action and form-control audit at ${width}`, async ({ page }) => {
    const f = await emailEditorFixture(page);
    await page.setViewportSize({ width, height: 1000 });
    for (const view of [
      "billing",
      "brand",
      "email-sending",
      "styles",
      "client-links",
      "team",
    ]) {
      await page.goto(`/studio/workspace?view=${view}`);
      await expect(page.locator(".workspace-section-card")).toBeVisible();
      if (width === 375) {
        await expect(
          page.locator('.workspace-section-list button[aria-current="page"]'),
        ).toHaveCSS("border-radius", "10px");
        await expect(page.locator(".bottom-tabs a.active")).toHaveCSS(
          "border-radius",
          "10px",
        );
      }
      await audit(page);
    }
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(
      page.getByRole("button", { name: "More editor actions", exact: true }),
    ).toBeVisible();
    if (width === 1440) {
      const sections = page.getByRole("navigation", {
        name: "Sections",
        exact: true,
      });
      const row = sections.getByRole("button", {
        name: "First section",
        exact: true,
      });
      await row.click();
      await expect(row).toHaveAttribute("aria-current", "location");
      await expect(row).toHaveCSS("border-radius", "0px 6px 6px 0px");
      await expect(row).toHaveCSS("border-left-width", "2px");
      await expect(row).not.toHaveCSS("border-left-color", "rgba(0, 0, 0, 0)");
    }
    await openQuoteRow(page, 0);
    await expect(
      page
        .getByRole("tab", { name: "Quote", exact: true })
        .filter({ visible: true }),
    ).toHaveCSS("border-radius", "10px");
    await audit(page);
    const optional = page.getByRole("switch", {
      name: "Optional",
      exact: true,
    });
    await optional.check();
    await expect(optional).toBeChecked();
    await audit(page);
    await optional.uncheck();
    for (const tab of ["Styles", "Fields", "Send"] as const) {
      await openEditorPanel(page, tab);
      await expect(
        page
          .getByRole("tab", { name: tab, exact: true })
          .filter({ visible: true }),
      ).toHaveAttribute("aria-selected", "true");
      await audit(page);
    }
  });

test("Reload, email actions, client actions and error pages use the shared button radius", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const running = await (await page.request.get("/api/staff-build")).json();
  let build = running.buildId;
  await page.route("**/api/staff-build", (r) =>
    r.fulfill({ json: { buildId: build } }),
  );
  await page.goto("/");
  build = "next-deployment";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const notice = page.locator(".deployment-notice");
  await expect(notice).toBeVisible();
  await audit(page);
  await shot(page, "reload-1440");
  await notice.getByRole("button", { name: "Later", exact: true }).click();
  await page.goto("/studio/emails/proposal_sent");
  await expect(
    page.getByRole("textbox", { name: "Subject", exact: true }),
  ).toBeVisible();
  await audit(page);
  await page.getByRole("textbox", { name: "Email body", exact: true }).click();
  await audit(page);
  await shot(page, "email-toolbar-1440");
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  await page
    .locator(`[data-block-id="block-${f.content[1].id}"] .tiptap`)
    .click();
  await audit(page);
  await shot(page, "editor-toolbar-1440");
  await page.goto("/studio/workspace?view=brand");
  await audit(page);
  await shot(page, "studio-1440");
});

for (const width of [1440, 375])
  test(`client and error-page action shapes at ${width}`, async ({ page }) => {
    const f = await emailEditorFixture(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/p/${f.draft.id}?preview=1`);
    await expect(page.locator(".client-flow")).toBeVisible();
    const previewWidth = page.getByRole("group", { name: "Preview width" });
    for (const label of ["Desktop width", "Phone width"])
      await expect(
        previewWidth.getByRole("button", { name: label, exact: true }),
      ).toHaveCSS("border-radius", "10px");
    await audit(page);
    await page
      .getByRole("button", { name: "Review and sign", exact: true })
      .click();
    for (const label of ["Draw", "Type"])
      await expect(
        page.getByRole("tab", { name: label, exact: true }),
      ).toHaveCSS("border-radius", "8px");
    await audit(page);
    await page.goto("/this-page-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
    await audit(page);
  });
