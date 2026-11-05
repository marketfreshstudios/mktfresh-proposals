import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { setup, staff } from "../tests/helpers";
import type { Proposal } from "../src/lib/model";
import { openEditorPanel } from "./editor-ui";
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
});
const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const shots = "docs/screenshots/manual-delivery";
async function capture(page: Page, name: string) {
  if (process.env.MANUAL_DELIVERY_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}.png` });
  }
}
async function fixture(request: APIRequestContext) {
  const { settings } = await setup();
  const clientId = crypto.randomUUID(),
    itemId = crypto.randomUUID(),
    templateId = crypto.randomUUID();
  for (const [path, data] of [
    ["workspace_settings", settings],
    [`team/${staff.actor.slice(6)}`, { display_name: "Alex Morgan" }],
    [
      "clients",
      {
        id: clientId,
        // The shared mock billing catalogue deliberately checks company matches
        // across emails; isolate both names and emails from other test clients.
        company: `Manual delivery ${clientId.slice(0, 8)}`,
        first_name: "Jane",
        last_name: "Doe",
        email: `jane-${clientId}@example.test`,
      },
    ],
    [
      "pricing_items",
      {
        id: itemId,
        sku: "planning-" + itemId,
        name: "Website planning",
        amount: 275000,
        interval: "one_time",
        qbo_item_ref: "mock-planning",
      },
    ],
    [
      "templates",
      {
        id: templateId,
        name: "Manual delivery fixture",
        active: true,
        content: [
          { id: crypto.randomUUID(), type: "heading", text: "Scope", level: 1 },
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            text: "A clear plan for the agreed work.",
          },
          { id: crypto.randomUUID(), type: "pricing_table" },
          { id: crypto.randomUUID(), type: "signature_block", role: "client" },
          { id: crypto.randomUUID(), type: "signature_block", role: "company" },
        ],
        default_quote: [
          { pricing_item_id: itemId, qty: 1, optional: false, selected: true },
        ],
      },
    ],
  ] as const) {
    const r = await request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
  }
  const response = await request.post("/api/proposals", {
    headers,
    data: {
      client_id: clientId,
      template_id: templateId,
      title: "Website partnership",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Proposal;
}
test("manual publish exposes one copyable link, no email, record/list access and client signing", async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const draft = await fixture(request);
  await page.goto(`/proposals/${draft.id}`);
  await expect(
    page.locator('.editor-page-sheets[data-layout-settled="true"]'),
  ).toBeVisible();
  await openEditorPanel(page, "Send");
  await expect(
    page.getByRole("radio", { name: "Email it from the app", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("radio", { name: "I'll send it myself", exact: true })
    .check();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /From/ })).toBeVisible();
  await capture(page, "delivery-choice-1440");
  const published = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/proposals/${draft.id}/send`) &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Publish client link", exact: true })
    .click();
  expect((await published).status()).toBe(200);
  const dialog = page.getByRole("dialog", {
    name: "Your proposal link is ready",
  });
  await expect(dialog).toBeVisible();
  const p = (await (
    await request.get(`/api/proposals/${draft.id}`, { headers })
  ).json()) as Proposal;
  const url = `http://127.0.0.1:3100/p/${p.token}`;
  await expect(dialog.getByLabel("Client link", { exact: true })).toHaveValue(
    url,
  );
  await expect(dialog).toContainText(
    "Paste this into your own email. The client signs and pays on this page as usual.",
  );
  await capture(page, "confirmation-1440");
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  expect(
    await (
      await request.get(`/api/proposals/${p.id}/emails`, { headers })
    ).json(),
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Automatic reminders from the app" }),
  ).not.toBeChecked();
  await capture(page, "record-link-1440");
  await expect(page.getByText(/Sent manually by Alex Morgan/)).toBeVisible();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("switch", { name: "Automatic reminders from the app" })
    .check();
  await expect
    .poll(async () => {
      return (
        await (await request.get(`/api/proposals/${p.id}`, { headers })).json()
      ).automatic_reminders;
    })
    .toBe(true);
  await page.goto("/proposals");
  await page.getByRole("textbox", { name: "Search proposals" }).fill(p.title);
  const row = page
    .locator(".proposal-row")
    .filter({ hasText: p.client.company })
    .filter({ hasText: p.title });
  await row
    .getByRole("button", { name: `More actions for ${p.client.company}` })
    .click();
  await page
    .getByRole("button", { name: "Copy client link", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  // Client uses the manually shared URL, with the same real signing/job pipeline.
  await page.goto(`/p/${p.token}`);
  await page
    .getByRole("button", { name: "Review and sign", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Jane Doe");
  await page.getByLabel("Your signature", { exact: true }).fill("Jane Doe");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Sign proposal", exact: true })
    .click();
  await expect(
    page.getByText(/Your proposal is signed\. Your copy will be sent to/),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const row = await (
          await request.get(`/api/proposals/${p.id}`, { headers })
        ).json();
        return row.files.some(
          (f: any) => f.kind === "sealed" && f.stage === "client",
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const log = await (
          await request.get(`/api/proposals/${p.id}/emails`, { headers })
        ).json();
        return log.some(
          (e: any) =>
            e.snapshot.to === p.client.email &&
            e.snapshot.template_key === "signed_copy",
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
});
test("375px manual confirmation preserves password guidance and has an accessible copy control", async ({
  page,
  request,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let p = await fixture(request);
  const r = await request.post(`/api/proposals/${p.id}/send`, {
    headers,
    data: {
      revision: p.revision,
      delivery_method: "manual",
      password: "client-password",
      pagination: { format: 1, pages: 1, starts: [] },
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  p = await r.json();
  await page.goto(`/proposals/${p.id}?delivery=manual`);
  const dialog = page.getByRole("dialog", {
    name: "Your proposal link is ready",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("They'll also need the password you set.");
  await capture(page, "confirmation-375");
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
