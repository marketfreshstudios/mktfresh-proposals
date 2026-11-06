import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { teamFixture } from "../tests/fixtures/team";
import { ReassignmentService } from "../src/lib/reassignment";
import { AppError } from "../src/lib/model";
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
});
const shots = "docs/screenshots/proposal-reassignment";
async function capture(page: Page, name: string) {
  if (process.env.REASSIGN_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}.png` });
  }
}
async function fixture(page: Page) {
  const f = await teamFixture();
  let actor = f.admin;
  const sent = await f.service.send(f.draft.id, f.admin);
  const draft = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Spring launch",
    },
    f.member,
  );
  const second = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Summer campaign",
    },
    f.member,
  );
  const service = new ReassignmentService(f.repo, async () => f.team.list());
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    let value: unknown = [];
    try {
      if (parts[0] === "auth" && parts[1] === "session")
        value = {
          user: actor,
          staff: await f.team.list(),
          settings: f.settings,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "team") {
        if (parts[1] === "reassign")
          value = await service.reassign(actor, req.postDataJSON());
        else if (parts[2] === "proposals")
          value = await service.work(actor, parts[1]);
        else if (req.method() === "GET")
          value = {
            members: await f.team.list(),
            recent: await f.store.audit(),
          };
        else value = await f.team.change(actor, parts[1], req.postDataJSON());
      } else if (parts[0] === "proposals") {
        if (!parts[1])
          value = {
            items: await f.repo.list(),
            total: (await f.repo.list()).length,
          };
        else if (parts[2] === "reassign") {
          const input = req.postDataJSON();
          const result = await service.reassign(actor, {
            user_id: input.user_id,
            notify: input.notify,
            proposals: [{ id: parts[1], revision: input.revision }],
          });
          value = result[0];
        } else if (parts[2] === "ready")
          value = await f.service.checkReady((await f.repo.get(parts[1]))!);
        else if (parts[2] === "emails") value = [];
        else value = await f.repo.get(parts[1]);
      } else if (parts[0] === "connections")
        value = { stripe: false, qbo: false, email: true, mock: true };
      else if (
        ["clients", "pricing_items", "templates", "content_library"].includes(
          parts[0],
        )
      )
        value = await f.repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({
        status: e instanceof AppError ? e.status : 400,
        json: {
          error: (e as Error).message,
          ...((e as any).proposals
            ? { unfinished_proposals: (e as any).proposals }
            : {}),
        },
      });
    }
  });
  return {
    ...f,
    sent,
    draft,
    second,
    setActor: (a: typeof actor) => {
      actor = a;
    },
  };
}
test("record reassignment changes live sender without publishing, and Owner filter follows it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page);
  // The record for a sent proposal keeps its existing menu and frozen evidence.
  await page.goto(`/proposals/${f.sent.id}`);
  await page
    .getByRole("button", { name: `More actions for ${f.sent.client.company}` })
    .click();
  await page.getByRole("button", { name: "Reassign…", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "Reassign proposal",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await modal
    .getByLabel("To", { exact: true })
    .selectOption(f.member.actor.slice(6));
  await capture(page, "reassign-1440");
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  const before = (await f.repo.get(f.sent.id))!;
  await modal.getByRole("button", { name: "Reassign", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const after = (await f.repo.get(f.sent.id))!;
  expect(after.token).toBe(before.token);
  expect(after.versions).toEqual(before.versions);
  expect(after.sender?.user_id).toBe(f.member.actor.slice(6));
  await page.goto("/proposals");
  await page
    .getByRole("combobox", { name: "Filter by owner" })
    .selectOption(f.member.actor.slice(6));
  await expect(page.locator(".proposal-row")).toHaveCount(3);
  await capture(page, "owner-filter-1440");
  await page
    .getByRole("combobox", { name: "Filter by owner" })
    .selectOption("mine");
  await expect(page.locator(".proposal-row")).toHaveCount(0);
});
test("Team bulk reassignment unblocks removal; Staff cannot hand off others' work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page);
  await page.goto("/studio/workspace?view=team");
  await page.getByRole("button", { name: "Actions for Jamie Example" }).click();
  await expect(
    page.getByRole("button", { name: "Remove from workspace", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText(
    "Reassign proposals first",
  );
  await page
    .getByRole("button", { name: "Reassign their proposals…", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Spring launch");
  await expect(dialog).toContainText("Summer campaign");
  await dialog
    .getByLabel("To", { exact: true })
    .selectOption(f.admin.actor.slice(6));
  await capture(page, "bulk-1440");
  await dialog.getByRole("button", { name: "Reassign 2 proposals" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Actions for Jamie Example" }).click();
  await page
    .getByRole("button", { name: "Remove from workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from workspace", exact: true })
    .click();
  await expect(page.getByRole("table")).not.toContainText("Jamie Example");
});
test("phone editor Reassign dialog preserves the document and stays inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const f = await fixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(
    page.locator('.editor-page-sheets[data-layout-settled="true"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "More editor actions" }).click();
  await page.getByRole("menuitem", { name: "Reassign…" }).click();
  const dialog = page.getByRole("dialog", { name: "Reassign proposal" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("To", { exact: true })
    .selectOption(f.admin.actor.slice(6));
  await capture(page, "reassign-375");
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await dialog.getByRole("button", { name: "Reassign", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await f.repo.get(f.draft.id))!.owner?.user_id).toBe(
    f.admin.actor.slice(6),
  );
});
