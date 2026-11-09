import { expect, it, vi } from "vitest";
import { QboProvider } from "../src/lib/providers/qbo";
import {
  QBO_CALLBACK,
  type QboConfig,
} from "../src/lib/providers/qbo-connection";
import { decryptSecret, encryptSecret } from "../src/lib/providers/secrets";
import { bill, MockBillingProvider } from "../src/lib/billing";
import { readiness } from "../src/lib/quote";
import { billingLines } from "../src/lib/quote-model";
import { proposalInvoiceRef } from "../src/lib/qbo-mapping";
import { providerActivity } from "../src/lib/studio";
import type { Client, Item } from "../src/lib/model";
import { postgresFixture } from "./postgres-fixture";
import { setup, staff, clientActor, signature } from "./helpers";

const origin = "https://yeswell.example.test";
const config: QboConfig = {
  clientId: "sandbox-fixture-id",
  clientSecret: "sandbox-fixture-secret",
  environment: "sandbox",
  encryptionKey: Buffer.alloc(32, 3).toString("base64"),
  redirectUri: origin + QBO_CALLBACK,
};
type FixtureCustomer = {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
};
function sandbox() {
  let matches: FixtureCustomer[] = [
    {
      Id: "10",
      DisplayName: "Acme Sandbox",
      PrimaryEmailAddr: { Address: "billing@example.test" },
    },
  ];
  let invoice: any;
  let loseCustomerResponse = false;
  const customerCreates: {
    body: Record<string, unknown>;
    requestId: string | null;
  }[] = [];
  const customerReads: string[] = [];
  let emailDown = false;
  let loseCreateResponse = false;
  const tokenBodies: URLSearchParams[] = [];
  const creates: { body: any; requestId: string | null }[] = [];
  const deliveries: string[] = [];
  const revocations: string[] = [];
  const queries: string[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "oauth.platform.intuit.com") {
        const body = init!.body as URLSearchParams;
        tokenBodies.push(body);
        return Response.json({
          access_token: "access-" + tokenBodies.length,
          refresh_token: "rotation-" + tokenBodies.length,
          expires_in: 3600,
        });
      }
      if (url.hostname === "developer.api.intuit.com") {
        revocations.push(JSON.parse(String(init?.body)).token);
        return Response.json({});
      }
      expect(url.hostname).toBe("sandbox-quickbooks.api.intuit.com");
      const path = url.pathname.split("/").slice(4).join("/");
      if (path.startsWith("companyinfo/"))
        return Response.json({ CompanyInfo: { CompanyName: "Acme Sandbox" } });
      if (path === "preferences")
        return Response.json({
          Preferences: { SalesFormsPrefs: { CustomTxnNumbers: true } },
        });
      if (path === "query") {
        const query = url.searchParams.get("query")!;
        queries.push(query);
        return Response.json({
          QueryResponse: query.includes("from Invoice")
            ? { Invoice: invoice ? [invoice] : [] }
            : {
                Customer: matches.filter((entry) =>
                  query.includes("PrimaryEmailAddr")
                    ? !!entry.PrimaryEmailAddr
                    : query.includes("CompanyName")
                      ? !!entry.CompanyName
                      : query.includes("FamilyName")
                        ? !!entry.FamilyName
                        : query.includes("DisplayName =")
                          ? query.includes(entry.DisplayName)
                          : !!entry.DisplayName,
                ),
              },
        });
      }
      if (path.startsWith("customer/")) {
        const id = path.slice("customer/".length);
        customerReads.push(id);
        return Response.json({
          Customer: matches.find((entry) => entry.Id === id),
        });
      }
      if (path === "customer") {
        const body = JSON.parse(String(init?.body));
        customerCreates.push({
          body,
          requestId: url.searchParams.get("requestid"),
        });
        const entry = { Id: String(50 + customerCreates.length), ...body };
        matches.push(entry);
        if (loseCustomerResponse) {
          loseCustomerResponse = false;
          throw new Error("Fixture connection lost");
        }
        return Response.json({ Customer: entry });
      }
      if (path === "item/45")
        return Response.json({
          Item: { Id: "45", Name: "Web design services" },
        });
      if (path === "invoice") {
        const body = JSON.parse(String(init?.body));
        creates.push({ body, requestId: url.searchParams.get("requestid") });
        invoice = {
          Id: "20",
          DocNumber: body.DocNumber,
          EmailStatus: "NotSet",
          TotalAmt: 700,
          Balance: 700,
          PrivateNote: body.PrivateNote,
        };
        if (loseCreateResponse) throw new Error("Fixture connection lost");
        return Response.json({ Invoice: invoice });
      }
      if (path === "invoice/20/send") {
        deliveries.push(url.searchParams.get("sendTo")!);
        if (emailDown) return Response.json({}, { status: 503 });
        invoice.EmailStatus = "EmailSent";
        return Response.json({ Invoice: invoice });
      }
      if (path === "invoice/20") return Response.json({ Invoice: invoice });
      throw new Error("Unexpected sandbox fixture request: " + path);
    },
  );
  return {
    fetcher,
    tokenBodies,
    creates,
    customerCreates,
    customerReads,
    setCustomers: (entries: FixtureCustomer[]) => (matches = entries),
    loseCustomer: () => {
      loseCustomerResponse = true;
    },
    deliveries,
    revocations,
    queries,
    failEmail: (value: boolean) => {
      emailDown = value;
    },
    loseCreate: () => {
      loseCreateResponse = true;
    },
    several: () => {
      matches = [
        ...matches,
        { ...matches[0], Id: "11", DisplayName: "Acme Second" },
      ];
    },
  };
}

async function connect(qbo: QboProvider) {
  const start = await qbo.connection.authorize(staff.actor, origin);
  const authorize = new URL(start.url);
  const state = authorize.searchParams.get("state")!;
  const callback = new URL(config.redirectUri!);
  callback.search = new URLSearchParams({
    state,
    code: "fake-authorization-code",
    realmId: "123",
  }).toString();
  await qbo.connection.callback(staff.actor, callback, state);
  return { authorize, start, state, callback };
}
it("binds OAuth state to the staff browser and consumes it once, rotates under a workspace lease, and revokes on disconnect", async () => {
  const { repo } = await setup();
  const mock = sandbox(),
    qbo = new QboProvider(repo, config, mock.fetcher);
  const wrong = new URL(config.redirectUri!);
  wrong.search = "?state=wrong&code=test&realmId=123";
  await expect(
    qbo.connection.callback(staff.actor, wrong, "wrong"),
  ).rejects.toThrow(/did not match/);
  expect(mock.tokenBodies).toHaveLength(0);
  const { authorize, start, state, callback } = await connect(qbo);
  expect(authorize.searchParams.get("scope")).toBe(
    "com.intuit.quickbooks.accounting",
  );
  expect(authorize.searchParams.get("redirect_uri")).toBe(config.redirectUri);
  expect(start.cookie).toContain("HttpOnly; SameSite=Lax");
  await expect(
    qbo.connection.callback(staff.actor, callback, state),
  ).rejects.toThrow(/did not match/);
  const row = (await repo.providerCredential<{
    id: string;
    ciphertext: string;
  }>(repo.workspaceId))!;
  expect(JSON.stringify(row)).not.toContain("rotation-1");
  const token = JSON.parse(
    decryptSecret(row.ciphertext, config.encryptionKey, repo.workspaceId),
  );
  await repo.put("provider_credentials", {
    ...row,
    ciphertext: encryptSecret(
      JSON.stringify({ ...token, expires_at: 0 }),
      config.encryptionKey,
      repo.workspaceId,
    ),
  });
  const otherProcess = new QboProvider(repo, config, mock.fetcher);
  expect(
    await Promise.all([
      qbo.connection.access(),
      otherProcess.connection.access(),
    ]),
  ).toEqual([
    { realm: "123", accessToken: "access-2" },
    { realm: "123", accessToken: "access-2" },
  ]);
  expect(mock.tokenBodies).toHaveLength(2);
  expect(mock.tokenBodies[1].get("refresh_token")).toBe("rotation-1");
  expect(await qbo.connection.status()).toMatchObject({
    company: "Acme Sandbox",
    state: "connected",
  });
  await otherProcess.connection.disconnect();
  expect(mock.revocations).toEqual(["rotation-2"]);
  expect(await repo.providerCredential(repo.workspaceId)).toBeNull();
});

for (const delivery of ["draft", "email"] as const) {
  it(`invoices the signed kickoff and keeps recurrence in Stripe with ${delivery} delivery`, async () => {
    const f = await setup();
    const mock = sandbox(),
      qbo = new QboProvider(f.repo, config, mock.fetcher);
    await connect(qbo);
    const chosen = f.draft.quote[0];
    const recurring = f.draft.quote[1].sublines[0];
    const kickoff = {
      ...chosen.sublines[0],
      amount: 35000,
      qty: 2,
      label: "Kickoff",
    };
    const proposal = await f.service.edit(
      f.draft.id,
      {
        revision: f.draft.revision,
        quote: [
          {
            ...chosen,
            description: "Project build",
            sublines: [kickoff, recurring],
          },
        ],
      },
      staff,
    );
    const sent = await f.service.send(proposal.id, staff);
    const p = await f.service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
    p.client.billing_email = "billing@example.test";
    const opts = {
      catalog: [] as Item[],
      connected: true,
      realm: "123",
      workspace: {
        ...f.settings,
        qbo_custom_item_ref: "123:45",
        qbo_term_ref: "123:6",
        qbo_invoice_delivery: delivery,
      },
    };
    if (delivery === "email") mock.failEmail(true);
    else mock.loseCreate();
    const failed = await bill(p, "qbo", qbo, opts);
    expect(failed.status).toBe("failed");
    if (delivery === "email") expect(failed.external_object_id).toBe("20");
    p.billing_links = [failed];
    mock.failEmail(false);
    const result = await bill(p, "qbo", qbo, opts);
    expect(result).toMatchObject({
      status: "succeeded",
      external_object_id: "20",
    });
    expect(mock.creates).toHaveLength(1);
    expect(mock.creates[0]).toMatchObject({
      requestId: expect.stringMatching(/^[0-9a-f]{40}$/),
      body: {
        EmailStatus: "NotSet",
        PrivateNote: expect.stringContaining(proposalInvoiceRef(p.id)),
        DocNumber: proposalInvoiceRef(p.id),
        BillEmail: { Address: "billing@example.test" },
        SalesTermRef: { value: "6" },
        Line: [
          {
            Amount: 700,
            Description: "Project build · Kickoff",
            SalesItemLineDetail: {
              Qty: 2,
              UnitPrice: 350,
              ItemRef: { value: "45" },
            },
          },
        ],
      },
    });
    expect(mock.deliveries).toEqual(
      delivery === "email"
        ? ["billing@example.test", "billing@example.test"]
        : [],
    );
    expect(
      mock.queries.some((q) =>
        q.includes("PrimaryEmailAddr = 'billing@example.test'"),
      ),
    ).toBe(true);
    const stripe = new MockBillingProvider("stripe");
    const recurringBill = await bill(p, "stripe", stripe);
    expect(recurringBill.status).toBe("succeeded");
    expect(stripe.customers[0].email).toBe(p.client.email);
    expect(recurringBill.metadata?.lines).toEqual(
      billingLines(p.versions.at(-1)!.quote).filter(
        (l) => l.interval !== "one_time",
      ),
    );
  });
}

it("warns about disconnected and unmapped one-time lines and requires a staff choice for multiple matches", async () => {
  const f = await setup();
  const quote = f.draft.quote.map((item) => ({
    ...item,
    sublines: item.sublines.map((line) => ({ ...line, qbo_item_ref: null })),
  }));
  const warned = readiness({ ...f.draft, quote }, [], new Date(), true, {
    connected: false,
    defaultItem: null,
  });
  expect(warned.warnings).toEqual(
    expect.arrayContaining([
      expect.stringContaining("QuickBooks is not connected"),
      expect.stringContaining("Choose a QuickBooks item"),
    ]),
  );
  const mock = sandbox(),
    qbo = new QboProvider(f.repo, config, mock.fetcher);
  await connect(qbo);
  mock.several();
  const sent = await f.service.send(f.draft.id, staff);
  const p = await f.service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  p.client = {
    ...p.client,
    billing_email: "billing@example.test",
  } satisfies Client;
  const opts = {
    catalog: [],
    connected: true,
    realm: "123",
    workspace: { ...f.settings, qbo_custom_item_ref: "123:45" },
  };
  const review = await bill(p, "qbo", qbo, opts);
  expect(review).toMatchObject({
    status: "needs_review",
    metadata: {
      customer_candidates: [
        expect.objectContaining({ id: "10" }),
        expect.objectContaining({ id: "11" }),
      ],
    },
  });
  expect(mock.creates).toHaveLength(0);
  p.billing_links = [
    {
      ...review,
      metadata: {
        ...review.metadata,
        customer_choice: {
          id: "10",
          realm: "123",
          email: "billing@example.test",
        },
      },
    },
  ];
  expect(await bill(p, "qbo", qbo, opts)).toMatchObject({
    status: "succeeded",
    external_customer_id: "10",
  });
});

async function matchingFixture() {
  const f = await setup();
  const mock = sandbox();
  const qbo = new QboProvider(f.repo, config, mock.fetcher);
  await connect(qbo);
  const sent = await f.service.send(f.draft.id, staff);
  const p = await f.service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  p.client = {
    ...p.client,
    company: "Example Studio",
    first_name: "  Jane ",
    last_name: " O'Neil ",
    billing_email: "billing@example.test",
  };
  const opts = {
    catalog: [],
    connected: true,
    realm: "123",
    workspace: { ...f.settings, qbo_custom_item_ref: "123:45" },
  };
  const run = () => bill(p, "qbo", qbo, opts);
  return { p, mock, qbo, run, repo: f.repo };
}

it("uses a single billing email match before company or name, then reuses the realm-specific linked ID", async () => {
  const { mock, run, p, qbo } = await matchingFixture();
  mock.setCustomers([
    {
      Id: "10",
      DisplayName: "Different name",
      PrimaryEmailAddr: { Address: "BILLING@EXAMPLE.TEST" },
    },
    {
      Id: "11",
      DisplayName: "Jane O'Neil",
      CompanyName: "Example Studio",
      PrimaryEmailAddr: { Address: "different@example.test" },
    },
  ]);
  expect(await run()).toMatchObject({
    status: "succeeded",
    external_customer_id: "10",
  });
  expect(
    mock.queries.filter((query) => query.includes("from Customer")),
  ).toEqual([expect.stringContaining("PrimaryEmailAddr")]);
  mock.queries.length = 0;
  expect(
    await qbo.resolveQuickBooksCustomer(
      { ...p.client, email: "changed@example.test" },
      "123",
    ),
  ).toMatchObject({ customer: { id: "10" } });
  expect(mock.customerReads).toEqual(["10"]);
  expect(mock.queries).toEqual([]);
  expect(mock.customerCreates).toEqual([]);
  expect(await qbo.item("999:45")).toBeNull();
  expect(await qbo.item("123:45")).toEqual({
    id: "123:45",
    name: "Web design services",
  });
});

it("lists exact normalized name and company candidates once, and uses a confirmed customer with a different email", async () => {
  const { mock, run, p } = await matchingFixture();
  mock.setCustomers([
    {
      Id: "10",
      DisplayName: "Jane at Example",
      CompanyName: "Example Studio",
      GivenName: "  JANE ",
      FamilyName: " O'NEIL ",
      PrimaryEmailAddr: { Address: "old@example.test" },
    },
    {
      Id: "11",
      DisplayName: " jane o'neil ",
      CompanyName: "Other Studio",
      PrimaryEmailAddr: { Address: "other@example.test" },
    },
    {
      Id: "12",
      DisplayName: "Janelle O'Neil",
      GivenName: "Janelle",
      FamilyName: "O'Neil",
    },
    {
      Id: "13",
      DisplayName: "Different customer",
      CompanyName: "EXAMPLE STUDIO",
    },
  ]);
  const review = await run();
  expect(review).toMatchObject({
    status: "needs_review",
    last_error:
      "A QuickBooks customer named Jane O'Neil exists with a different email. Choose that customer or create a new one.",
    metadata: {
      customer_review_reason: "name",
      customer_candidates: [
        {
          id: "10",
          display_name: "Jane at Example",
          company: "Example Studio",
          email: "old@example.test",
        },
        { id: "11" },
        { id: "13" },
      ],
    },
  });
  expect(
    mock.queries.some((query) =>
      query.includes("FamilyName like '%O\\'Neil%'"),
    ),
  ).toBe(true);
  expect(mock.customerCreates).toHaveLength(0);
  expect(mock.creates).toHaveLength(0);
  p.billing_links = [
    {
      ...review,
      metadata: {
        ...review.metadata,
        customer_choice: {
          id: "11",
          realm: "123",
          email: "billing@example.test",
        },
      },
    },
  ];
  expect(await run()).toMatchObject({
    status: "succeeded",
    external_customer_id: "11",
  });
  expect(mock.customerReads).toEqual(["11"]);
  expect(mock.creates).toHaveLength(1);
  expect(mock.creates[0].body).toMatchObject({
    CustomerRef: { value: "11" },
    BillEmail: { Address: "billing@example.test" },
  });
});

it("offers the company chooser and creates, links, and invoices exactly once after explicit approval and a lost response", async () => {
  const { mock, p, qbo, run } = await matchingFixture();
  mock.setCustomers([
    {
      Id: "10",
      DisplayName: "Example Studio",
      CompanyName: "Example Studio",
      PrimaryEmailAddr: { Address: "old@example.test" },
    },
  ]);
  const review = await run();
  expect(review).toMatchObject({
    status: "needs_review",
    metadata: {
      customer_review_reason: "company",
      customer_candidates: [{ id: "10" }],
    },
  });
  p.billing_links = [
    {
      ...review,
      metadata: {
        ...review.metadata,
        customer_choice: {
          id: null,
          realm: "123",
          email: "billing@example.test",
        },
      },
    },
  ];
  mock.loseCustomer();
  const failed = await run();
  expect(failed.status).toBe("failed");
  p.billing_links = [failed];
  expect(await run()).toMatchObject({
    status: "succeeded",
    external_customer_id: "51",
  });
  expect(await run()).toMatchObject({
    status: "succeeded",
    external_customer_id: "51",
  });
  expect(mock.customerCreates).toHaveLength(1);
  expect(mock.customerCreates[0].requestId).toBeTruthy();
  expect(mock.customerCreates[0].body).toMatchObject({
    DisplayName: expect.stringMatching(
      /^Example Studio \(Yeswell [0-9a-f]{10}\)$/,
    ),
    CompanyName: "Example Studio",
  });
  expect(mock.creates).toHaveLength(1);
  expect(
    await qbo.resolveQuickBooksCustomer(
      { ...p.client, email: "new@example.test" },
      "123",
    ),
  ).toMatchObject({ customer: { id: "51" } });
});

it("skips person lookup without a last name and creates automatically only after no match", async () => {
  const { mock, p, run } = await matchingFixture();
  p.client.last_name = " ";
  mock.setCustomers([
    { Id: "10", DisplayName: "Jane", CompanyName: "Other Studio" },
  ]);
  expect(await run()).toMatchObject({
    status: "succeeded",
    external_customer_id: "51",
  });
  expect(
    mock.queries.some((query) => /FamilyName|DisplayName/.test(query)),
  ).toBe(false);
  expect(mock.customerCreates).toHaveLength(1);
  expect(mock.creates).toHaveLength(1);
});

it("projects only the latest five provider events and the saved connection details", async () => {
  const { repo } = await setup();
  const put = async (
    type: string,
    index: number,
    metadata: Record<string, unknown>,
  ) =>
    repo.put("workspace_events", {
      id: `${type}-${index}`,
      type,
      actor: staff.actor,
      created_at: `2026-11-09T12:0${index}:00.000Z`,
      metadata,
    });
  await put("qbo_connected", 0, { actor_name: "Alex Morgan" });
  for (let i = 1; i <= 6; i++)
    await put("qbo_token_refreshed", i, { provider: "qbo" });
  await put("catalog_synced", 7, { provider: "stripe" });
  const qbo = await providerActivity(repo, "qbo");
  expect(qbo.rows.map((row) => row.id)).toEqual(
    [6, 5, 4, 3, 2].map((i) => "qbo_token_refreshed-" + i),
  );
  expect(qbo.rows[0]).not.toHaveProperty("metadata");
  expect(qbo.connected).toMatchObject({
    actor: staff.actor,
    name: "Alex Morgan",
  });
  const stripe = await providerActivity(repo, "stripe");
  expect(stripe.rows).toMatchObject([{ label: "Products synced" }]);
  expect(stripe.lastSync).toBe("2026-11-09T12:07:00.000Z");
  expect(stripe.connected).toBeUndefined();
});

it("grants credential compare-and-swap only to service_role and rejects a stale update", async () => {
  const db = await postgresFixture();
  try {
    const result = await db.query<{
      anon: boolean;
      member: boolean;
      service: boolean;
    }>(
      `select has_function_privilege('anon','public.replace_provider_credential(uuid,uuid,jsonb,jsonb)','EXECUTE') as anon,
      has_function_privilege('authenticated','public.replace_provider_credential(uuid,uuid,jsonb,jsonb)','EXECUTE') as member,
      has_function_privilege('service_role','public.replace_provider_credential(uuid,uuid,jsonb,jsonb)','EXECUTE') as service`,
    );
    expect(result.rows[0]).toEqual({
      anon: false,
      member: false,
      service: true,
    });
    const w = "00000000-0000-4000-8000-000000000001";
    const id = crypto.randomUUID();
    const sql =
      "select public.replace_provider_credential($1,$2,$3,$4) as updated";
    expect(
      (await db.query(sql, [w, id, null, { id, secret: "encrypted" }])).rows[0],
    ).toEqual({ updated: true });
    expect(
      (await db.query(sql, [w, id, null, { id, secret: "stale" }])).rows[0],
    ).toEqual({ updated: false });
    expect(
      (await db.query(sql, [w, id, { id, secret: "encrypted" }, null])).rows[0],
    ).toEqual({ updated: true });
  } finally {
    await db.close();
  }
});
