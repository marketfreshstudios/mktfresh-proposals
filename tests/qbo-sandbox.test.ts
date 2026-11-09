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
function sandbox() {
  let matches = [
    {
      Id: "10",
      DisplayName: "Acme Sandbox",
      PrimaryEmailAddr: { Address: "billing@example.test" },
    },
  ];
  let invoice: any;
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
            : { Customer: matches },
        });
      }
      if (path === "customer/10")
        return Response.json({ Customer: matches[0] });
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
  const quote = f.draft.quote.map((line) => ({ ...line, qbo_item_ref: null }));
  const warned = readiness({ ...f.draft, quote }, [], new Date(), true, {
    connected: false,
    defaultItem: null,
  });
  expect(warned.warnings.join(" ")).toMatch(
    /QuickBooks is not connected.*Choose a QuickBooks item/,
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
