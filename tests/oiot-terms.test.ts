import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { paymentPlanClause, oldOiotClauseBody } from "../seed/oiot-clause";
import { seedIds } from "../seed/marketfresh";
import { starterTemplates } from "../seed/starter-templates";
import { bill, MockBillingProvider } from "../src/lib/billing";
import { toolDefinitions } from "../src/lib/ai-tools";
import type { Block, Item, Proposal, Quote } from "../src/lib/model";
import { contractClauseHtml, variables } from "../src/lib/presentation";
import { readiness } from "../src/lib/quote";
import { prepareQuote } from "../src/lib/quote-model";
import { publicResult } from "../src/lib/service";
import { clientActor, setup, signature, staff } from "./helpers";
import { postgresFixture } from "./postgres-fixture";

const consistency =
  "The purchase price must equal the kickoff plus $2,250 so payoff happens after 30 payments.";
const termBlock: Block = {
  type: "contract",
  text: "Terms",
  clauses: [paymentPlanClause],
};

async function fixture() {
  const f = await setup();
  const catalog = await f.repo.entities<Item>("pricing_items");
  const starter = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog,
  })[1];
  const quote = starter.default_items!;
  const offer = quote[1];
  const content = f.draft.content.map((block) =>
    block.type === "contract" ? { ...termBlock, id: block.id } : block,
  );
  const quoteWithAmounts: Quote = quote.map((item) =>
    item.id !== offer.id
      ? item
      : {
          ...item,
          oiot_purchase_price: 375000,
          sublines: [
            {
              id: crypto.randomUUID(),
              label: "Kickoff",
              amount: 150000,
              qty: 1,
              oiot_kickoff: true,
              interval: "one_time",
              list_amount: null,
              stripe_lookup_key: null,
              qbo_item_ref: "mock-kickoff",
            },
            ...item.sublines,
          ],
        },
  );
  return { ...f, catalog, quote, content, quoteWithAmounts, offer };
}

it("requires both entered amounts whenever the plan is offered and enforces the 30-payment terms", async () => {
  const f = await fixture();
  const p = await f.service.edit(
    f.draft.id,
    { revision: f.draft.revision, quote: f.quote, content: f.content },
    staff,
  );
  expect(p.quote[1].selected).toBe(false);
  const missing = readiness(p, f.catalog);
  expect(missing.errors).toEqual([
    "Enter the kickoff amount for Own It Over Time",
    "Enter the website purchase price for Own It Over Time",
  ]);
  await expect(f.service.send(p.id, staff)).rejects.toThrow(
    "Enter the kickoff amount",
  );
  const incomplete = f.quoteWithAmounts.map((item) => ({
    ...item,
    oiot_purchase_price: undefined,
  }));
  expect(readiness({ ...p, quote: incomplete }, f.catalog).errors).toEqual([
    "Enter the website purchase price for Own It Over Time",
  ]);
  const wrong = f.quoteWithAmounts.map((item) =>
    item.id === f.offer.id ? { ...item, oiot_purchase_price: 370000 } : item,
  );
  expect(readiness({ ...p, quote: wrong }, f.catalog).errors).toEqual([
    consistency,
  ]);
  const valid = readiness({ ...p, quote: f.quoteWithAmounts }, f.catalog);
  expect(valid.errors).toEqual([]);
  expect(valid.warnings).not.toContain("Contract clause 4.4 is draft wording");
  expect(
    toolDefinitions.find((t) => t.name === "create_template")?.description,
  ).toContain("{{oiot.purchase_price}}");
});

it("keeps an explicit kickoff separate from an older bundled catalog list price", async () => {
  const f = await fixture();
  const product = f.catalog.find((item) => item.id === f.offer.pricing_item_id);
  expect(product?.sublines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        interval: "one_time",
        label: "Kickoff",
        amount: 50000,
      }),
    ]),
  );
  const quote = prepareQuote(f.quoteWithAmounts, f.catalog, true);
  expect(quote.find((item) => item.id === f.offer.id)).toMatchObject({
    oiot_purchase_price: 375000,
    sublines: [
      expect.objectContaining({
        oiot_kickoff: true,
        amount: 150000,
        list_amount: null,
      }),
      expect.objectContaining({ amount: 17500, list_amount: 17500 }),
    ],
  });
});

it("derives only an omitted kickoff on an assistant write with a valid purchase price", async () => {
  const f = await fixture();
  const plan = { ...f.offer, oiot_purchase_price: 375000 };
  const invalid = { ...plan, oiot_purchase_price: 200000 };
  const derive = (item: typeof plan, ai: boolean) =>
    prepareQuote([item], f.catalog, ai)[0].sublines.filter(
      (line) => line.oiot_kickoff,
    );
  expect(derive(plan, false)).toEqual([]);
  expect(derive(invalid, true)).toEqual([]);
  expect(derive(plan, true)).toEqual([
    expect.objectContaining({ amount: 150000, qty: 1, interval: "one_time" }),
  ]);
  const explicit = {
    ...plan,
    sublines: f.quoteWithAmounts
      .find((item) => item.id === f.offer.id)!
      .sublines.map((line) =>
        line.oiot_kickoff ? { ...line, amount: 140000 } : line,
      ),
  };
  expect(derive(explicit, true)).toEqual([
    expect.objectContaining({ amount: 140000 }),
  ]);
});

it("shows the clause only for Own It Over Time and freezes the entered values and the existing schedule", async () => {
  const f = await fixture();
  await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      quote: f.quoteWithAmounts,
      content: f.content,
    },
    staff,
  );
  const sent = await f.service.send(f.draft.id, staff);
  expect(publicResult(sent).html).not.toContain("4.4 Own It Over Time");
  const choose = (p: Proposal, id: string) =>
    f.service.toggle(
      p.token!,
      "",
      { revision: p.revision, item_id: id, selected: true },
      clientActor,
    );
  const on = await choose(sent, f.offer.id);
  const html = publicResult(on).html;
  expect(html).toContain(
    "<strong>Fees and Term.</strong> Client pays a kickoff payment of $1,500",
  );
  expect(html).toContain("The full purchase price is $3,750");
  expect(html).toContain("that occurs after thirty (30) monthly payments.");
  expect(html).not.toContain("{{oiot.");
  const off = await choose(on, f.quote[0].id);
  expect(publicResult(off).html).not.toContain("4.4 Own It Over Time");
  const chosen = await choose(off, f.offer.id);
  const signed = await f.service.sign(
    chosen.id,
    signature(chosen.revision),
    "client",
    clientActor,
    { token: chosen.token!, password: "" },
  );
  const frozen = structuredClone(signed.versions.at(-1));
  expect(frozen).toMatchObject({
    frozen: true,
    variables_resolved: {
      "oiot.kickoff": "$1,500",
      "oiot.purchase_price": "$3,750",
    },
  });
  const qbo = new MockBillingProvider("qbo"),
    stripe = new MockBillingProvider("stripe");
  const oneTime = await bill(signed, "qbo", qbo);
  const recurring = await bill(signed, "stripe", stripe);
  expect(oneTime.metadata?.lines).toEqual([
    expect.objectContaining({ amount: 150000, interval: "one_time" }),
  ]);
  expect(recurring.metadata?.lines).toEqual([
    expect.objectContaining({
      amount: 17500,
      interval: "month",
      schedule: expect.objectContaining({ after_paid_invoices: 30 }),
    }),
  ]);
  await expect(
    f.service.edit(signed.id, { revision: signed.revision, quote: [] }, staff),
  ).rejects.toThrow("read-only");
  expect((await f.repo.get(signed.id))!.versions.at(-1)).toEqual(frozen);
  expect(publicResult(signed).html).toContain("<strong>Ownership.</strong>");
});

it("escapes clause text and leaves general contract strings plain", async () => {
  const f = await fixture();
  const map = variables({
    ...f.draft,
    quote: f.quoteWithAmounts,
    content: f.content,
  });
  const body =
    "**Ownership.** <script>alert(1)</script> {{oiot.purchase_price}}";
  expect(contractClauseHtml({ ...paymentPlanClause, body }, map)).toBe(
    "<strong>Ownership.</strong> &lt;script&gt;alert(1)&lt;/script&gt; $3,750",
  );
  expect(
    contractClauseHtml(
      { ...paymentPlanClause, body, body_format: undefined },
      map,
    ),
  ).toContain("**Ownership.**");
});

it("rollout updates only untouched MarketFresh terms and is idempotent", async () => {
  const f = await fixture();
  const db = await postgresFixture();
  try {
    const old = {
      ...paymentPlanClause,
      body: oldOiotClauseBody,
      draft: true,
      body_format: undefined,
    };
    const content = [{ ...termBlock, clauses: [old] }];
    const customized = [
      { ...termBlock, clauses: [{ ...old, body: "A negotiated change." }] },
    ];
    const workspace = f.repo.workspaceId;
    const other = crypto.randomUUID();
    await db.query(
      "insert into public.workspaces(id,name) values($1,'Other Workspace')",
      [other],
    );
    const template = { id: seedIds.template, name: "Website copy", content };
    await db.query(
      "insert into public.templates(id,workspace_id,data) values($1,$2,$3)",
      [template.id, workspace, template],
    );
    const generic = { ...template, id: crypto.randomUUID() };
    await db.query(
      "insert into public.templates(id,workspace_id,data) values($1,$2,$3)",
      [generic.id, other, generic],
    );
    await db.query(
      "insert into public.clients(id,workspace_id,data) values($1,$2,$3)",
      [f.draft.client.id, workspace, f.draft.client],
    );
    const draft = { ...f.draft, content, revision: 0 };
    const customizedDraft = {
      ...draft,
      id: crypto.randomUUID(),
      content: customized,
    };
    const sent = {
      ...draft,
      id: crypto.randomUUID(),
      status: "sent",
      token: "test-token",
      sent_at: new Date().toISOString(),
    };
    for (const p of [draft, customizedDraft, sent])
      await db.query("select public.save_proposal($1,-1)", [p]);
    const migration = await readFile(
      "supabase/migrations/20261109205000_final_own_it_over_time_terms.sql",
      "utf8",
    );
    await db.exec(migration);
    const rows = async () =>
      (
        await db.query<{ id: string; state: Proposal }>(
          "select id, state from public.proposals where workspace_id = $1 order by id",
          [workspace],
        )
      ).rows;
    const changed = await rows();
    expect(changed.find((row) => row.id === draft.id)?.state).toMatchObject({
      content: [termBlock],
      revision: 1,
    });
    expect(
      changed.find((row) => row.id === customizedDraft.id)?.state.content,
    ).toEqual(customized);
    expect(changed.find((row) => row.id === sent.id)?.state.content).toEqual(
      content.map((b) => JSON.parse(JSON.stringify(b))),
    );
    expect(
      (
        await db.query<{ data: { content: Block[] } }>(
          "select data from public.templates where id = $1",
          [template.id],
        )
      ).rows[0].data.content,
    ).toEqual([termBlock]);
    expect(
      (
        await db.query<{ data: { content: Block[] } }>(
          "select data from public.templates where id = $1",
          [generic.id],
        )
      ).rows[0].data.content[0].clauses?.[0].body,
    ).toBe(oldOiotClauseBody);
    await db.exec(migration);
    expect(await rows()).toEqual(changed);
  } finally {
    await db.close();
  }
});
