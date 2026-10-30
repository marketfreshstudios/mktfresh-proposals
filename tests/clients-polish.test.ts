import { expect, it, vi } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import {
  normalizedPhone,
  formattedPhone,
  formattedAddress,
  stripeAddress,
  qboAddress,
} from "../src/lib/client-contact";
import { saveClient, linkStripeCustomer } from "../src/lib/clients";
import { aiTool, toolDefinitions } from "../src/lib/ai-tools";
import { variables, renderBlocks, versionHash } from "../src/lib/content";
import {
  clientBilling,
  stripeCustomerMatches,
} from "../src/lib/client-billing";
import { ProposalService } from "../src/lib/service";
import { StripeProvider } from "../src/lib/providers/stripe";
import { QboProvider } from "../src/lib/providers/qbo";
import { bill, MockBillingProvider } from "../src/lib/billing";
import type { StripeTransport } from "../src/lib/catalog";
import { postgresFixture } from "./postgres-fixture";
import { randomUUID } from "node:crypto";
const address = {
  line1: "123 Main St",
  line2: "Suite 2",
  city: "Charlotte",
  region: "NC",
  postal_code: "28202",
  country: "US",
};
function stripe(email: string, count: number) {
  const get = vi.fn(
    async (path: string, params?: Record<string, string>): Promise<any> => {
      if (path === "/v1/customers")
        return {
          data: Array.from({ length: count }, (_, i) => ({
            id: `cus_${i + 1}`,
            email,
            name: `Company ${i + 1}`,
            created: 1700000000 + i,
            livemode: false,
          })),
          has_more: false,
        };
      if (path.startsWith("/v1/customers/"))
        return {
          id: path.split("/").at(-1),
          email,
          livemode: false,
          invoice_settings: {
            default_payment_method: { card: { brand: "visa", last4: "4242" } },
          },
        };
      if (path === "/v1/subscriptions")
        return {
          data: [
            {
              id: "sub_1",
              livemode: false,
              status: "active",
              items: {
                data: [
                  {
                    id: "si_1",
                    quantity: 2,
                    price: {
                      unit_amount: 10000,
                      currency: "usd",
                      lookup_key: "hosted-standard-100",
                      nickname: "Hosting",
                      recurring: { interval: "month", interval_count: 1 },
                    },
                  },
                  {
                    id: "si_2",
                    quantity: 1,
                    price: {
                      unit_amount: 120000,
                      currency: "usd",
                      lookup_key: null,
                      nickname: "Yearly",
                      recurring: { interval: "year", interval_count: 1 },
                    },
                  },
                ],
              },
            },
          ],
          has_more: false,
        };
      return { data: [], has_more: false };
    },
  );
  return {
    get,
    post: vi.fn(async () => {
      throw new Error("Unexpected write");
    }),
  } as StripeTransport & { get: typeof get };
}
it("normalizes valid US/international phones, preserves empty and rejects invalid numbers or extensions", () => {
  expect(normalizedPhone("(704) 555-0123")).toBe("+17045550123");
  expect(formattedPhone("+17045550123")).toBe("(704) 555-0123");
  expect(normalizedPhone("+44 20 7946 0018")).toBe("+442079460018");
  expect(formattedPhone("+442079460018")).toBe("+44 20 7946 0018");
  expect(normalizedPhone("")).toBe("");
  for (const invalid of [
    "123",
    "call 7045550123",
    "7045550123 ext 3",
    "+12223333333",
  ])
    expect(() => normalizedPhone(invalid)).toThrow("valid phone");
});
it("normalizes existing clients on save, MCP create/get/update share structured contact data and reject provider-link writes", async () => {
  const { repo, draft } = await setup();
  await saveClient(repo, { ...draft.client, phone: "7045550123", address });
  const ai = {
    ...clientActor,
    actor: "ai:example",
    workspace_id: repo.workspaceId,
  };
  const get = (await aiTool(repo, ai, "get_client", { id: draft.client.id }, [
    "proposals:read",
  ])) as any;
  expect(get).toMatchObject({
    phone: "+17045550123",
    phone_formatted: "(704) 555-0123",
    address,
  });
  const updated = (await aiTool(
    repo,
    ai,
    "update_client",
    {
      id: draft.client.id,
      phone: "+44 20 7946 0018",
      address: { city: "London", country: "GB" },
    },
    ["proposals:draft"],
  )) as any;
  expect(updated.phone).toBe("+442079460018");
  await aiTool(
    repo,
    ai,
    "update_client",
    { id: draft.client.id, notes: "Keep these notes" },
    ["proposals:draft"],
  );
  const patched = (await aiTool(
    repo,
    ai,
    "update_client",
    { id: draft.client.id, title: "Director" },
    ["proposals:draft"],
  )) as any;
  expect(patched).toMatchObject({
    notes: "Keep these notes",
    phone: "+442079460018",
    address: { city: "London" },
  });
  expect(updated.address).toMatchObject({
    city: "London",
    country: "GB",
    line1: "",
  });
  expect(
    (
      toolDefinitions.find((t) => t.name === "update_client")!
        .inputSchema as any
    ).properties.address,
  ).toBeDefined();
  await expect(
    aiTool(
      repo,
      ai,
      "update_client",
      { id: draft.client.id, stripe_customer_id: "cus_bad" },
      ["proposals:draft"],
    ),
  ).rejects.toThrow();
  await expect(
    saveClient(repo, { ...draft.client, phone: "invalid" }),
  ).rejects.toThrow();
  const created = (await aiTool(
    repo,
    ai,
    "create_client",
    {
      company: "New",
      first_name: "Pat",
      last_name: "Lee",
      email: "pat@example.test",
      phone: "7045550123",
      address,
    },
    ["proposals:draft"],
  )) as any;
  expect(created).toMatchObject({
    phone: "+17045550123",
    phone_formatted: "(704) 555-0123",
    address,
  });
});
it("renders multiline and empty address fields without blank paragraphs, escaping text safely", async () => {
  const { draft } = await setup();
  expect(formattedAddress({})).toBe("");
  expect(
    renderBlocks(
      [{ type: "paragraph", text: "Line one\nLine two" }],
      draft.quote,
      variables(draft),
    ),
  ).toBe("<p>Line one\nLine two</p>");
  expect(formattedAddress(address)).toBe(
    "123 Main St\nSuite 2\nCharlotte, NC 28202\nUnited States",
  );
  draft.client.address = address;
  const content = [{ type: "paragraph" as const, text: "{{client.address}}" }];
  expect(renderBlocks(content, draft.quote, variables(draft))).toContain(
    "Charlotte, NC 28202<br>United States",
  );
  draft.client.address = {};
  expect(renderBlocks(content, draft.quote, variables(draft))).toBe("");
  expect(
    renderBlocks(
      [
        {
          type: "paragraph",
          content: {
            type: "paragraph",
            content: [{ type: "variable", attrs: { path: "client.address" } }],
          },
        },
      ],
      draft.quote,
      variables(draft),
    ),
  ).toBe("");
  expect(stripeAddress(address)).toMatchObject({ state: "NC", country: "US" });
  expect(qboAddress(address)).toMatchObject({
    CountrySubDivisionCode: "NC",
    Country: "United States",
  });
});
it.each([0, 1, 3])(
  "shows %i exact Stripe matches, cards and separate monthly totals without auto-linking",
  async (count) => {
    const { repo, draft } = await setup();
    const api = stripe(draft.client.email, count);
    const result = await clientBilling(repo, draft.client, api);
    expect(result.candidates).toHaveLength(count);
    expect(result.linked_id).toBeNull();
    expect(result.subscriber).toBe(false);
    if (count)
      expect(result.candidates![0]).toMatchObject({
        card: "visa ending 4242",
        subscriptions: 1,
        monthly_totals: [{ currency: "USD", amount: 20000 }],
      });
    else
      expect(result.notice).toBe(
        "No Stripe customer yet; one is created at checkout",
      );
    expect(
      (await repo.entities<any>("clients"))[0].stripe_customer_id,
    ).toBeNull();
  },
);
it("blocks send and MCP readiness for ambiguous unlinked clients; explicitly reviewed links unblock it", async () => {
  const { repo, draft, members } = await setup(),
    api = stripe(draft.client.email, 3),
    service = new ProposalService(repo, undefined, async () => members, api);
  expect(await service.checkReady(draft)).toMatchObject({
    ready: false,
    customerChoiceUrl: `/clients/${draft.client.id}#stripe-customers`,
  });
  await expect(service.send(draft.id, staff)).rejects.toThrow(
    "Choose which Stripe customer this client is",
  );
  const ai = {
    ...clientActor,
    actor: "ai:example",
    workspace_id: repo.workspaceId,
  };
  expect(
    await aiTool(
      repo,
      ai,
      "check_ready",
      { id: draft.id },
      ["proposals:read"],
      service,
    ),
  ).toMatchObject({ ready: false });
  await linkStripeCustomer(repo, draft.client.id, "cus_2", null, staff, api);
  expect((await service.checkReady(draft)).ready).toBe(true);
  expect((await service.send(draft.id, staff)).status).toBe("sent");
  expect((await repo.entities<any>("workspace_events")).at(-1)).toMatchObject({
    type: "client_stripe_linked",
    actor: staff.actor,
    metadata: { customer_id: "cus_2" },
  });
  await expect(
    linkStripeCustomer(repo, draft.client.id, "cus_1", null, staff, api),
  ).rejects.toThrow("changed");
  await linkStripeCustomer(repo, draft.client.id, null, "cus_2", staff, api);
  expect((await service.checkReady(draft)).ready).toBe(false);
  await expect(
    linkStripeCustomer(repo, draft.client.id, "cus_1", null, ai, api),
  ).rejects.toThrow("Only staff");
  await expect(
    linkStripeCustomer(
      repo,
      draft.client.id,
      "cus_1",
      null,
      staff,
      stripe("wrong@example.test", 1),
    ),
  ).rejects.toThrow("email");
  await expect(
    linkStripeCustomer(repo, draft.client.id, "cus_1", null, staff, {
      ...api,
      get: async <T>() => ({ livemode: true, email: draft.client.email }) as T,
    }),
  ).rejects.toThrow("Test-mode");
});
it("zero/one match permits sending, provider errors block, live responses are refused", async () => {
  for (const count of [0, 1]) {
    const { repo, draft, members } = await setup();
    expect(
      (
        await new ProposalService(
          repo,
          undefined,
          async () => members,
          stripe(draft.client.email, count),
        ).checkReady(draft)
      ).ready,
    ).toBe(true);
  }
  const { repo, draft } = await setup();
  const api = stripe(draft.client.email, 1);
  api.get.mockRejectedValue(new Error("Permission denied"));
  expect(
    (
      await new ProposalService(repo, undefined, undefined, api).checkReady(
        draft,
      )
    ).errors.join(),
  ).toContain("Stripe customer check unavailable: Permission denied");
});
it("billing selects only the linked ID and refuses a missing link rather than falling back to an email match", async () => {
  const { service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const hash = versionHash(signed.versions.at(-1)!);
  signed.client.stripe_customer_id = "cus_chosen";
  const adapter = new MockBillingProvider("stripe");
  const create = vi.spyOn(adapter, "createObject");
  vi.spyOn(adapter, "findCustomers").mockResolvedValue([
    {
      id: "cus_other",
      email: signed.client.email,
      company: signed.client.company,
    },
    {
      id: "cus_chosen",
      email: signed.client.email,
      company: signed.client.company,
    },
  ]);
  expect((await bill(signed, "stripe", adapter)).external_customer_id).toBe(
    "cus_chosen",
  );
  expect(create.mock.calls[0][0].id).toBe("cus_chosen");
  signed.client.stripe_customer_id = "cus_missing";
  create.mockClear();
  expect((await bill(signed, "stripe", adapter)).status).toBe("needs_review");
  expect(create).not.toHaveBeenCalled();
  signed.client.stripe_customer_id = null;
  expect((await bill(signed, "stripe", adapter)).status).toBe("needs_review");
  expect(versionHash(signed.versions.at(-1)!)).toBe(hash);
});
it("new Stripe and QuickBooks customers receive address and E.164 phone; finding existing customers performs no updates", async () => {
  const { repo, draft } = await setup(),
    client = { ...draft.client, address, phone: "(704) 555-0123" };
  const api = stripe(client.email, 1),
    post = vi.fn(
      async <T>(_path: string, params: any) =>
        ({
          id: "cus_new",
          email: client.email,
          name: client.company,
          livemode: false,
        }) as T,
    );
  const provider = new StripeProvider(
    { ...api, post: post as StripeTransport["post"] },
    repo,
  );
  await provider.createCustomer(client, "new");
  expect(post.mock.calls[0][1]).toMatchObject({
    phone: "+17045550123",
    address: { line1: "123 Main St", state: "NC", country: "US" },
  });
  post.mockClear();
  await provider.findCustomers({ ...client, stripe_customer_id: "cus_1" });
  expect(post).not.toHaveBeenCalled();
  const requests: any[] = [];
  const qbo = new QboProvider(
    repo,
    {
      clientId: "test",
      clientSecret: "test",
      refreshToken: "test",
      realm: "123",
      environment: "sandbox",
      encryptionKey: Buffer.alloc(32, 1).toString("base64"),
    },
    async (url, init) => {
      if (String(url).includes("oauth"))
        return Response.json({
          access_token: "test",
          refresh_token: "test",
          expires_in: 3600,
        });
      if (init?.method === "GET")
        return Response.json({
          Customer: {
            Id: "123",
            DisplayName: client.company,
            PrimaryEmailAddr: { Address: client.email },
            BillAddr: { Line1: "Existing address" },
          },
        });
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        Customer: { Id: "123", DisplayName: client.company },
      });
    },
  );
  await qbo.createCustomer(client, "new");
  expect(requests[0]).toMatchObject({
    PrimaryPhone: { FreeFormNumber: "+17045550123" },
    BillAddr: { Line1: "123 Main St", Country: "United States" },
  });
  await qbo.findCustomers({ ...client, qbo_customer_id: "123" });
  expect(requests).toHaveLength(1);
});
it("database links and audit are atomic, scoped, preserve contact data and reject stale or nonstaff writes", async () => {
  const db = await postgresFixture();
  try {
    const workspace = randomUUID(),
      other = randomUUID(),
      client = randomUUID();
    await db.query(
      "insert into public.workspaces(id,name) values ($1,'One'),($2,'Two')",
      [workspace, other],
    );
    await db.query(
      "insert into public.clients(id,workspace_id,data) values($1,$2,$3)",
      [
        client,
        workspace,
        {
          id: client,
          email: "a@example.test",
          company: "Example",
          phone: "+17045550123",
          address,
          stripe_customer_id: null,
        },
      ],
    );
    const call = (
      tenant: string,
      expected: string | null,
      actor = staff.actor,
    ) =>
      db.query("select public.link_client_stripe($1,$2,$3,$4,$5,$6)", [
        tenant,
        client,
        expected,
        "a@example.test",
        "cus_1",
        {
          id: randomUUID(),
          actor,
          type: "client_stripe_linked",
          created_at: new Date().toISOString(),
        },
      ]);
    await expect(call(other, null)).rejects.toThrow("Client not found");
    await expect(call(workspace, null, "ai:test")).rejects.toThrow("Staff");
    await call(workspace, null);
    await db.query("select public.save_client_contact($1,$2)", [
      workspace,
      {
        id: client,
        email: "a@example.test",
        company: "Example",
        phone: "+17045550123",
        address,
        stripe_customer_id: null,
      },
    ]);
    await expect(
      db.query("select public.save_client_contact($1,$2)", [
        other,
        { id: client, email: "a@example.test", company: "Wrong" },
      ]),
    ).rejects.toThrow("Client not found");
    await expect(call(workspace, null)).rejects.toThrow("changed");
    const saved = await db.query<{ data: any }>(
      "select data from public.clients where id=$1",
      [client],
    );
    expect(saved.rows[0].data).toMatchObject({
      phone: "+17045550123",
      address,
      stripe_customer_id: "cus_1",
    });
    expect(
      (
        await db.query(
          "select * from public.workspace_events where workspace_id=$1",
          [workspace],
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec("set role authenticated");
    await expect(call(workspace, "cus_1")).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
});

it("contact edits preserve a Stripe link chosen after the form was opened", async () => {
  const { repo, draft } = await setup();
  const api = stripe(draft.client.email, 1);
  await linkStripeCustomer(repo, draft.client.id, "cus_1", null, staff, api);
  const saved = await saveClient(repo, {
    ...draft.client,
    phone: "7045550123",
  });
  expect(saved?.stripe_customer_id).toBe("cus_1");
});

it("finds differently cased duplicate emails across customer pages before sending or billing", async () => {
  const { repo, draft, members } = await setup();
  const api: StripeTransport = {
    get: async <T>(path: string, params: Record<string, string>) => {
      expect(path).toBe("/v1/customers");
      expect(params).not.toHaveProperty("email");
      return (
        params.starting_after
          ? {
              data: [
                {
                  id: "cus_upper",
                  email: draft.client.email.toUpperCase(),
                  name: "Previous company",
                  livemode: false,
                },
              ],
              has_more: false,
            }
          : {
              data: [
                {
                  id: "cus_lower",
                  email: draft.client.email,
                  name: draft.client.company,
                  livemode: false,
                },
                {
                  id: "cus_other",
                  email: "someone@example.test",
                  livemode: false,
                },
              ],
              has_more: true,
            }
      ) as T;
    },
    post: async () => {
      throw new Error("Must not write");
    },
  };
  expect(
    (await stripeCustomerMatches(draft.client, api)).map((c) => c.id),
  ).toEqual(["cus_lower", "cus_upper"]);
  const service = new ProposalService(
    repo,
    undefined,
    async () => members,
    api,
  );
  await expect(service.send(draft.id, staff)).rejects.toThrow(
    "Choose which Stripe customer this client is",
  );
  expect(
    (await new StripeProvider(api, repo).findCustomers(draft.client)).map(
      (c) => c.id,
    ),
  ).toEqual(["cus_lower", "cus_upper"]);
});
