import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setup } from "../tests/helpers";

const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const captures = "docs/screenshots/client-records";

test("client records put contact first on narrow screens and keep billing history when archived", async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(10000);
  const { draft, settings } = await setup();
  const templateId = randomUUID(),
    buildId = randomUUID(),
    careId = randomUUID();
  for (const [entity, data] of [
    ["workspace_settings", settings],
    [
      "pricing_items",
      {
        id: buildId,
        sku: `build-${buildId}`,
        name: "Website build",
        amount: 375000,
        interval: "one_time",
        qbo_item_ref: "mock_build",
      },
    ],
    [
      "pricing_items",
      {
        id: careId,
        sku: `care-${careId}`,
        name: "Website care",
        amount: 10000,
        interval: "month",
        stripe_lookup_key: "mock_care",
      },
    ],
    [
      "templates",
      {
        id: templateId,
        name: "Client record test",
        active: true,
        content: [
          { type: "heading", text: "Website and care" },
          { type: "paragraph", text: "Prepared for {{client.company}}." },
          { type: "pricing_table" },
          { type: "signature_block", role: "client" },
          { type: "signature_block", role: "company" },
        ],
        default_quote: [buildId, careId].map((id) => ({
          pricing_item_id: id,
          qty: 1,
          optional: false,
          selected: true,
        })),
      },
    ],
  ] as const) {
    const configured = await request.post(`/api/${entity}`, { headers, data });
    expect(configured.ok(), await configured.text()).toBe(true);
  }
  async function createClient(company: string) {
    const client = {
      ...draft.client,
      id: randomUUID(),
      company,
      first_name: "Elena",
      last_name: "Rivera",
      email: `elena-${randomUUID().slice(0, 8)}@example.test`,
      phone: "+17045550123",
      title: "Owner",
      address: {
        line1: "123 Main Street",
        city: "Charlotte",
        region: "NC",
        postal_code: "28202",
        country: "US",
      },
    };
    const response = await request.post("/api/clients", {
      headers,
      data: client,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return client;
  }
  async function createProposal(clientId: string, title: string) {
    const response = await request.post("/api/proposals", {
      headers,
      data: { client_id: clientId, template_id: templateId, title },
    });
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
  }
  const client = await createClient("Harbor Dental"),
    empty = await createClient("Juniper Studio"),
    eligible = await createClient("Maple Bakery");
  const sent = await createProposal(client.id, "Website and monthly care");
  const delivery = await request.post(`/api/proposals/${sent.id}/send`, {
    headers,
    data: { revision: sent.revision, delivery_method: "manual" },
  });
  expect(delivery.ok(), await delivery.text()).toBe(true);
  const disposable = await createProposal(
    eligible.id,
    "Unsent homepage concept",
  );
  const archived = await request.post(
    `/api/proposals/${disposable.id}/actions`,
    {
      headers,
      data: { action: "archive", revision: disposable.revision },
    },
  );
  expect(archived.ok(), await archived.text()).toBe(true);

  const capture = process.env.CAPTURE_CLIENT_RECORDS === "1";
  if (capture) await mkdir(captures, { recursive: true });
  async function screenshot(name: string, width: number, fullPage = true) {
    if (!capture) return;
    await page.evaluate(() => document.fonts.ready);
    const viewport = page.viewportSize()!;
    if (fullPage) {
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      if (height > viewport.height)
        await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
    }
    await page.screenshot({
      path: `${captures}/${name}-${width}.png`,
      fullPage,
      animations: "disabled",
    });
    if (fullPage) await page.setViewportSize(viewport);
  }
  const clientActions = () =>
    page.getByRole("button", { name: "Client actions" });
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 844 : 950 });
    await page.goto(`/clients/${client.id}`);
    await expect(
      page.getByRole("heading", { name: client.company, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Open ${client.company}: ${sent.title}` }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.locator(".client-detail-header .action")).toHaveCount(1);
    // The header actions sit at the page edge, not the end of the name.
    const [actions, columns] = await Promise.all(
      [".client-record-actions", ".client-record-columns"].map((selector) =>
        page.locator(selector).boundingBox(),
      ),
    );
    expect(
      Math.abs(actions!.x + actions!.width - (columns!.x + columns!.width)),
    ).toBeLessThan(2);
    const [contact, proposals, billing, notes, activity] = await Promise.all(
      [
        ".client-contact-card",
        ".client-proposals",
        ".client-billing",
        ".client-notes",
        ".client-activity",
      ].map((selector) => page.locator(selector).boundingBox()),
    );
    expect(proposals!.y).toBeLessThan(activity!.y);
    expect(contact!.y).toBeLessThan(billing!.y);
    expect(billing!.y).toBeLessThan(notes!.y);
    if (width === 1440) expect(proposals!.x).toBeLessThan(contact!.x);
    else {
      expect(contact!.y).toBeLessThan(proposals!.y);
      expect(proposals!.y).toBeLessThan(billing!.y);
      expect(notes!.y).toBeLessThan(activity!.y);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await screenshot("populated", width);
    await clientActions().click();
    await expect(
      page.getByRole("button", { name: "Delete client" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Archive client" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "This client has proposal history that must be kept.",
    );
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await screenshot("archive-confirm", width, false);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await page.goto(`/clients/${empty.id}`);
    await expect(page.getByText("No proposals yet.")).toBeVisible();
    await expect(page.getByText("No notes yet.")).toBeVisible();
    await screenshot("empty", width);

    await page.goto(`/clients/${eligible.id}`);
    await clientActions().click();
    await page.getByRole("button", { name: "Delete client" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "This also deletes 1 archived draft that never went to the client.",
    );
    await screenshot("delete-confirm", width, false);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
  }

  await clientActions().click();
  await page.getByRole("button", { name: "Delete client" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: `Delete ${eligible.company}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/clients$/);
  expect(
    (
      await request.get(`/api/proposals/${disposable.id}`, { headers })
    ).status(),
  ).toBe(404);

  await page.goto(`/clients/${client.id}`);
  await clientActions().click();
  await page.getByRole("button", { name: "Archive client" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive client" })
    .click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New proposal", exact: true }),
  ).toHaveCount(0);
  await page.goto("/clients");
  await page
    .getByRole("searchbox", { name: "Search clients" })
    .or(page.getByRole("textbox", { name: "Search clients" }))
    .fill(client.company);
  const link = page.getByRole("link", {
    name: `Open ${client.company}`,
    exact: true,
  });
  await expect(link).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(link).toBeVisible();
  await link.click();
  await clientActions().click();
  await page.getByRole("button", { name: "Restore client" }).click();
  await expect(
    page.getByRole("link", { name: "New proposal", exact: true }),
  ).toBeVisible();
  expect(
    (await request.get(`/api/proposals/${sent.id}`, { headers })).ok(),
  ).toBe(true);
});
