import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { setup, staff, clientActor, signature } from "../tests/helpers";
import { proposalInvoiceRef } from "../src/lib/qbo-mapping";
import type { Item } from "../src/lib/model";

async function fixture(page: Page) {
  const f = await setup();
  const sent = await f.service.send(f.draft.id, staff);
  const proposal = await f.service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const reference = proposalInvoiceRef(proposal.id);
  await f.repo.put("clients", {
    ...proposal.client,
    billing_email: "billing@example.test",
  });
  const invoice = {
    number: reference,
    amount: 250000,
    currency: "USD",
    status: "Draft",
    url: "https://sandbox.qbo.intuit.com/app/invoice?txnId=89",
  };
  let state = "not_connected";
  let failed = false;
  let member = false;
  let retries = 0;
  const writes: { path: string; body: unknown }[] = [];
  const products = await f.repo.entities<Item>("pricing_items");
  const product = products.find((p) => p.interval === "one_time")!;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    let json: unknown = [];
    if (path === "/api/auth/session")
      json = {
        user: member ? { ...staff, staff_role: "member" } : staff,
        settings: f.settings,
        staff: f.members,
        app_url: "http://127.0.0.1:3100",
      };
    else if (path === "/api/connections")
      json = {
        stripe: true,
        qbo: state === "connected",
        email: true,
        mock: false,
        mode: "test",
        qbo_connection: {
          state,
          available: true,
          company: "Example Sandbox Company",
          last_sync: state === "not_connected" ? null : "2026-11-09T17:00:00Z",
        },
      };
    else if (path === "/api/connections/qbo/items")
      json = [
        { id: "123:45", name: "Web design services" },
        { id: "123:77", name: "Marketing services" },
      ].filter((item) =>
        item.name
          .toLowerCase()
          .includes(url.searchParams.get("q")?.toLowerCase() ?? ""),
      );
    else if (path === "/api/connections/qbo/terms")
      json = [{ id: "123:50", name: "Net 30" }];
    else if (path === "/api/workspace_settings" && req.method() === "POST") {
      const body = req.postDataJSON();
      writes.push({ path, body });
      Object.assign(f.settings, body);
      json = f.settings;
    } else if (path === "/api/pricing_items" && req.method() === "POST") {
      const body = req.postDataJSON();
      writes.push({ path, body });
      Object.assign(product, body);
      json = product;
    } else if (path === "/api/pricing_items") json = products;
    else if (path === `/api/proposals/${proposal.id}/quickbooks`)
      json = {
        reference,
        email: "billing@example.test",
        invoice: failed ? null : invoice,
      };
    else if (path === `/api/proposals/${proposal.id}/retry`) {
      retries++;
      failed = false;
      json = {};
    } else if (path === `/api/proposals/${proposal.id}`)
      json = {
        ...proposal,
        billing_links: [
          {
            provider: "qbo",
            status: failed ? "failed" : "succeeded",
            attempts: 1,
            external_object_id: failed ? null : "89",
            last_error: failed
              ? "QuickBooks is temporarily unavailable. Try again."
              : null,
            metadata: {
              billing_email: "billing@example.test",
              invoice: failed ? null : invoice,
            },
          },
        ],
      };
    else if (path === "/api/proposals") json = { items: [], total: 0 };
    else if (path === "/api/clients") json = await f.repo.entities("clients");
    else if (path === "/api/templates")
      json = await f.repo.entities("templates");
    await route.fulfill({ json });
  });
  return {
    proposal,
    product,
    writes,
    reference,
    state: (next: string) => (state = next),
    fail: () => (failed = true),
    staffView: () => (member = true),
    retries: () => retries,
  };
}

async function capture(page: Page, name: string, fullPage = false) {
  if (process.env.CAPTURE_QBO === "1") {
    const path = "docs/screenshots/quickbooks-sandbox";
    mkdirSync(path, { recursive: true });
    await page.screenshot({ path: `${path}/${name}.png`, fullPage });
  }
}

test("QuickBooks connection states, invoice defaults, product mapping and record retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const f = await fixture(page);
  for (const [state, action] of [
    ["not_connected", "Connect QuickBooks"],
    ["connected", "Disconnect"],
    ["reconnect", "Reconnect QuickBooks"],
  ]) {
    f.state(state);
    await page.goto("/studio/connections?view=qbo");
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: action, exact: true }),
    ).toBeEnabled();
    await capture(page, `connection-${state}-1440`);
  }

  f.state("connected");
  await page.goto("/studio/workspace?view=billing");
  const delivery = page.getByRole("combobox", { name: "QuickBooks invoices" });
  await expect(delivery).toHaveValue("draft");
  await delivery.selectOption("email");
  await expect
    .poll(() =>
      f.writes.some(
        (w) =>
          w.path === "/api/workspace_settings" &&
          (w.body as { qbo_invoice_delivery?: string }).qbo_invoice_delivery ===
            "email",
      ),
    )
    .toBe(true);
  await page
    .getByRole("combobox", { name: "Default QuickBooks item", exact: true })
    .selectOption("123:45");
  await expect
    .poll(() =>
      f.writes.some(
        (w) =>
          w.path === "/api/workspace_settings" &&
          (w.body as { qbo_custom_item_ref?: string }).qbo_custom_item_ref ===
            "123:45",
      ),
    )
    .toBe(true);
  await page.getByText("More billing settings", { exact: true }).click();
  const terms = page.getByRole("combobox", { name: "Default invoice terms" });
  await terms.selectOption("123:50");
  await expect
    .poll(() =>
      f.writes.some(
        (w) =>
          w.path === "/api/workspace_settings" &&
          (w.body as { qbo_term_ref?: string }).qbo_term_ref === "123:50",
      ),
    )
    .toBe(true);
  await terms.scrollIntoViewIfNeeded();
  await capture(page, "billing-defaults-1440");

  await page.goto(`/clients/${f.proposal.client.id}`);
  await page.getByRole("button", { name: "Edit client" }).click();
  await expect(
    page.getByRole("textbox", { name: "Billing email" }),
  ).toHaveValue("billing@example.test");
  await capture(page, "edit-client-billing-email-1440");

  await page.goto(`/studio/products?item=${f.product.id}`);
  const mapping = page.getByRole("combobox", {
    name: "QuickBooks item",
    exact: true,
  });
  await page
    .getByRole("searchbox", { name: "Search quickbooks item by name" })
    .fill("web");
  await mapping.selectOption("123:45");
  await mapping.scrollIntoViewIfNeeded();
  await capture(page, "product-item-picker-1440");
  await page
    .getByRole("button", { name: "Save item and terms", exact: true })
    .click();
  await expect
    .poll(() =>
      f.writes.some(
        (w) =>
          w.path === "/api/pricing_items" &&
          (w.body as { qbo_item_ref?: string }).qbo_item_ref === "123:45",
      ),
    )
    .toBe(true);

  await page.goto(`/proposals/${f.proposal.id}`);
  const invoice = page.getByText(`Invoice ${f.reference}`, { exact: true });
  await expect(invoice).toBeVisible();
  await expect(
    page.getByText("Invoices go to billing@example.test"),
  ).toBeVisible();
  await invoice.scrollIntoViewIfNeeded();
  await capture(page, "record-draft-invoice-1440");
  f.fail();
  await page.reload();
  const retry = page.getByRole("button", { name: "Retry QuickBooks" });
  await expect(retry).toBeVisible();
  await retry.scrollIntoViewIfNeeded();
  await capture(page, "record-retry-1440");
  await retry.click();
  await expect.poll(f.retries).toBe(1);
});

for (const width of [1440, 375]) {
  test(`QuickBooks Studio controls are accessible at ${width} and restricted for Staff`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 920 });
    const f = await fixture(page);
    f.state("connected");
    await page.goto("/studio/connections");
    await expect(
      page.getByText("Connected to Example Sandbox Company · sandbox"),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    f.staffView();
    await page.goto("/studio/workspace?view=billing");
    await expect(
      page.getByRole("combobox", { name: "QuickBooks invoices" }),
    ).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
