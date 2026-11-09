import { expect, test, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { paymentPlanClause } from "../seed/oiot-clause";
import { catalogQuoteItem } from "../src/lib/quote-model";
import { ItemSchema, type Proposal } from "../src/lib/model";
import { setup, signature } from "../tests/helpers";
import { openQuoteRow, openEditorPanel } from "./editor-ui";

const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const capture = process.env.CAPTURE_OIOT === "1";
const shots = "docs/screenshots/oiot-terms";

async function fixture(request: APIRequestContext) {
  const { settings } = await setup();
  const client = crypto.randomUUID(),
    template = crypto.randomUUID();
  const build = ItemSchema.parse({
    id: crypto.randomUUID(),
    sku: "website-build-test-" + template,
    name: "Website Build — Own It Now",
    amount: 375000,
    interval: "one_time",
    qbo_item_ref: "mock-services",
  });
  const plan = ItemSchema.parse({
    id: crypto.randomUUID(),
    sku: "oiot-test-" + template,
    name: "Website Build — Own It Over Time",
    amount: 17500,
    interval: "month",
    stripe_lookup_key: "oiot-monthly-175",
    schedule: {
      after_paid_invoices: 30,
      then: { amount: 10000, lookup_key: "hosted-standard-100" },
    },
    min_term_months: 18,
  });
  const group = crypto.randomUUID();
  const quote = [build, plan].map((item, order) => ({
    ...catalogQuoteItem(item, order, crypto.randomUUID(), [
      crypto.randomUUID(),
    ]),
    optional: true,
    choice_group_id: group,
    selected: order === 0,
    default_selected: order === 0,
  }));
  const blocks = [
    { type: "page_break" },
    { type: "heading", text: "Investment", level: 1 },
    { type: "pricing_table" },
    { type: "page_break" },
    {
      type: "contract",
      text: "Terms",
      clauses: [
        {
          ...paymentPlanClause,
          show_when: {
            ...paymentPlanClause.show_when,
            pricing_item_id: plan.id,
          },
        },
      ],
    },
    { type: "heading", text: "Signatures", level: 1 },
    { type: "signature_block", role: "client" },
    { type: "signature_block", role: "company" },
  ].map((block) => ({ ...block, id: crypto.randomUUID() }));
  async function post(path: string, data: unknown) {
    const res = await request.post("/api/" + path, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  }
  await post("workspace_settings", settings);
  await post("clients", {
    id: client,
    company: "Northstar Dental",
    first_name: "Jane",
    last_name: "Doe",
    email: "jane-" + client + "@example.test",
  });
  await post("pricing_items", build);
  await post("pricing_items", plan);
  await post("templates", {
    id: template,
    name: "Website design and build",
    active: true,
    content: blocks,
    default_quote: [],
    default_items: quote,
  });
  return {
    draft: (await post("proposals", {
      title: "A website for Northstar Dental",
      template_id: template,
      client_id: client,
    })) as Proposal,
    planId: plan.id,
    post,
  };
}

test("staff enters both amounts, client chooses the plan and the full bold terms reach the signed PDF", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  if (capture) mkdirSync(shots, { recursive: true });
  const { draft, planId, post } = await fixture(request);
  const get = async (): Promise<Proposal> =>
    (await request.get(`/api/proposals/${draft.id}`, { headers })).json();
  await page.goto(`/proposals/${draft.id}`);
  await expect(
    page.locator('.editor-page-sheets[data-layout-settled="true"]'),
  ).toBeVisible();
  await openEditorPanel(page, "Send");
  await expect(
    page.getByText("Enter the kickoff amount for Own It Over Time", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Enter the website purchase price for Own It Over Time")
      .first(),
  ).toBeVisible();
  const row = await openQuoteRow(page, "Own It Over Time");
  const kickoff = row.getByRole("spinbutton", {
    name: "Own It Over Time kickoff",
  });
  await kickoff.fill("1500");
  await kickoff.press("Tab");
  await expect(
    row.getByRole("spinbutton", { name: "Amount Kickoff" }),
  ).toHaveValue("1500");
  await row
    .getByRole("spinbutton", { name: "Website purchase price" })
    .fill("3750");
  await expect
    .poll(
      async () =>
        (await get()).quote.find((item) => item.pricing_item_id === planId)
          ?.oiot_purchase_price,
    )
    .toBe(375000);
  if (capture) await page.screenshot({ path: shots + "/quote-panel-1440.png" });

  const defaultPlan = row.getByRole("radio", { name: "Selected for client" });
  await defaultPlan.check();
  const clause = page
    .locator(".contract-editor details")
    .filter({ hasText: "4.4 Own It Over Time" });
  await expect(clause).toBeVisible();
  if (
    !(await clause.evaluate((details) => (details as HTMLDetailsElement).open))
  )
    await clause.locator("summary").click();
  await expect(clause.locator('[data-field="oiot.kickoff"]')).toHaveText(
    "$1,500",
  );
  await expect(clause.locator('[data-field="oiot.purchase_price"]')).toHaveText(
    "$3,750",
  );
  const now = await openQuoteRow(page, "Own It Now");
  await now.getByRole("radio", { name: "Selected for client" }).check();
  await expect
    .poll(
      async () =>
        (await get()).quote.find((item) => item.pricing_item_id === planId)
          ?.default_selected,
    )
    .toBe(false);
  const saved = await get();
  const sent = (await post(`proposals/${draft.id}/send`, {
    revision: saved.revision,
    delivery_method: "manual",
  })) as Proposal;
  await page.goto(`/p/${sent.token}`);
  const heading = page.getByRole("heading", { name: "4.4 Own It Over Time" });
  await expect(heading).toHaveCount(0);
  await page.getByRole("radio", { name: /Own It Over Time/ }).check();
  await expect(heading.first()).toBeVisible();
  await expect(page.locator(".client-document-sheets")).toBeVisible();
  const first = page.getByText("Fees and Term.", { exact: true }).first();
  await expect(first).toHaveJSProperty("tagName", "STRONG");
  await expect(
    page.getByText(/full purchase price is \$3,750/).first(),
  ).toBeVisible();
  await expect(page.getByText(/days’ advance notice\./).first()).toBeVisible();
  const clientEnding = await heading.first().evaluate((el) => {
    const content = el.closest(".client-sheet-content")!;
    return (content.textContent ?? "").trim().split(/\s+/).slice(-8).join(" ");
  });
  await heading.first().evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -128);
  });
  if (capture)
    await page.screenshot({ path: shots + "/client-clause-1440.png" });

  await page.setViewportSize({ width: 375, height: 850 });
  const phoneClause = page
    .locator(".flow-contract details")
    .filter({ hasText: "4.4 Own It Over Time" });
  await phoneClause.locator("summary").click();
  await expect(
    phoneClause.getByText("Ownership.", { exact: true }),
  ).toHaveJSProperty("tagName", "STRONG");
  await expect(
    phoneClause.getByText(/full purchase price is \$3,750/),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1040 });

  const accepted = await get();
  const response = await request.post(`/api/public/${sent.token}/sign`, {
    data: signature(accepted.revision, accepted.client.email),
  });
  expect(response.ok(), await response.text()).toBe(true);
  const file = testInfo.outputPath("signed-oiot.pdf");
  const pdf = await request.get(`/api/proposals/${draft.id}/download`, {
    headers,
  });
  expect(pdf.ok(), await pdf.text()).toBe(true);
  mkdirSync(testInfo.outputDir, { recursive: true });
  writeFileSync(file, await pdf.body());
  const pages = execFileSync("pdftotext", [file, "-"], {
    encoding: "utf8",
  }).split("\f");
  const termsPage =
    pages.findIndex((part) => part.includes("4.4 Own It Over Time")) + 1;
  expect(termsPage).toBeGreaterThan(0);
  expect(pages[termsPage - 1].replace(/\s+/g, " ")).toContain(clientEnding);
  const text = pages.join(" ").replace(/\s+/g, " ");
  expect(text).toContain("kickoff payment of $1,500");
  expect(text).toContain("full purchase price is $3,750");
  expect(text).toContain("days’ advance notice.");
  await page.goto(`/proposals/${draft.id}`);
  await expect(
    page.getByText("Website purchase price $3,750 · Kickoff $1,500"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Early buyout or add-on credits are handled manually — the automatic step-down happens after 30 paid monthly payments.",
    ),
  ).toBeVisible();
  if (capture)
    execFileSync("pdftoppm", [
      "-f",
      String(termsPage),
      "-l",
      String(termsPage),
      "-scale-to-x",
      "1440",
      "-scale-to-y",
      "-1",
      "-png",
      "-singlefile",
      file,
      shots + "/pdf-clause",
    ]);
});
