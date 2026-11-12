import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "../tests/helpers";
import { proposalInvoiceRef } from "../src/lib/qbo-mapping";
import type { Item } from "../src/lib/model";

async function fixture(page: Page) {
  const f = await setup();
  const sent = await f.service.send(f.draft.id, staff);
  const clientSigned = await f.service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const proposal = await f.service.sign(
    clientSigned.id,
    companyConsent(clientSigned.revision, f.settings),
    "company",
    staff,
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
  let stripeSynced = true;
  let finishSync: (() => void) | undefined;
  let syncGate: Promise<void> | undefined;
  let overviewReview = false;
  let awaiting = false;
  const drafts = ["Website and care", "Accessibility audit"].map(
    (title, i) => ({
      ...proposal,
      id: crypto.randomUUID(),
      title,
      client: {
        ...proposal.client,
        company: i ? "Brightline Foods" : "Harbor Dental",
      },
      billing_links: [
        {
          provider: "qbo",
          status: "succeeded",
          attempts: 1,
          external_object_id: String(i + 100),
          metadata: { invoice },
        },
      ],
    }),
  );
  const waiting = ["Local visibility", "Website build"].map((title, i) => ({
    ...proposal,
    id: crypto.randomUUID(),
    title,
    client: { ...proposal.client, company: i ? "Cedar Law" : "Lumen Yoga" },
  }));
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
    else if (path === "/api/connections/qbo/refresh") {
      writes.push({ path, body: null });
      json = {
        state,
        available: true,
        company: "Example Sandbox Company",
        last_sync: "2026-11-09T17:00:00Z",
      };
    } else if (path === "/api/connections/qbo/disconnect") {
      writes.push({ path, body: null });
      state = "not_connected";
      json = { state, available: true };
    } else if (path === "/api/catalog-sync/stripe") {
      syncs++;
      await syncGate;
      stripeSynced = true;
      json = { imported: products.length };
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
              lastSync: stripeSynced ? "2026-11-09T17:00:00Z" : undefined,
              lastBillingEvent: path.includes("/stripe/")
                ? "2026-11-09T16:58:00Z"
                : undefined,
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
      json = awaiting
        ? clientSigned
        : {
            ...proposal,
            billing_links: [
              {
                provider: "qbo",
                status: review
                  ? "needs_review"
                  : failed
                    ? "failed"
                    : "succeeded",
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
    else if (path === "/api/proposals") {
      const items = [
        ...drafts,
        sent,
        { ...sent, id: crypto.randomUUID(), status: "viewed" },
        ...(state === "reconnect" ? waiting : []),
        ...(overviewReview
          ? [
              {
                ...waiting[1],
                billing_links: [
                  {
                    provider: "qbo",
                    status: "needs_review",
                    attempts: 1,
                    metadata: { customer_candidates: [{ id: "10" }] },
                  },
                ],
              },
            ]
          : []),
      ];
      json = { items, total: items.length };
    } else if (path === "/api/clients") json = await f.repo.entities("clients");
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
    awaiting: () => (awaiting = true),
    overviewReview: (value: boolean) => (overviewReview = value),
    startUnsynced: () => {
      stripeSynced = false;
      syncGate = new Promise<void>((resolve) => {
        finishSync = resolve;
      });
      return () => finishSync?.();
    },
    retries: () => retries,
  };
}

async function capture(page: Page, name: string, fullPage = false) {
  if (
    process.env.CAPTURE_R21 === "1" &&
    /^(3[a-k]-|connection-|home-|invoice-awaiting-)/.test(name)
  ) {
    const path = "docs/screenshots/redesign-21-a";
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
  const row = page
    .locator(".record-billing-row")
    .filter({ hasText: "One-time" });
  const invoice = row
    .locator("summary")
    .filter({ hasText: `QuickBooks invoice ${f.reference}` });
  await expect(invoice).toBeVisible();
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  const invoiceLabel = row.getByText("One-time", { exact: true });
  const labelBox = (await invoiceLabel.boundingBox())!;
  const invoiceBox = (await invoice.boundingBox())!;
  // Billing sits in the narrow side column: the description stacks under
  // its label, aligned to the same left edge.
  expect(invoiceBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height - 2);
  expect(Math.abs(invoiceBox.x - labelBox.x)).toBeLessThanOrEqual(24);
  await invoice.click();
  await expect(
    row.getByText("Invoices go to billing@example.test"),
  ).toBeVisible();
  await expect(
    row.getByRole("link", { name: "Open in QuickBooks" }),
  ).toBeVisible();
  // Sandbox invoices open in the sandbox company, never live QuickBooks.
  await expect(
    row.getByRole("link", { name: "Open in QuickBooks" }),
  ).toHaveAttribute("href", /^https:\/\/app\.sandbox\.qbo\.intuit\.com\//);
  await invoice.click();
  await invoice.scrollIntoViewIfNeeded();
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

test("Home keeps the three areas in place and shows one compact Expiring message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await fixture(page);
  await page.goto("/");
  const pipeline = page.getByRole("region", { name: /Pipeline/ });
  const expiring = page.getByRole("region", { name: "Expiring this week" });
  await expect(pipeline).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pricing references" }),
  ).toHaveCount(0);
  await expect(
    expiring.getByRole("link", { name: "View all", exact: true }),
  ).toBeVisible();
  await expect(
    expiring.getByText("Nothing closes in the next 7 days."),
  ).toBeVisible();
  await expect(expiring.locator("p")).toHaveCount(1);
  await expect(expiring.locator("svg.lucide-check")).toHaveCount(1);
  const bar = pipeline.locator(".home-pipeline-bar");
  await expect(bar).toHaveCSS("border-radius", "4px");
  await expect(bar.locator("span")).toHaveCount(3);
  await expect(bar.locator("span").first()).toHaveCSS("border-radius", "0px");
  expect((await expiring.boundingBox())!.height).toBeLessThan(
    (await pipeline.boundingBox())!.height,
  );
  expect((await expiring.boundingBox())!.x).toBeGreaterThan(
    (await pipeline.boundingBox())!.x,
  );
  await capture(page, "home-1440");
});

test("The signed proposal record shows the invoice waiting for the company without a billing error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const f = await fixture(page);
  f.awaiting();
  await page.goto(`/proposals/${f.proposal.id}`);
  const billing = page.locator(".record-billing");
  await expect(
    billing.getByText("Waiting for countersignature", { exact: true }),
  ).toBeVisible();
  await expect(
    billing.getByText(
      "After both sides sign, one-time fees are invoiced from QuickBooks.",
    ),
  ).toBeVisible();
  await expect(
    billing.getByRole("button", { name: "Retry billing" }),
  ).toHaveCount(0);
  await billing.scrollIntoViewIfNeeded();
  await capture(page, "invoice-awaiting-countersignature-1440");
});

test("R21 desktop connection states use actual actions and link to affected proposals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const f = await fixture(page);
  Object.assign(f.settings, {
    qbo_custom_item_ref: "123:45",
    qbo_term_ref: "123:50",
  });
  const detail = page.locator(".studio-connection-detail");
  const headerChip = detail.locator(".connection-detail-title .pill");
  await page.goto("/studio/connections");
  await page
    .getByRole("link", { name: "Connect QuickBooks", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio\/connections\/quickbooks$/);
  await expect(headerChip).toHaveText("Not connected");
  await expect(
    detail.getByRole("button", { name: "Connect to QuickBooks" }),
  ).toBeEnabled();
  await capture(page, "3i-quickbooks-not-connected");

  f.state("connected");
  f.overviewReview(true);
  await page.goto("/studio/connections?view=qbo");
  await expect(headerChip).toHaveText("Connected · sandbox");
  await expect(detail.locator(".connection-tile")).toHaveCount(3);
  await expect(detail.getByText("2 drafts to review")).toBeVisible();
  await expect(detail.getByText("1 to choose")).toBeVisible();
  await expect(
    detail.getByText(/Web design services/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("Net 30", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", { name: f.proposal.title }),
  ).toHaveAttribute("href", `/proposals/${f.proposal.id}`);
  await capture(page, "3e-quickbooks-connected");
  await detail.getByRole("link", { name: "Choose customer" }).click();
  await expect(
    detail.getByRole("link", { name: "Cedar Law · Website build" }),
  ).toBeVisible();
  await detail.getByRole("link", { name: "Review drafts" }).click();
  await expect(
    detail.getByRole("link", { name: "Harbor Dental · Website and care" }),
  ).toBeVisible();

  f.overviewReview(false);
  await page.reload();
  await detail.getByRole("button", { name: "QuickBooks actions" }).click();
  const menu = page.getByRole("dialog", { name: "QuickBooks actions" });
  await expect(
    menu.getByRole("button", { name: "Refresh connection" }),
  ).toBeVisible();
  await capture(page, "3f-quickbooks-menu");
  await menu.getByRole("button", { name: "Refresh connection" }).click();
  await expect
    .poll(() => f.writes.at(-1)?.path)
    .toBe("/api/connections/qbo/refresh");
  await expect(
    detail.getByText("QuickBooks connection refreshed.", { exact: true }),
  ).toBeVisible();

  f.state("reconnect");
  await page.reload();
  await expect(headerChip).toHaveText("Reconnect needed");
  await expect(
    detail.getByRole("heading", { name: "Waiting on QuickBooks" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Lumen Yoga · Local visibility" }),
  ).toBeVisible();
  await capture(page, "3h-quickbooks-reconnect");
  await detail.getByRole("button", { name: "QuickBooks actions" }).click();
  await menu
    .getByRole("button", { name: "Disconnect from QuickBooks…" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Disconnect QuickBooks?" });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(
    confirm.getByText("2 proposals are waiting on an invoice"),
  ).toBeVisible();
  await capture(page, "3g-quickbooks-disconnect");
  await confirm.getByRole("button", { name: "Disconnect" }).click();
  await expect(headerChip).toHaveText("Not connected");
  await expect
    .poll(() => f.writes.at(-1)?.path)
    .toBe("/api/connections/qbo/disconnect");

  await page.goto("/studio/connections?view=stripe");
  await expect(page).toHaveURL(/\/studio\/connections\/stripe$/);
  await expect(headerChip).toHaveText("Connected · test mode");
  await expect(detail.getByText("Receiving", { exact: true })).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Edit in Billing defaults" }),
  ).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await capture(page, "3a-stripe-connected");
  await detail.getByRole("button", { name: "Stripe actions" }).click();
  const stripeMenu = page.getByRole("dialog", { name: "Stripe actions" });
  await expect(
    stripeMenu.getByRole("button", { name: "Sync products now" }),
  ).toBeVisible();
  await expect(
    stripeMenu.getByText(/Switch to live|Disconnect Stripe/),
  ).toHaveCount(0);
  await capture(page, "3b-stripe-menu");
  await page.keyboard.press("Escape");

  const finish = f.startUnsynced();
  try {
    await page.reload();
    await detail.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(
      detail.getByRole("heading", { name: "Setting up Stripe products" }),
    ).toBeVisible();
    await capture(page, "3d-stripe-sync");
  } finally {
    finish();
  }
  await expect.poll(f.syncs).toBe(1);
  await expect(detail.getByText("Stripe test products synced.")).toBeVisible();
  f.stripe(false);
  await page.reload();
  await expect(headerChip).toHaveText("Not connected");
  await expect(
    detail.getByText("Stripe is set up by your Yeswell administrator."),
  ).toBeVisible();
  await capture(page, "3c-stripe-not-connected");

  f.staffView();
  await page.goto("/studio/connections/quickbooks");
  await expect(
    detail.getByRole("heading", { name: "A super admin connects QuickBooks" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Email Alex" }),
  ).toHaveAttribute("href", "mailto:staff@example.test");
  await capture(page, "3j-quickbooks-staff");
  for (const key of ["email", "assistants", "imports"]) {
    await page.goto(`/studio/connections?view=${key}`);
    await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(detail.locator(".connection-tile")).toHaveCount(3);
    await capture(page, `connection-${key}-1440`);
  }
});

test("R21 phone tiles stack and the QuickBooks menu opens from the bottom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const f = await fixture(page);
  f.state("connected");
  Object.assign(f.settings, {
    qbo_custom_item_ref: "123:45",
    qbo_term_ref: "123:50",
  });
  await page.goto("/studio/connections/quickbooks");
  const detail = page.locator(".studio-connection-detail");
  await expect(
    detail.getByRole("heading", { level: 1, name: "QuickBooks" }),
  ).toHaveCSS("color", "rgb(242, 245, 245)");
  const tiles = detail.locator(".connection-tile");
  await expect(tiles).toHaveCount(3);
  expect((await tiles.nth(1).boundingBox())!.y).toBeGreaterThan(
    (await tiles.first().boundingBox())!.y,
  );
  await expect(
    detail.getByText("Net 30", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await capture(page, "3k-quickbooks-phone");
  await detail.getByRole("button", { name: "QuickBooks actions" }).click();
  const sheet = page.getByRole("dialog", { name: "QuickBooks actions" });
  await expect(
    sheet.getByRole("button", { name: "Refresh connection" }),
  ).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(812, 0);
  await capture(page, "3k-quickbooks-phone-menu");
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

test("Connections and setup use the official provider artwork", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page);
  let authorizations = 0;
  await page.route("**/api/connections/qbo/authorize", async (route) => {
    expect(route.request().method()).toBe("POST");
    authorizations++;
    await route.fulfill({
      json: { url: "/studio/connections/quickbooks?brand-fixture=connected" },
    });
  });
  const evidence = "docs/screenshots/reports-provider-polish";
  async function captureBrand(name: string) {
    if (process.env.CAPTURE_REPORT_POLISH !== "1") return;
    mkdirSync(evidence, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${evidence}/${name}.png`,
      animations: "disabled",
    });
  }
  async function expectMarks(...providers: string[]) {
    await expect(
      page.getByRole("status", { name: "Loading connection…" }),
    ).toHaveCount(0);
    for (const provider of providers) {
      const mark = page.locator(`[data-provider-mark="${provider}"]`);
      await expect(mark).toBeVisible();
      const bounds = (await mark.boundingBox())!;
      const image = (await mark.locator("img").boundingBox())!;
      expect(image.height).toBeGreaterThanOrEqual(16);
      expect(bounds.width).toBeGreaterThanOrEqual(image.width * 2);
      await expect
        .poll(() =>
          mark
            .locator("img")
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0);
    }
  }
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (mode) => localStorage.setItem("proposal-theme", mode),
      theme,
    );
    f.state("not_connected");
    await page.goto("/studio/connections");
    await expectMarks("stripe", "qbo");
    await captureBrand(`connections-${theme}-1440`);
    await page.goto("/studio/connections/quickbooks");
    await expectMarks("qbo");
    const connect = page.getByRole("button", { name: "Connect to QuickBooks" });
    const base = connect.locator('img[src$="-default.svg"]');
    const hover = connect.locator('img[src$="-hover.svg"]');
    await expect(base).toBeVisible();
    await expect(base).toHaveCSS("width", "223px");
    await expect(base).toHaveCSS("height", "36px");
    await expect(connect).toHaveCSS("height", "44px");
    await captureBrand(`quickbooks-connect-${theme}-1440`);
    await connect.hover();
    await expect(hover).toBeVisible();
    f.state("connected");
    await connect.click();
    await expect(page).toHaveURL(/brand-fixture=connected$/);
    await expectMarks("qbo");
    await expect(connect).toHaveCount(0);
    await captureBrand(`quickbooks-connected-${theme}-1440`);
    await page.goto("/studio/connections/stripe");
    await expectMarks("stripe");
    await captureBrand(`stripe-connected-${theme}-1440`);
  }
  expect(authorizations).toBe(2);
  await page.route("**/api/proposals?*", (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.goto("/");
  await expectMarks("stripe", "qbo");
  await captureBrand("setup-checklist-1440");
});
