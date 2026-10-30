import { catalogQuoteItem } from "../src/lib/quote-model";
import { testSignatory } from "../tests/helpers";
import { connectAssistant } from "./mcp-client";
import { type Item } from "../src/lib/model";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
test("full headless flow through the client interface, both PDFs, billing, download, verification", async ({
  page,
  request,
}) => {
  const headers = { Authorization: "Bearer e2e-staff-secret-only" };
  expect((await request.get("/api/proposals")).status()).toBe(401);
  const existingClients = await (
    await request.get("/api/clients", { headers })
  ).json();
  const clientId =
      existingClients.find(
        (c: { id: string; email: string }) => c.email === "jane@example.test",
      )?.id ?? randomUUID(),
    itemId = randomUUID(),
    monthlyId = randomUUID(),
    optionalId = randomUUID(),
    templateId = randomUUID();
  for (const [path, data] of [
    [
      "workspace_settings",
      {
        company_name: "Example Studio",
        company_signatory: testSignatory,
        owner: "Alex",
        email: "owner@example.test",
        phone: "",
        address: "",
        logo: null,
        accent_colour: "#365C4A",
        sending_domain: "example.test",
        consent_text:
          "I consent to electronic records and signatures and agree to this proposal.",
        reminder_days: [3, 7],
        default_validity_days: 30,
        timezone: "UTC",
        qbo_custom_item_ref: "mock-custom",
        collection_method: "charge_automatically",
      },
    ],
    [
      "clients",
      {
        id: clientId,
        company: "Example Company",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.test",
      },
    ],
    [
      "pricing_items",
      {
        id: itemId,
        sku: "build-" + itemId,
        name: "Website build",
        amount: 275000,
        interval: "one_time",
        qbo_item_ref: "mock_build",
      },
    ],
    [
      "pricing_items",
      {
        id: monthlyId,
        sku: "hosting-" + monthlyId,
        name: "Hosting",
        amount: 2500,
        interval: "month",
        stripe_lookup_key: "mock_hosting",
      },
    ],
    [
      "pricing_items",
      {
        id: optionalId,
        sku: "optional-" + optionalId,
        name: "Optional care",
        amount: 4900,
        interval: "month",
        stripe_lookup_key: "mock_care",
      },
    ],
    [
      "templates",
      {
        id: templateId,
        name: "E2E",
        active: true,
        content: [
          { type: "heading", text: "{{proposal.title}}" },
          {
            type: "paragraph",
            text: "Prepared for {{client.company}}. Monthly: {{quote.monthly_total}}.",
          },
          { type: "pricing_table" },
          { type: "signature_block", role: "client" },
          { type: "signature_block", role: "company" },
        ],
        default_quote: [
          { pricing_item_id: itemId, qty: 1, optional: false, selected: true },
          {
            pricing_item_id: monthlyId,
            qty: 1,
            optional: false,
            selected: true,
          },
          {
            pricing_item_id: optionalId,
            qty: 1,
            optional: true,
            selected: true,
          },
        ],
      },
    ],
  ] as const) {
    const response = await request.post("/api/" + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const call = await connectAssistant(request, headers);
  const catalog = (await call("list_catalog", {})) as Item[];
  const items = [itemId, monthlyId, optionalId].map((id, order) => ({
    ...catalogQuoteItem(
      catalog.find((i) => i.id === id)!,
      order,
      id,
      [id],
    ),
    optional: id === optionalId,
    default_selected: true,
    selected: true,
  }));
  let p = await call("create_proposal_draft", {
    brief: "Discovery notes for the website partnership",
    client_id: clientId,
    template_id: templateId,
    title: "Website partnership",
    content_markdown:
      "# {{proposal.title}}\n\nPrepared for {{client.company}}. Monthly: {{quote.monthly_total}}.",
    items,
  });
  expect(p.ai_unreviewed).toBe(true);
  await page.context().addCookies([
    {
      name: "proposal_session",
      value: "e2e-staff-secret-only",
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/settings/team");
  await page.getByLabel("Display name", { exact: true }).fill("Alex Sender");
  await page.getByRole("button", { name: "Save display name" }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/auth/session", { headers })).json())
          .staff[0].display_name,
    )
    .toBe("Alex Sender");
  await page.goto("/settings");
  await expect(
    page.getByText("Client website URL", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Sender name", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sender email", { exact: true })).toHaveCount(0);
  await page.goto(`/proposals/${p.id}/edit`);
  await page
    .getByRole("spinbutton", { name: "Amount Website build", exact: true })
    .first()
    .fill("2751");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep $2,751", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review & send", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: /I have reviewed these AI-written sections/,
    })
    .check();
  await expect(
    page.getByRole("combobox", { name: "From", exact: true }),
  ).toHaveValue("00000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Send to Jane", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/proposals/${p.id}$`));
  let r = await request.get(`/api/proposals/${p.id}`, { headers });
  p = await r.json();
  expect(p.quote[0].sublines[0].amount).toBe(275100);
  expect(p.token).toHaveLength(43);
  expect(p.sender).toMatchObject({
    display_name: "Alex Sender",
    email: "staff@example.test",
  });
  let publicState = await (await request.get(`/api/public/${p.token}`)).json();
  r = await request.post(`/api/public/${p.token}/quote`, {
    data: {
      revision: publicState.revision,
      reviewed_hash: publicState.reviewed_hash,
      item_id: optionalId,
      selected: false,
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  publicState = await r.json();
  expect(publicState.totals.monthly_total).toBe(2500);
  await page.goto(`/p/${p.token}`);
  await expect(
    page.getByRole("heading", { name: "Website partnership" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review and sign" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Jane Doe");
  await page.getByLabel("Your signature", { exact: true }).fill("Jane Doe");
  await expect(page.getByLabel("Email address")).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign proposal" }).click();
  await expect(
    page.getByText(
      "Your proposal is signed. Your copy will be sent to jane@example.test.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const result = await (
        await request.get(`/api/proposals/${p.id}`, { headers })
      ).json();
      return result.files.filter((f: any) => f.kind === "sealed").length;
    })
    .toBe(1);
  r = await request.post(`/api/proposals/${p.id}/jobs`, { headers });
  expect(r.ok(), await r.text()).toBe(true);
  p = await (await request.get(`/api/proposals/${p.id}`, { headers })).json();
  expect(p.billing_links.map((l: { status: string }) => l.status)).toEqual([
    "succeeded",
    "succeeded",
  ]);
  expect(
    p.files.filter((f: { kind: string }) => f.kind === "sealed"),
  ).toHaveLength(1);
  r = await request.post(`/api/proposals/${p.id}/countersign`, {
    headers,
    data: {
      revision: p.revision,
      reviewed_hash: p.versions.at(-1).content_hash,
      signatory_version: (
        await (await request.get("/api/auth/session", { headers })).json()
      ).signatory_version,
      consent: true,
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await request.post(`/api/proposals/${p.id}/jobs`, { headers });
  await expect
    .poll(async () => {
      const result = await (
        await request.get(`/api/proposals/${p.id}`, { headers })
      ).json();
      return result.files.some(
        (f: any) => f.kind === "sealed" && f.stage === "company",
      );
    })
    .toBe(true);
  p = await (await request.get(`/api/proposals/${p.id}`, { headers })).json();
  expect(p.status).toBe("completed");
  const file = p.files.find(
    (f: { kind: string; stage: string }) =>
      f.kind === "sealed" && f.stage === "company",
  );
  const verification = await (
    await request.get(`/api/public/${p.token}/files/${file.id}/verify`)
  ).json();
  expect(verification.valid).toBe(true);
  const pdf = await (
    await request.get(`/api/public/${p.token}/files/${file.id}`)
  ).body();
  const document = await PDFDocument.load(pdf);
  expect(document.getPageCount()).toBeGreaterThanOrEqual(2);
  await mkdir(".data/evidence", { recursive: true });
  await writeFile(".data/evidence/countersigned-proposal.pdf", pdf);
  await page.screenshot({
    path: ".data/evidence/signing-harness.png",
    fullPage: true,
  });
  expect(
    (
      await request.post(`/api/public/${p.token}/quote`, {
        data: { revision: p.revision, item_id: optionalId, selected: true },
      })
    ).status(),
  ).toBe(409);
});
test("public errors and password routes do not disclose private data", async ({
  request,
}) => {
  expect((await request.get("/api/public/not-a-token")).status()).toBe(404);
  expect((await request.post("/api/cron")).status()).toBe(401);
  expect(
    (
      await request.get("/api/clients", {
        headers: { Authorization: "Bearer wrong" },
      })
    ).status(),
  ).toBe(401);
});
