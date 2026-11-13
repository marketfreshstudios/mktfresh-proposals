import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { editorFixture } from "./editor-fixture";
import { staff, signature, companyConsent } from "../tests/helpers";
import { Worker, MockMailer } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { mutate } from "../src/lib/repository";
import { event, system } from "../src/lib/service";
import { jobFailure, jobRecordAnchor } from "../src/lib/job-presentation";
import {
  prepareEmail,
  emailTemplates,
  saveEmailTemplate,
} from "../src/lib/email-templates";
import { emailStudioPreview } from "../src/lib/email-studio";
test("final PDF failure highlights its Retry row; one clear editable staff alert opens that job", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await f.editRemote({
    content: [
      ...f.content,
      { id: "company-signature", type: "signature_block", role: "company" },
    ],
  });
  let p = await f.sendRemote();
  p = await f.signRemote(signature(p.revision));
  p = await f.service.sign(
    p.id,
    companyConsent(p.revision, f.settings),
    "company",
    staff,
  );
  p = await mutate(f.repo, p.id, (row) => {
    const job = row.jobs.find((j) => j.id.endsWith(":pdf:company"))!;
    job.status = "failed";
    job.attempts = 5;
    job.last_error =
      "page.pdf: Protocol error (Page.printToPDF): Printing failed";
    event(row, "sync_failed", system, {
      job: job.id,
      error: job.last_error,
      terminal: true,
    });
  });
  const job = p.jobs.find((j) => j.id.endsWith(":pdf:company"))!,
    failure = jobFailure(job, job.last_error!);
  const mail = await prepareEmail(f.repo, p, {
    ...job,
    kind: "email",
    payload: {
      email_template_key: "staff_billing_failed",
      to: staff.staff_email,
      job_failure: failure,
    },
  });
  expect(mail.subject).toBe(
    `Signed PDF and certificate needs attention: ${p.client.company || `${p.client.first_name} ${p.client.last_name}`.trim()}`,
  );
  expect(mail.html).not.toContain("Billing");
  await page.setContent(mail.html);
  await expect(page.getByRole("link", { name: "Open proposal" })).toHaveCount(
    1,
  );
  if (process.env.CAPTURE_JOB_FAILURES === "1") {
    await mkdir("docs/screenshots/pdf-job-fix", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/pdf-job-fix/failure-email-1440.png",
      fullPage: true,
    });
  }
  const worker = new Worker(
    f.repo,
    { put: async () => {}, get: async () => new Uint8Array() },
    new MockMailer(),
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
  );
  let retried = 0;
  await page.route("**/api/proposals/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/retry")) {
      p = await worker.retry(p.id);
      retried++;
    }
    await route.fulfill({ json: (await f.repo.get(p.id))! });
  });
  await page.goto(
    new URL(mail.button_url).pathname +
      new URL(mail.button_url).search +
      new URL(mail.button_url).hash,
  );
  const row = page.locator(`[data-job-id="${job.id}"]`);
  await expect(row).toHaveClass("record-job-highlight");
  await expect(row).toBeFocused();
  await expect(
    row.getByText("Signed PDF and certificate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Signed PDF failed | Retry available", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  if (process.env.CAPTURE_JOB_FAILURES === "1")
    await page.screenshot({
      path: "docs/screenshots/pdf-job-fix/failed-job-retry-1440.png",
      fullPage: true,
    });
  await row.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => retried).toBe(1);
  expect(
    (await f.repo.get(p.id))!.jobs.find((j) => j.id === job.id),
  ).toMatchObject({ status: "pending", attempts: 0 });
  await page.route("**/api/email-templates**", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    let value: unknown;
    if (route.request().method() === "PUT")
      value = await saveEmailTemplate(
        f.repo,
        staff,
        parts[3],
        route.request().postDataJSON(),
      );
    else if (parts[4] === "preview") {
      const result = await emailStudioPreview(
        f.repo,
        { put: async () => {}, get: async () => new Uint8Array() },
        staff,
        parts[3],
        route.request().postDataJSON(),
      );
      value = { ...result.result, values: result.values };
    } else value = await emailTemplates(f.repo);
    await route.fulfill({ json: value });
  });
  await page.goto("/studio/emails/staff_billing_failed");
  await expect(
    page.getByRole("textbox", { name: "Email body" }),
  ).toBeEditable();
  await page
    .getByRole("textbox", { name: "Email body" })
    .fill("Please review {{job.summary}}");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(
      "Email template saved. Future emails will use this version.",
      { exact: true },
    ),
  ).toBeVisible();
});
