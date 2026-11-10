import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { starterTemplates } from "../seed/starter-templates";
import type { Proposal, Template } from "../src/lib/model";
import { setup } from "../tests/helpers";
import { editorFixture } from "./editor-fixture";

const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const evidence = "docs/screenshots/template-covers";

test("all seven starter covers open with their designed layout and existing text", async ({
  page,
}) => {
  const f = await editorFixture(page);
  Object.assign(f.settings, {
    company_name: "MarketFresh",
    accent_colour: "#d04522",
    brand_palette: ["#74ccdb"],
    proposal_fonts: { body: "dm-sans", heading: "montserrat" },
  });
  await f.repo.put("workspace_settings", f.settings);
  const starters = starterTemplates(f.repo.workspaceId, { marketfresh: true });
  for (const template of starters) await f.repo.put("templates", template);
  await page.setViewportSize({ width: 1440, height: 1260 });
  for (const template of starters) {
    await page.goto(`/studio/templates/${template.id}`);
    const cover = page.locator(".document-cover:visible").first();
    await expect(cover).toHaveAttribute(
      "data-cover-layout",
      template.cover!.layout!,
    );
    await expect(cover.getByRole("heading").first()).toBeVisible();
    await expect(
      cover.getByText("Prepared for", { exact: true }),
    ).toBeVisible();
    if (process.env.CAPTURE_STARTER_COVERS === "1") {
      await mkdir(evidence, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${evidence}/${template.starter_key}-1440.png`,
      });
    }
  }
});

test("super admin confirms deletion of an inactive ordinary template and its proposal still opens", async ({
  page,
  request,
}) => {
  const f = await setup();
  const previous = (await f.repo.entities<Template>("templates"))[0];
  const template = {
    ...previous,
    id: crypto.randomUUID(),
    name: "Website proposal sample (old)",
    active: true,
  };
  const clientId = crypto.randomUUID();
  async function post(path: string, data: unknown) {
    const response = await request.post("/api/" + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  await post("workspace_settings", f.settings);
  await post("clients", {
    ...f.draft.client,
    id: clientId,
    email: `template-delete-${clientId}@example.test`,
  });
  await post("templates", template);
  const proposal: Proposal = await post("proposals", {
    template_id: template.id,
    client_id: clientId,
    title: "A proposal with its own template copy",
  });
  await post("templates", { ...template, active: false });
  await page.goto("/studio/templates");
  const menu = page.getByRole("button", {
    name: `Actions for ${template.name}`,
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: `Delete “${template.name}”?`,
  });
  async function askToDelete() {
    await menu.click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(dialog).toBeVisible();
  }
  await askToDelete();
  await expect(dialog).toContainText(
    "Proposals already created from this template keep their own copy and are unaffected.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(menu).toBeVisible();
  await askToDelete();
  await dialog.getByRole("button", { name: "Delete template" }).click();
  await expect(menu).toHaveCount(0);

  const response = await request.get(`/api/proposals/${proposal.id}`, {
    headers,
  });
  expect(response.ok(), await response.text()).toBe(true);
  expect(await response.json()).toMatchObject({
    id: proposal.id,
    template_id: template.id,
    content: proposal.content,
  });
  await page.goto(`/proposals/${proposal.id}?view=record`);
  await expect(
    page.getByRole("heading", { name: proposal.title, exact: true }),
  ).toBeVisible();
});
