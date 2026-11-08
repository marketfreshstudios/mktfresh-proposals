import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { emailEditorFixture } from "./email-editor-fixture";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { Worker } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { mutate } from "../src/lib/repository";
const dir = "docs/screenshots/reminder-rules";
async function shot(page: Page, name: string, fullPage = true) {
  if (process.env.CAPTURE_REMINDER_RULES === "1") {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${name}.png`,
      fullPage,
      animations: "disabled",
    });
  }
}
test("Workspace reminder rules autosave; staff email is read-only and tests only to the signed-in user; automatic mail reaches the timeline", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  await page.route("**/api/workspace_settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fallback();
      return;
    }
    Object.assign(
      f.settings,
      WorkspaceSettingsSchema.parse(route.request().postDataJSON()),
    );
    await f.repo.put("workspace_settings", f.settings);
    await route.fulfill({ json: f.settings });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=email-sending");
  await expect(
    page.getByText(/Current schedule: days 3 and 7 after sending/),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Reply-to", exact: true })
    .selectOption("workspace");
  await expect.poll(() => f.settings.email_reply_to).toBe("workspace");
  expect(f.settings.reminder_rules).toBeUndefined(); // Reply-to alone does not migrate the legacy schedule.
  await page
    .getByRole("spinbutton", { name: "Not opened days", exact: true })
    .fill("2");
  await page
    .getByRole("spinbutton", { name: "Viewed, not signed days", exact: true })
    .fill("4");
  await page
    .getByRole("spinbutton", { name: "Stop after reminders", exact: true })
    .fill("3");
  await page
    .getByRole("combobox", { name: "Remind staff to countersign", exact: true })
    .selectOption("next_morning");
  await expect
    .poll(() => f.settings.reminder_rules)
    .toEqual({
      enabled: true,
      unopened_days: 2,
      viewed_days: 4,
      stop_after: 3,
    });
  await expect
    .poll(() => f.settings.countersign_reminder?.mode)
    .toBe("next_morning");
  await expect(
    page.getByText("Every 2 days, up to 3 reminders across both kinds", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Every 4 days, up to 3 reminders across both kinds", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".workspace-section-card [role=status]"),
  ).toHaveText("Saved");
  await page
    .getByRole("heading", { name: "Email sending", exact: true })
    .click();
  await shot(page, "email-sending-1440");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 375, height: 900 });
  await page
    .locator(".workspace-section-card")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => scrollBy(0, -16));
  await shot(page, "email-sending-375", false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const label of [
    "Not opened days",
    "Viewed, not signed days",
    "Stop after reminders",
  ]) {
    const box = await page
      .getByRole("spinbutton", { name: label, exact: true })
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/emails");
  await page
    .getByRole("tab", { name: "Staff notifications · 10", exact: true })
    .click();
  await expect(page.locator(".email-list-row")).toHaveCount(10);
  await expect(
    page.getByRole("link", { name: /Countersign reminder/ }),
  ).toBeVisible();
  await shot(page, "staff-emails-1440");
  await page.getByRole("link", { name: /Countersign reminder/ }).click();
  await expect(
    page.getByText("Staff notification · read-only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Send me a test", exact: true })
    .click();
  await expect.poll(() => f.mailer.sent.size).toBe(1);
  expect([...f.mailer.sent.values()][0]).toMatchObject({
    to: "staff@example.test",
  });
  // Use the real scheduler, worker and immutable email log to populate the record.
  await f.editRemote({
    content: [
      ...f.active().content,
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
  });
  f.service.clock = () => new Date(Date.now() - 5 * 86400000);
  await f.sendRemote();
  await mutate(f.repo, f.draft.id, (p) => {
    p.jobs = [];
  });
  f.service.clock = () => new Date();
  const worker = new Worker(
    f.repo,
    { get: async () => new Uint8Array(), put: async () => {} },
    f.mailer,
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
  );
  await Promise.all([f.service.tick(), f.service.tick()]);
  await worker.drain(f.draft.id, "email");
  const p = (await f.repo.get(f.draft.id))!;
  expect(p.events.filter((e) => e.type === "reminder_sent")).toHaveLength(2);
  await page.route(`**/api/proposals/${p.id}`, (route) =>
    route.fulfill({ json: p }),
  );
  await page.route(`**/api/proposals/${p.id}/emails`, async (route) =>
    route.fulfill({ json: await f.repo.emailLog(p.id) }),
  );
  await page.goto(`/proposals/${p.id}?view=record`);
  await expect(
    page.getByText("Automatic reminder emailed · unopened", { exact: true }),
  ).toHaveCount(2);
  await page.locator(".timeline").scrollIntoViewIfNeeded();
  await shot(page, "automatic-reminders-timeline-1440", false);
  f.member(true);
  await page.goto("/studio/workspace?view=email-sending");
  for (const label of ["Reply-to", "Remind staff to countersign"])
    await expect(
      page.getByRole("combobox", { name: label, exact: true }),
    ).toBeDisabled();
  await expect(
    page.getByRole("spinbutton", { name: "Not opened days", exact: true }),
  ).toBeDisabled();
});
