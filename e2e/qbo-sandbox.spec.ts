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
  let review = false;
  let stripe = true;
  let syncs = 0;
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
        stripe,
        stripe_webhooks_configured: stripe,
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
    else if (path === "/api/connections/qbo/disconnect") {
      writes.push({ path, body: null });
      state = "not_connected";
      json = { state, available: true };
    } else if (path === "/api/catalog-sync/stripe") {
      syncs++;
      json = {};
    } else if (
      path.endsWith("/activity") &&
      path.startsWith("/api/connections/")
    )
      json =
        state !== "not_connected" || (path.includes("/stripe/") && stripe)
          ? {
              connected: {
                actor: staff.actor,
                name: "Alex Morgan",
                created_at: "2026-11-09T15:04:00Z",
              },
              lastSync: "2026-11-09T17:00:00Z",
              rows: [
                {
                  id: "invoice",
                  label: path.includes("/stripe/")
                    ? "Subscription created"
                    : "Invoice created",
                  proposal_id: proposal.id,
                  detail: proposal.title,
                  created_at: "2026-11-09T17:00:00Z",
                },
                {
                  id: "refresh",
                  label: path.includes("/stripe/")
                    ? "Products synced"
                    : "QuickBooks connection refreshed",
                  created_at: "2026-11-09T16:00:00Z",
                },
              ],
            }
          : { rows: [] };
    else if (path === "/api/connections/qbo/items")
      json = url.searchParams.has("ref")
        ? { id: "123:45", name: "Web design services" }
        : [
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
    else if (path === `/api/proposals/${proposal.id}/quickbooks`) {
      if (req.method() === "POST") {
        writes.push({ path, body: req.postDataJSON() });
        review = false;
      }
      json = {
        reference,
        email: "billing@example.test",
        invoice: failed || review ? null : invoice,
      };
    } else if (path === `/api/proposals/${proposal.id}/retry`) {
      retries++;
      failed = false;
      json = {};
    } else if (path === `/api/proposals/${proposal.id}`)
      json = {
        ...proposal,
        billing_links: [
          {
            provider: "qbo",
            status: review ? "needs_review" : failed ? "failed" : "succeeded",
            attempts: 1,
            external_object_id: failed || review ? null : "89",
            last_error: review
              ? "A QuickBooks customer named Jane Martin exists with a different email. Choose that customer or create a new one."
              : failed
                ? "QuickBooks is temporarily unavailable. Try again."
                : null,
            metadata: {
              billing_email: "billing@example.test",
              invoice: failed || review ? null : invoice,
              ...(review
                ? {
                    customer_review_reason: "name",
                    customer_candidates: [
                      {
                        id: "10",
                        display_name: "Jane Martin",
                        company: "Example Studio",
                        email: "jane.old@example.test",
                      },
                      {
                        id: "11",
                        display_name: "Jane at Northwind",
                        company: "Northwind Design",
                        email: "jane@northwind.example.test",
                      },
                    ],
                  }
                : {}),
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
    review: () => (review = true),
    stripe: (value: boolean) => (stripe = value),
    syncs: () => syncs,
    settings: f.settings,
    staffView: () => (member = true),
    retries: () => retries,
  };
}

async function capture(page: Page, name: string, fullPage = false) {
  if (process.env.CAPTURE_QBO === "1") {
    const path = "docs/screenshots/quickbooks-customer-review";
    mkdirSync(path, { recursive: true });
    await page.screenshot({ path: `${path}/${name}.png`, fullPage });
  }
}

test("QuickBooks connection states, invoice defaults, product mapping and record retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const f = await fixture(page);
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
  const defaultItem = page.getByRole("combobox", {
    name: "Default QuickBooks item",
    exact: true,
  });
  await defaultItem.fill("web");
  await expect(
    page.getByRole("option", { name: "Web design services" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Marketing services" }),
  ).toHaveCount(0);
  await defaultItem.evaluate((input) =>
    input.scrollIntoView({ block: "center" }),
  );
  await capture(page, "billing-default-item-1440");
  await defaultItem.press("ArrowDown");
  await defaultItem.press("Enter");
  await expect(defaultItem).toHaveValue("Web design services");
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

  await page.goto(`/studio/products?item=${f.product.id}`);
  const mapping = page.getByRole("combobox", {
    name: "QuickBooks item",
    exact: true,
  });
  await mapping.fill("web");
  const productOption = page.getByRole("option", {
    name: "Web design services",
  });
  await expect(productOption).toBeVisible();
  await mapping.evaluate((input) => input.scrollIntoView({ block: "center" }));
  await capture(page, "product-item-picker-1440");
  await productOption.click();
  await expect(mapping).toHaveValue("Web design services");
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

  await page.route("**/api/connections/qbo/items?*", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto(`/studio/products?item=${f.product.id}`);
  await mapping.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "QuickBooks choices are temporarily unavailable." }),
  ).toBeVisible();
  await expect(
    page.getByText("More product details", { exact: true }),
  ).toBeVisible();

  await page.goto(`/proposals/${f.proposal.id}`);
  const invoice = page.getByText(`Invoice ${f.reference}`, { exact: true });
  await expect(invoice).toBeVisible();
  await expect(
    page.getByText("Invoices go to billing@example.test"),
  ).toBeVisible();
  await invoice.scrollIntoViewIfNeeded();
  const invoiceLabel = page.getByText("One-time invoice", { exact: true });
  const labelBox = (await invoiceLabel.boundingBox())!;
  const invoiceBox = (await invoice.boundingBox())!;
  expect(invoiceBox.y).toBeGreaterThan(labelBox.y + labelBox.height);
  expect(Math.abs(invoiceBox.x - labelBox.x)).toBeLessThanOrEqual(1);
  await capture(page, "record-draft-invoice-1440");
  f.fail();
  await page.reload();
  const retry = page.getByRole("button", {
    name: "Retry billing",
    exact: true,
  });
  await expect(retry).toHaveCount(1);
  await expect(retry).toBeVisible();
  await retry.scrollIntoViewIfNeeded();
  await capture(page, "record-retry-1440");
  await retry.click();
  await expect.poll(f.retries).toBe(1);
});

test("customer review shows candidate details and sends the selected or create-new decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const f = await fixture(page);
  const path = `/api/proposals/${f.proposal.id}/quickbooks`;
  f.review();
  await page.goto(`/proposals/${f.proposal.id}`);
  await expect(
    page.getByText(/A QuickBooks customer named Jane Martin exists/),
  ).toBeVisible();
  const chooser = page.getByRole("group", {
    name: "Choose a QuickBooks customer",
  });
  const candidate = chooser.getByRole("radio", {
    name: /Jane Martin.*Example Studio.*jane.old@example.test/,
  });
  await expect(candidate).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use this customer" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry billing", exact: true }),
  ).toHaveCount(0);
  await candidate.check();
  await page
    .getByRole("button", { name: "Use this customer" })
    .scrollIntoViewIfNeeded();
  await capture(page, "customer-chooser-1440");
  await page.getByRole("button", { name: "Use this customer" }).click();
  await expect
    .poll(() => f.writes.at(-1))
    .toEqual({ path, body: { customer: "10" } });
  await expect(chooser).toHaveCount(0);
  f.review();
  await page.reload();
  await page.getByRole("button", { name: "Create new customer" }).click();
  await expect
    .poll(() => f.writes.at(-1))
    .toEqual({ path, body: { customer: null } });
  await expect(chooser).toHaveCount(0);
});

for (const width of [1440, 375]) {
  test(`connection details use the Studio shell and show provider states at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1080 });
    const f = await fixture(page);
    Object.assign(f.settings, {
      qbo_custom_item_ref: "123:45",
      qbo_term_ref: "123:50",
    });
    await page.goto("/studio/connections");
    await page
      .getByRole("link", { name: "Connect QuickBooks", exact: true })
      .click();
    await expect(page).toHaveURL(/\/studio\/connections\/quickbooks$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "QuickBooks" }),
    ).toBeVisible();
    for (const [state, label] of [
      ["not_connected", "Not connected"],
      ["connected", "Connected · sandbox"],
      ["reconnect", "Reconnect needed"],
    ]) {
      f.state(state);
      await page.goto("/studio/connections?view=qbo");
      await expect(page).toHaveURL(/\/studio\/connections\/quickbooks$/);
      const detail = page.locator(".studio-connection-detail");
      await expect(detail.locator(".pill")).toHaveText(label);
      await expect(
        detail.getByRole("heading", { name: "Recent activity" }),
      ).toBeVisible();
      if (state === "connected") {
        await expect(
          detail.getByText(/Nov 9, .*:00 [AP]M/).first(),
        ).toBeVisible();
        await expect(
          detail.getByText("Web design services", { exact: true }),
        ).toBeVisible();
        await expect(detail.getByText("Net 30", { exact: true })).toBeVisible();
        await expect(
          detail.getByRole("link", { name: f.proposal.title }),
        ).toHaveAttribute("href", `/proposals/${f.proposal.id}`);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
      }
      await capture(page, `quickbooks-${state}-${width}`);
    }
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    const confirm = page.getByRole("dialog", {
      name: "Disconnect QuickBooks?",
    });
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    if (width === 1440)
      await capture(page, "quickbooks-disconnect-confirm-1440");
    await confirm.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.locator(".connection-detail-title .pill")).toHaveText(
      "Not connected",
    );
    await expect
      .poll(() => f.writes.at(-1)?.path)
      .toBe("/api/connections/qbo/disconnect");
    for (const connected of [true, false]) {
      f.stripe(connected);
      await page.goto("/studio/connections?view=stripe");
      await expect(page).toHaveURL(/\/studio\/connections\/stripe$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Stripe" }),
      ).toBeVisible();
      await expect(page.locator(".connection-detail-title .pill")).toHaveText(
        connected ? "Connected · test mode" : "Not connected",
      );
      if (connected) {
        await page
          .getByRole("button", { name: "Sync now", exact: true })
          .click();
        await expect.poll(f.syncs).toBe(1);
        await expect(
          page.getByText("Stripe test products synced."),
        ).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await page.reload();
        await expect(
          page.getByText("Products synced", { exact: true }),
        ).toBeVisible();
      }
      await capture(
        page,
        `stripe-${connected ? "connected" : "not_connected"}-${width}`,
      );
    }
    if (width === 1440) {
      for (const key of ["email", "assistants", "imports"]) {
        await page.goto(`/studio/connections?view=${key}`);
        await expect(
          page.locator(".studio-connection-detail h1"),
        ).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await capture(page, `connection-${key}-1440`);
      }
    }
  });
}

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
