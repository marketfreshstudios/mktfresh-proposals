import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { paymentPlanClause } from "../seed/oiot-clause";
import { catalogQuoteItem } from "../src/lib/quote-model";
import { ItemSchema, type Item, type Proposal } from "../src/lib/model";
import { renderBlocks, variables } from "../src/lib/presentation";
import { connectAssistant } from "./mcp-client";
import { setup, signature } from "../tests/helpers";
import { openQuoteRow, openEditorPanel } from "./editor-ui";

const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const capture = process.env.CAPTURE_OIOT === "1";
const shots = "docs/screenshots/oiot-terms";
const runInShots = "docs/screenshots/oiot-editor-run-in";
const captureRunIns = process.env.CAPTURE_OIOT_RUN_INS === "1";
const runIns = [
  "Fees and Term.",
  "What the Monthly Fee Covers.",
  "Build Credit, Buyout and Step-Down.",
  "Ownership.",
  "If Payment Stops or Client Cancels.",
];
async function expectRunIns(clause: Locator) {
  for (const label of runIns)
    await expect(
      clause.getByText(label, { exact: true }).first(),
    ).toHaveJSProperty("tagName", "STRONG");
  await expect(clause).not.toContainText("**");
}

async function fixture(
  request: APIRequestContext,
  {
    withoutClause = false,
    catalogSku,
    planSelected = false,
  }: {
    withoutClause?: boolean;
    catalogSku?: string;
    planSelected?: boolean;
  } = {},
) {
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
    sku: catalogSku ?? "oiot-test-" + template,
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
    selected: order === (planSelected ? 1 : 0),
    default_selected: order === (planSelected ? 1 : 0),
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
    content: withoutClause
      ? blocks.filter((block) => block.type !== "contract")
      : blocks,
    default_quote: [],
    default_items: withoutClause ? [] : quote,
  });
  return {
    draft: (await post("proposals", {
      title: "A website for Northstar Dental",
      template_id: template,
      client_id: client,
    })) as Proposal,
    planId: plan.id,
    templateId: template,
    post,
  };
}

test("staff enters both amounts, client chooses the plan and the full bold terms reach the signed PDF", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  if (capture) mkdirSync(shots, { recursive: true });
  if (captureRunIns) mkdirSync(runInShots, { recursive: true });
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
  await expect(kickoff).toHaveValue("1500");
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
  await expectRunIns(clause);
  if (captureRunIns) {
    await clause.locator("summary").evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      el.closest(".editor-document-region")?.scrollBy(0, -190);
    });
    await page.screenshot({ path: runInShots + "/proposal-editor-1440.png" });
  }
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
  await expectRunIns(page.locator(".client-document-sheets"));
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
  if (captureRunIns)
    await page.screenshot({ path: runInShots + "/client-1440.png" });

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
  const frozen = (await get()).versions.at(-1)!;
  expect(frozen.frozen).toBe(true);
  expect(
    frozen.content.find((b) => b.type === "contract")?.clauses?.[0],
  ).toEqual(
    expect.objectContaining({
      body: paymentPlanClause.body,
      body_format: "oiot_run_in",
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "View the signed proposal" }).click();
  await expectRunIns(page.locator(".client-document-sheets"));
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
  expect(text).not.toContain("**");
  // Poppler exports bold font runs from the signed PDF as <b> elements.
  const xml = execFileSync("pdftohtml", ["-xml", "-i", "-stdout", file], {
    encoding: "utf8",
  });
  for (const label of runIns) expect(xml).toContain(`<b>${label}</b>`);
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
  if (captureRunIns)
    execFileSync("pdftoppm", [
      "-f",
      String(termsPage),
      "-l",
      String(termsPage + 1),
      "-scale-to-x",
      "1440",
      "-scale-to-y",
      "-1",
      "-png",
      file,
      runInShots + "/signed-pdf-1440",
    ]);
});

test("template canvas and clause settings edit bold run-ins without exposing delimiters", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1160 });
  const { templateId, draft } = await fixture(request, { planSelected: true });
  const getTemplateClause = async () => {
    const list = await (
      await request.get("/api/templates", { headers })
    ).json();
    return list
      .find((t: { id: string }) => t.id === templateId)
      .content.find((b: { type: string }) => b.type === "contract").clauses[0];
  };
  await page.goto(`/studio/templates/${templateId}`);
  const clause = page.getByRole("textbox", { name: "Clause 1 body" });
  await expectRunIns(clause);
  await expect(clause.locator('[data-field="oiot.kickoff"]')).toBeAttached();
  expect((await getTemplateClause()).body).toBe(paymentPlanClause.body);
  if (captureRunIns) {
    mkdirSync(runInShots, { recursive: true });
    await clause
      .locator("strong")
      .first()
      .evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        el.closest(".studio-template-main")?.scrollBy(0, -185);
      });
    await page.screenshot({ path: runInShots + "/template-editor-1440.png" });
  }
  // Edit within the marked label, then type a stray Markdown delimiter.
  await clause.locator("strong").first().scrollIntoViewIfNeeded();
  const labelPoint = await clause
    .locator("strong")
    .first()
    .evaluate((label) => {
      const range = document.createRange();
      range.setStart(label.firstChild!, "Fees and Term".length);
      range.collapse(true);
      const point = range.getBoundingClientRect();
      return { x: point.x, y: point.y + point.height / 2 };
    });
  await page.mouse.click(labelPoint.x, labelPoint.y);
  await page.keyboard.insertText(" revised**");
  await expect(clause.locator("strong").first()).toHaveText(
    "Fees and Term revised.",
  );
  await expect(clause).not.toContainText("*");
  await expect
    .poll(async () => (await getTemplateClause()).body)
    .toBe(
      paymentPlanClause.body.replace(
        "Fees and Term.",
        "Fees and Term revised.",
      ),
    );
  await page.reload();
  await expect(clause.locator("strong").first()).toHaveText(
    "Fees and Term revised.",
  );

  // The proposal's edit sheet uses the same marked field as the template.
  await page.goto(`/proposals/${draft.id}`);
  const contract = page
    .locator(".contract-editor details")
    .filter({ hasText: "4.4 Own It Over Time" });
  const summary = contract.locator("summary");
  await expect(summary).toBeVisible();
  await summary.click();
  const clauseFrame = page.getByRole("group", {
    name: "Proposal clause 1",
    exact: true,
  });
  await clauseFrame.focus();
  await clauseFrame.getByRole("button", { name: "Clause settings" }).click();
  const editor = page.getByRole("textbox", {
    name: "Clause body",
    exact: true,
  });
  await expectRunIns(editor);
  await editor
    .locator("strong")
    .first()
    .evaluate((label) => {
      const range = document.createRange();
      range.selectNodeContents(label);
      const selection = window.getSelection()!;
      (label.closest("[contenteditable]") as HTMLElement).focus();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.keyboard.press("Backspace");
  await expect(editor.locator("strong")).toHaveCount(4);
  await expect(editor).not.toContainText("*");
});

test("catalog kickoff stays editable after Enter and Tab without clause 4.4", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  const { draft, planId } = await fixture(request, { withoutClause: true });
  expect(draft.content.some((block) => block.type === "contract")).toBe(false);
  const get = async (): Promise<Proposal> =>
    (await request.get(`/api/proposals/${draft.id}`, { headers })).json();
  const savedItem = async () =>
    (await get()).quote.find((item) => item.pricing_item_id === planId);
  await page.goto(`/proposals/${draft.id}`);
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  await openEditorPanel(page, "Quote");
  await page
    .getByRole("combobox", { name: "Add product" })
    .selectOption(planId);
  const row = await openQuoteRow(page, "Own It Over Time");
  const kickoff = row.getByRole("spinbutton", {
    name: "Own It Over Time kickoff",
  });
  const price = row.getByRole("spinbutton", { name: "Website purchase price" });
  await expect(kickoff).toBeVisible();
  await kickoff.fill("1200.25");
  await kickoff.press("Enter");
  await expect(kickoff).toBeFocused();
  await expect
    .poll(async () =>
      (await savedItem())?.sublines.filter((line) => line.oiot_kickoff),
    )
    .toEqual([
      expect.objectContaining({ amount: 120025, interval: "one_time", qty: 1 }),
    ]);
  const kickoffId = (await savedItem())?.sublines.find(
    (line) => line.oiot_kickoff,
  )?.id;
  await kickoff.fill("1500");
  await kickoff.press("Tab");
  await expect(price).toBeFocused();
  await price.fill("3750");
  await expect.poll(savedItem).toMatchObject({
    oiot_purchase_price: 375000,
    sublines: [
      expect.objectContaining({
        id: kickoffId,
        amount: 150000,
        interval: "one_time",
        oiot_kickoff: true,
      }),
      expect.objectContaining({ amount: 17500, interval: "month" }),
    ],
  });
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  const reopened = await openQuoteRow(page, "Own It Over Time");
  await expect(
    reopened.getByRole("spinbutton", { name: "Own It Over Time kickoff" }),
  ).toHaveValue("1500");
  await expect(
    reopened.getByRole("spinbutton", { name: "Website purchase price" }),
  ).toHaveValue("3750");

  if (process.env.CAPTURE_OIOT_KICKOFF === "1") {
    const dir = "docs/screenshots/oiot-kickoff-entry";
    mkdirSync(dir, { recursive: true });
    await reopened
      .getByRole("spinbutton", { name: "Own It Over Time kickoff" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/quote-panel-1440.png" });
    await page.setViewportSize({ width: 375, height: 850 });
    await expect(
      page.getByRole("button", { name: /^Open Quote/ }),
    ).toBeVisible();
    const phone = await openQuoteRow(page, "Own It Over Time");
    await phone
      .getByRole("spinbutton", { name: "Own It Over Time kickoff" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/quote-panel-375.png" });
  }
});

test("MCP fills an omitted kickoff and preserves exact amounts through proposal and template tools", async ({
  page,
  request,
}) => {
  const { draft, planId, templateId } = await fixture(request, {
    catalogSku: "oiot-monthly-175",
  });
  const call = await connectAssistant(
    request,
    headers,
    "proposals:read proposals:draft templates:edit",
  );
  const catalog: Item[] = await call("list_catalog", {});
  const product = catalog.find((item) => item.sku === "oiot-monthly-175");
  expect(product).toMatchObject({
    id: planId,
    amount: 17500,
    interval: "month",
  });
  const plan = catalogQuoteItem(product!, 0, crypto.randomUUID(), [
    crypto.randomUUID(),
  ]);
  const kickoff = {
    id: crypto.randomUUID(),
    label: "Kickoff",
    interval: "one_time" as const,
    qty: 1,
    oiot_kickoff: true as const,
    amount: 150000,
    list_amount: null,
    stripe_lookup_key: null,
    qbo_item_ref: null,
  };
  const entered = {
    ...plan,
    oiot_purchase_price: 375000,
    sublines: [...plan.sublines, kickoff],
  };
  const input = {
    title: "Connector website quote",
    brief:
      "Quote the exact kickoff and website purchase price supplied by the user.",
    client_id: draft.client.id,
    template_id: templateId,
    content_markdown: "# Scope\n\nDesign and build the website.",
  };
  let proposal = await call("create_proposal_draft", {
    ...input,
    items: [plan],
  });
  const missing = await call("check_ready", { id: proposal.id });
  expect(missing.errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("oiot_kickoff: true"),
      expect.stringContaining("items[].oiot_purchase_price"),
    ]),
  );
  proposal = await call("set_quote_lines", {
    id: proposal.id,
    revision: proposal.revision,
    items: [{ ...plan, oiot_purchase_price: 375000 }],
  });
  const saved = await call("get_proposal", { id: proposal.id });
  expect(saved.items).toEqual([
    expect.objectContaining({
      ai_entered: true,
      oiot_purchase_price: 375000,
      sublines: [
        expect.objectContaining({ amount: 17500, interval: "month" }),
        expect.objectContaining({
          amount: 150000,
          interval: "one_time",
          qty: 1,
          oiot_kickoff: true,
          list_amount: null,
        }),
      ],
    }),
  ]);
  const ready = await call("check_ready", { id: proposal.id });
  expect(ready.errors).toEqual([
    expect.stringContaining("Confirm review of AI changes"),
  ]);
  await page.goto(`/proposals/${proposal.id}`);
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  const aiRow = await openQuoteRow(page, "Own It Over Time");
  await expect(
    aiRow.getByText(
      "Review the kickoff and website purchase price entered by the assistant.",
    ),
  ).toBeVisible();
  await expect(
    aiRow.getByRole("spinbutton", { name: "Own It Over Time kickoff" }),
  ).toHaveValue("1500");
  await expect(
    aiRow.getByRole("spinbutton", { name: "Website purchase price" }),
  ).toHaveValue("3750");

  proposal = await call("set_quote_lines", {
    id: proposal.id,
    revision: proposal.revision,
    items: [entered],
  });
  expect(proposal.items[0]).toMatchObject({ ...entered, ai_entered: true });

  const staffDraft: Proposal = await (
    await request.get(`/api/proposals/${proposal.id}`, { headers })
  ).json();
  const html = renderBlocks(
    staffDraft.content,
    staffDraft.quote,
    variables(staffDraft),
  );
  expect(html).toContain("kickoff payment of $1,500");
  expect(html).toContain("full purchase price is $3,750");

  const revised = {
    ...entered,
    oiot_purchase_price: 400000,
    sublines: [...plan.sublines, { ...kickoff, amount: 175000 }],
  };
  const updated = await call("update_proposal_draft", {
    id: proposal.id,
    revision: proposal.revision,
    items: [revised],
  });
  expect(updated.items[0]).toMatchObject(revised);
  const created = await call("create_proposal_draft", {
    ...input,
    items: [entered],
  });
  expect(created.items[0]).toMatchObject(entered);

  const template = await call("create_template", {
    name: "Connector website defaults",
    content: "# Scope\n\nDesign and build the website.",
    default_quote_items: [entered],
  });
  const initial = await call("get_template", {
    template_id: template.template_id,
  });
  expect(initial.default_quote_items[0]).toMatchObject(entered);
  await call("update_template", {
    template_id: template.template_id,
    revision: initial.revision,
    default_quote_items: [revised],
  });
  const changed = await call("get_template", {
    template_id: template.template_id,
  });
  expect(changed.default_quote_items[0]).toMatchObject(revised);
});
