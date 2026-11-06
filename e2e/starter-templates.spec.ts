import { starterLogo } from "../tests/starter-logo";
import { authoringPreview } from "../src/lib/authoring-preview";
import { pdfPreview } from "../src/lib/pdf-preview";
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { starterTemplates } from "../seed/starter-templates";
import type { Item } from "../src/lib/model";
const shots = "docs/screenshots/starter-templates";
async function fixture(
  page: import("@playwright/test").Page,
  withState = false,
) {
  const f = await editorFixture(page);
  const logo = await starterLogo();
  f.settings.owner = "Alex Morgan";
  if (withState)
    f.settings.business_state = { name: "North Carolina", other: "" };
  f.settings.logo = `${f.repo.workspaceId}/logo.png`;
  await f.repo.put("workspace_settings", f.settings);
  await page.route("**/api/workspace-logo**", (route) =>
    route.fulfill({ body: logo, contentType: "image/png" }),
  );
  await page.route("**/api/document-preview", async (route) => {
    const p = authoringPreview(
      route.request().postDataJSON(),
      f.settings,
      f.repo.workspaceId,
    );
    const result = await pdfPreview(
      f.repo,
      { get: async () => logo, put: async () => {} },
      p,
      f.settings,
    );
    await route.fulfill({ json: result });
  });
  const templates = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog: await f.repo.entities<Item>("pricing_items"),
  });
  const old = (await f.repo.entities<any>("templates"))[0];
  await f.repo.put("templates", {
    ...old,
    name: "Website proposal sample (old)",
    active: false,
  });
  for (const t of templates) await f.repo.put("templates", t);
  let settings = { ...f.settings };
  await page.route("**/api/workspace_settings", async (route) => {
    if (route.request().method() === "POST") {
      settings = route.request().postDataJSON();
      await f.repo.put("workspace_settings", settings);
    }
    await route.fulfill({
      json: route.request().method() === "POST" ? settings : [settings],
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { ...f, logo, templates, getSettings: () => settings };
}
test("starter descriptions, order, approved covers and Terms remain editable in existing template editor", async ({
  page,
}) => {
  const f = await fixture(page, true);
  mkdirSync(shots, { recursive: true });
  await page.goto("/studio/templates");
  await expect(page.locator(".studio-template-card")).toHaveCount(7);
  expect(
    await page.locator(".studio-template-card strong").allTextContents(),
  ).toContain("General project proposal");
  await expect(
    page.getByText(
      "Starter terms are a starting point, not legal advice. Have an attorney review them before you use them.",
    ),
  ).toBeVisible();
  const names = await page
    .locator(".studio-template-card > div:last-child > strong")
    .allTextContents();
  expect(names.slice(0, 6)).toEqual(f.templates.map((t) => t.name));
  await page.screenshot({
    path: `${shots}/templates-1440.png`,
    fullPage: true,
  });
  for (const number of [1, 0]) {
    const t = f.templates[number];
    await page.goto(`/studio/templates/${t.id}`);
    await expect(
      page.locator(".template-paged-paper .page-sheet").nth(1),
    ).toBeVisible();
    await expect(page.locator(".template-paged-paper")).toContainText(
      number === 1 ? "A new website for" : "Proposal title",
    );
    await expect(
      page.locator(".template-paged-paper .editor-page-sheets"),
    ).toHaveAttribute("data-layout-settled", "true");
    await expect(
      page.locator(".template-paged-paper .cover-logo img"),
    ).toBeVisible();
    await page.screenshot({
      path: `${shots}/template-${number === 1 ? 1 : 6}-cover-1440.png`,
    });
    await page
      .locator(".template-paged-paper .page-sheet")
      .nth(1)
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${shots}/template-${number === 1 ? 1 : 6}-content-1440.png`,
    });
  }
  await page.goto(`/studio/templates/${f.templates[2].id}`);
  await page
    .locator(".template-paged-paper")
    .getByRole("heading", { name: "Terms", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/template-2-terms-1440.png` });
});
test("Business state autosaves, is available as a field, and readiness links to missing state and names bracketed sections", async ({
  page,
}) => {
  test.setTimeout(30000);
  const f = await fixture(page);
  await page.goto("/studio/workspace?view=brand#workspace-business-state");
  await page
    .getByRole("combobox", { name: "Business state", exact: true })
    .selectOption("North Carolina");
  await expect
    .poll(() => f.getSettings().business_state?.name)
    .toBe("North Carolina");
  await page.screenshot({
    path: `${shots}/business-state-1440.png`,
    fullPage: true,
  });
  delete f.getSettings().business_state;
  await f.repo.put("workspace_settings", f.getSettings());
  const active = (await f.repo.get(f.draft.id))!;
  // This fixture begins with the authored placeholder and an empty workspace state.
  const changed = await f.service.edit(
    active.id,
    {
      revision: active.revision,
      content: [
        { id: crypto.randomUUID(), type: "page_break" },
        { id: crypto.randomUUID(), type: "heading", text: "Overview" },
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          text: "[Describe the outcome] {{workspace.state}}",
        },
        ...active.content.filter(
          (b) => b.type !== "heading" && b.type !== "paragraph",
        ),
        { id: crypto.randomUUID(), type: "signature_block", role: "company" },
      ],
    },
    (await import("../tests/helpers")).staff,
  );
  await page.unroute("**/api/proposals/**");
  await page.route("**/api/proposals/**", (route) =>
    route.request().url().endsWith("/preview-logo")
      ? route.fulfill({ body: f.logo, contentType: "image/png" })
      : route.fulfill({ json: changed }),
  );
  await page.goto(`/proposals/${changed.id}/edit`);
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(page.getByText("Business state", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Add business state", { exact: true }),
  ).toHaveAttribute(
    "href",
    "/studio/workspace?view=brand#workspace-business-state",
  );
  await expect(
    page.getByText(/Replace bracketed guidance in: Overview/),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Overview", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/readiness-1440.png` });
});
