import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
test("full headless flow through dev signing harness, both PDFs, billing, download, verification", async ({
  page,
  request,
}) => {
  const headers = { Authorization: "Bearer e2e-staff-secret-only" };
  expect((await request.get("/api/proposals")).status()).toBe(401);
  const clientId = randomUUID(),
    itemId = randomUUID(),
    monthlyId = randomUUID(),
    optionalId = randomUUID(),
    templateId = randomUUID();
  for (const [path, data] of [
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
        unit_price: 275000,
        billing: "one_time",
        qbo_item_id: "mock_build",
      },
    ],
    [
      "pricing_items",
      {
        id: monthlyId,
        sku: "hosting-" + monthlyId,
        name: "Hosting",
        unit_price: 2500,
        billing: "monthly",
        stripe_price_id: "mock_hosting",
      },
    ],
    [
      "pricing_items",
      {
        id: optionalId,
        sku: "optional-" + optionalId,
        name: "Optional care",
        unit_price: 4900,
        billing: "monthly",
        stripe_price_id: "mock_care",
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
  let r = await request.post("/api/proposals", {
    headers,
    data: {
      client_id: clientId,
      template_id: templateId,
      title: "Website partnership",
      valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  let p = await r.json();
  r = await request.post(`/api/proposals/${p.id}/send`, { headers });
  p = await r.json();
  expect(p.token).toHaveLength(43);
  let publicState = await (await request.get(`/api/public/${p.token}`)).json();
  r = await request.post(`/api/public/${p.token}/quote`, {
    data: {
      revision: publicState.revision,
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
  await page.getByLabel("Name", { exact: true }).fill("Jane Doe");
  await page.getByLabel("Email", { exact: true }).fill("jane@example.test");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.locator("#result")).toContainText("signed_by_client");
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
      name: "Jonathan",
      email: "staff@example.test",
      title: "Owner",
      consent: true,
      kind: "typed",
      typed_name: "Jonathan",
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await request.post(`/api/proposals/${p.id}/jobs`, { headers });
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
