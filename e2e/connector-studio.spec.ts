import { connectAssistant } from "./mcp-client";
import { test, expect, type Page } from "@playwright/test";
test.use({ actionTimeout: 10000 });
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { editorFixture } from "./editor-fixture";
import { staff, setup } from "../tests/helpers";
import {
  writeStudioEntity,
  studioRevision,
  studioEntityViews,
  connectorActivityViews,
  restoreConnectorChange,
} from "../src/lib/studio-history";
import { activity } from "../src/lib/studio";
import {
  libraryTemplates,
  TemplateInputSchema,
} from "../src/lib/template-library";
import type { Template } from "../src/lib/model";
async function fixture(page: Page) {
  const f = await editorFixture(page);
  const before = (await f.repo.entities<Template>("templates"))[0];
  const template = await writeStudioEntity(
    f.repo,
    "templates",
    before,
    {
      ...before,
      name: "Our case studies",
      signature_heading_defaulted: true,
      connector_created: true,
      active: false,
    },
    {
      actor: "ai:Claude",
      workspace_id: f.repo.workspaceId,
      on_behalf_of_user_id: staff.actor.slice(6),
      on_behalf_of_name: staff.staff_name,
      ip: "",
      user_agent: "MCP",
    },
    {
      connector: true,
      type: "connector_template_updated",
      revision: studioRevision(before),
    },
  );
  const proposals = await f.repo.list();
  await page.route("**/api/templates**", async (r) => {
    try {
      if (r.request().method() === "GET")
        return r.fulfill({
          json: await studioEntityViews(
            f.repo,
            "templates",
            await libraryTemplates(
              f.repo,
              await f.repo.entities<Template>("templates"),
            ),
            staff,
          ),
        });
      const input = r.request().postDataJSON(),
        before =
          (await f.repo.entities<Template>("templates")).find(
            (t) => t.id === input.id,
          ) ?? null;
      return r.fulfill({
        json: await writeStudioEntity(
          f.repo,
          "templates",
          before,
          TemplateInputSchema.parse(input),
          staff,
          { revision: input.expected_revision },
        ),
      });
    } catch (e) {
      return r.fulfill({
        status: (e as any).status ?? 400,
        json: { error: (e as Error).message },
      });
    }
  });
  await page.route("**/api/workspace_events**", async (r) =>
    r.fulfill({
      json: await connectorActivityViews(f.repo, await activity(f.repo), staff),
    }),
  );
  await page.route("**/api/studio-history/*/restore", async (r) => {
    try {
      return r.fulfill({
        json: await restoreConnectorChange(
          f.repo,
          new URL(r.request().url()).pathname.split("/")[3],
          staff,
        ),
      });
    } catch (e) {
      return r.fulfill({
        status: (e as any).status ?? 400,
        json: { error: (e as Error).message },
      });
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { ...f, before, template, proposals };
}
async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_CONNECTOR_STUDIO) {
    await mkdir("docs/screenshots/connector-studio", { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/connector-studio/${name}.png`,
    });
  }
}
test("Claude-created cards and template actions expose the guarded Restore", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/studio/templates");
  await expect(
    page.getByText("Created by Claude — not yet available", { exact: true }),
  ).toBeVisible();
  await shot(page, "template-card-1440");
  await page
    .getByRole("button", {
      name: `Actions for ${f.template.name}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("menuitem", {
      name: "Restore previous version",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/studio/templates/${f.template.id}`);
  await page
    .getByRole("button", { name: "More editor actions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore previous version", exact: true }),
  ).toBeVisible();
  await shot(page, "template-restore-1440");
  await page
    .getByRole("button", { name: "Restore previous version", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Restore previous version?",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Restore previous version", exact: true })
    .click();
  await expect(
    page.getByText("Previous version restored", { exact: true }),
  ).toBeVisible();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.template.id,
    )?.name,
  ).toBe(f.before.name);
  expect(await f.repo.list()).toEqual(f.proposals);
});
test("Activity names the staff editor and offers Restore with a confirmation", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/studio/activity");
  const row = page.locator(".activity-row-v3").filter({
    hasText: `Claude updated Our case studies (on behalf of ${staff.staff_name})`,
  });
  await expect(row).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Restore previous version", exact: true }),
  ).toBeVisible();
  await shot(page, "activity-restore-1440");
  await row
    .getByRole("button", { name: "Restore previous version", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Restore previous version?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.template.id,
    )?.name,
  ).toBe("Our case studies");
});
test("consent explains the new template permission without approving it silently", async ({
  page,
  request,
}) => {
  const registered = await request.post("/oauth/register", {
    data: {
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    },
  });
  expect(registered.ok()).toBe(true);
  const client = await registered.json();
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update("a".repeat(43))
      .digest("base64url"),
    resource: "http://127.0.0.1:3100/mcp",
    scope: "proposals:read proposals:draft templates:edit",
    state: "fixture",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/oauth/authorize?${params}`);
  await expect(
    page.getByText(
      "Create and edit templates and saved blocks; nothing is sent",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow access" }),
  ).toBeVisible();
  await shot(page, "consent-1440");
});

test("OAuth MCP creates a hidden template and reads/edits saved copy without touching proposals", async ({
  request,
}) => {
  const headers = { Authorization: "Bearer e2e-staff-secret-only" };
  const settings = await (
    await request.get("/api/workspace_settings", { headers })
  ).json();
  if (!settings.length) {
    const seed = await setup();
    const saved = await request.post("/api/workspace_settings", {
      headers,
      data: { ...seed.settings, company_signatory: null },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
  }
  const before = await (
    await request.get("/api/proposals", { headers })
  ).json();
  const call = await connectAssistant(
    request,
    headers,
    "proposals:read proposals:draft templates:edit",
  );
  const template = await call("create_template", {
    name: "Connector integration template",
    content: "# Case studies\n\nOur work for {{client.company}}.",
  });
  expect(template.available_for_new_proposals).toBe(false);
  const read = await call("get_template", {
    template_id: template.template_id,
  });
  expect(read.active).toBe(false);
  expect(read.revision).toBe(template.revision);
  const copy = await call("duplicate_template", {
    template_id: template.template_id,
    name: "Connector integration copy",
  });
  expect(copy.available_for_new_proposals).toBe(false);
  const block = await call("create_saved_block", {
    name: "Connector integration block",
    type: "text",
    content: "A **case study** for {{client.company}}.",
  });
  const loaded = await call("get_saved_block", {
    saved_block_id: block.saved_block_id,
  });
  expect(loaded.content).toBe("A **case study** for {{client.company}}.");
  const edited = await call("update_saved_block", {
    saved_block_id: block.saved_block_id,
    revision: loaded.revision,
    content: "Our **updated** case study.",
  });
  expect(edited.revision).not.toBe(loaded.revision);
  expect(
    (await call("get_saved_block", { saved_block_id: block.saved_block_id }))
      .content,
  ).toContain("updated");
  expect(
    (await call("list_saved_blocks", {})).some(
      (b: any) => b.saved_block_id === block.saved_block_id,
    ),
  ).toBe(true);
  expect(
    await (await request.get("/api/proposals", { headers })).json(),
  ).toEqual(before);
});
