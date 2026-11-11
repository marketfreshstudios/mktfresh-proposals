import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Audit, Template } from "../src/lib/model";

test.use({ actionTimeout: 10000 });
test("a concurrent style save reloads the proposal and requires another confirmation without retrying the write", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await editorFixture(page);
  const template = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.active().template_id,
  )!;
  let writes = 0;
  await page.route(
    `**/api/proposals/${f.draft.id}/template-styles`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      writes++;
      await f.repo.put("templates", {
        ...template,
        name: `${template.name} (reviewed)`,
      });
      await f.editRemote({ style_overrides: { body: { size: 18 } } });
      await route.fulfill({
        status: 409,
        json: {
          error:
            "409: The template or proposal changed. Reload and review the changes again before saving.",
        },
      });
    },
  );
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Spacing below header", exact: true })
    .fill("31");
  const save = page.getByRole("button", {
    name: "Save to template",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await save.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save to template", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "template or proposal changed" }),
  ).toBeVisible();
  await page.getByText("Text styles", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Text level", exact: true })
    .selectOption("body");
  await expect(
    page.getByRole("spinbutton", { name: "Body size (px)", exact: true }),
  ).toHaveValue("18");
  expect(writes).toBe(1);
  expect(
    (await f.repo.entities<Audit>("workspace_events")).filter(
      (e) => e.type === "template_styles_saved_from_proposal",
    ),
  ).toHaveLength(0);
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === template.id,
    )?.style_overrides,
  ).toEqual(template.style_overrides);
  await save.click();
  const confirmation = page.getByRole("dialog", {
    name: `Save styles to ${template.name} (reviewed)?`,
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("Body: size");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(writes).toBe(1);
});
