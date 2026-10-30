import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "./helpers";
import {
  quoteItems,
  flatQuote,
  chooseItem,
  billingLines,
  draftItems,
  quoteRange,
  catalogQuoteItem,
  orderedItems,
} from "../src/lib/quote-model";
import { variables, renderBlocks, totals } from "../src/lib/presentation";
import { versionHash } from "../src/lib/content";
import { aiTool } from "../src/lib/ai-tools";
import { mutate } from "../src/lib/repository";
import { readiness } from "../src/lib/quote";
import { publicResult } from "../src/lib/service";
import {
  bill,
  MockBillingProvider,
  UnconfiguredBillingProvider,
} from "../src/lib/billing";
import type { QuoteItem, Item, Line, Proposal } from "../src/lib/model";
async function choices(defaultChoice = true) {
  const ctx = await setup(),
    original = quoteItems(ctx.draft.quote),
    group = randomUUID();
  const a = {
    ...original[0],
    optional: true,
    default_selected: defaultChoice,
    selected: defaultChoice,
    choice_group_id: group,
  };
  const b = {
    ...original[1],
    order: 1,
    optional: true,
    default_selected: false,
    selected: false,
    choice_group_id: group,
    sublines: [
      ...original[1].sublines,
      {
        ...original[0].sublines[0],
        id: randomUUID(),
        label: "Setup",
        amount: 12000,
      },
    ],
  };
  const p = await ctx.service.edit(
    ctx.draft.id,
    {
      revision: ctx.draft.revision,
      quote: [a, b],
      content: [
        ...ctx.draft.content.filter((b) => b.type !== "contract"),
        {
          type: "contract",
          clauses: [
            {
              id: "base",
              heading: "1. Scope",
              body: "Always here",
              show_when: null,
            },
            {
              id: "conditional",
              heading: "2. Additional work",
              body: "Only selected alternative",
              show_when: {
                kind: "item_selected",
                pricing_item_id: b.pricing_item_id!,
              },
            },
          ],
        },
      ],
    },
    staff,
  );
  return { ...ctx, draft: p, a, b };
}
it("adapts both generations of old snapshot without mutations, reordering, rewriting or rehashing", async () => {
  const { draft } = await setup();
  const flat = flatQuote(draft.quote),
    phase1 = {
      id: randomUUID(),
      name: "Historic",
      description: "Original",
      unit_price: 9900,
      billing: "monthly",
      qty: 2,
      optional: true,
      selected: false,
    };
  for (const quote of [flat, [phase1] as never]) {
    const v = {
        content: draft.content.filter((b) => b.type !== "contract"),
        quote,
        variables_resolved: variables(
          { ...draft, status: "sent" },
          quote,
          false,
        ),
      },
      bytes = JSON.stringify(v),
      hash = versionHash(v),
      html = renderBlocks(v.content, v.quote, v.variables_resolved);
    const adapted = quoteItems(v.quote);
    expect(adapted[0].sublines).toHaveLength(1);
    expect(totals(adapted)).toEqual(totals(v.quote));
    adapted[0].sublines[0].amount = 1;
    expect(JSON.stringify(v)).toBe(bytes);
    expect(versionHash(v)).toBe(hash);
    expect(renderBlocks(v.content, v.quote, v.variables_resolved)).toBe(html);
  }
});
it("preserves multiple entered sublines, provider mappings, terms, quantities and separate totals", async () => {
  const { repo } = await setup(),
    item = (await repo.entities<Item>("pricing_items")).find(
      (i) => i.sublines?.length,
    )!;
  const quote = catalogQuoteItem(item, 0, randomUUID(), [
    randomUUID(),
    randomUUID(),
  ]);
  expect(quote.sublines).toHaveLength(2);
  expect(billingLines([quote]).map((l) => l.interval)).toEqual([
    "one_time",
    "month",
  ]);
  expect(billingLines([quote])[0].schedule).toBeNull();
  expect(billingLines([quote])[1].schedule).toEqual(item.schedule);
  expect(totals([quote])).toEqual({
    one_time_total: 50000,
    monthly_total: 17500,
    yearly_total: 0,
  });
  const annual = {
    ...quote.sublines[1],
    id: randomUUID(),
    interval: "year" as const,
    amount: 9876,
    qty: 2,
  };
  quote.sublines.push(annual);
  quote.schedule = null;
  expect(totals([quote]).yearly_total).toBe(19752);
  expect(totals([quote]).monthly_total).toBe(17500);
});
it("validates alternatives, groups order as one unit and computes bounds from supplied amounts only", async () => {
  const { a, b } = await choices();
  const required = {
    ...a,
    id: randomUUID(),
    order: 1,
    choice_group_id: null,
    optional: false,
    sublines: [{ ...a.sublines[0], id: randomUUID(), amount: 100 }],
  };
  b.order = 2;
  expect(orderedItems([a, required, b]).map((i) => i.id)).toEqual([
    a.id,
    b.id,
    required.id,
  ]);
  expect(() => draftItems([a, { ...b, default_selected: true }])).toThrow(
    "default",
  );
  expect(() => draftItems([{ ...a, optional: false }, b])).toThrow("optional");
  expect(() => chooseItem([a, b], a.id, false)).toThrow("replacement");
  expect(quoteRange([a, b, required]).min.one_time_total).toBe(12100);
});
it("resolves exactly one chosen item before queueing billing and freezes only visible clauses", async () => {
  const { service, repo, draft, a, b } = await choices();
  let p = await service.send(draft.id, staff);
  p = await service.toggle(
    p.token!,
    "",
    { revision: p.revision, item_id: b.id, selected: true },
    clientActor,
  );
  expect(quoteItems(p.versions[0].quote).map((i) => i.selected)).toEqual([
    false,
    true,
  ]);
  expect(publicResult(p).html).toContain("Only selected alternative");
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const job = p.jobs.find((j) => j.kind === "billing")!;
  expect(job.payload.selected_item_ids).toEqual([b.id]);
  expect((job.payload.lines as Line[]).map((l) => l.id)).toEqual(
    b.sublines.map((s) => s.id),
  );
  expect(
    (job.payload.lines as Line[]).every(
      (l) => l.pricing_item_id !== a.pricing_item_id,
    ),
  ).toBe(true);
  expect(
    p.versions[0].content
      .find((c) => c.type === "contract")!
      .clauses!.every((c) => c.show_when === null),
  ).toBe(true);
  const stripe = new MockBillingProvider("stripe");
  expect((await bill(p, "stripe", stripe)).status).toBe("succeeded");
  expect(
    (await bill(p, "qbo", new UnconfiguredBillingProvider("qbo"))).last_error,
  ).toBe("Invoice manually");
  const frozen = JSON.stringify(p.versions[0]);
  await service.sign(
    p.id,
    companyConsent(
      p.revision,
      (await repo.entities<any>("workspace_settings"))[0],
    ),
    "company",
    staff,
  );
  expect(JSON.stringify((await repo.get(p.id))!.versions[0])).toBe(frozen);
});
it("rejects missing choice before any PDF or billing job and worker refuses an unresolved group", async () => {
  const { service, draft, b } = await choices(false);
  expect(readiness(draft, []).warnings.join()).toContain("no default");
  const p = await service.send(draft.id, staff),
    before = JSON.stringify(p);
  await expect(
    service.sign(p.id, signature(p.revision), "client", clientActor, {
      token: p.token!,
      password: "",
    }),
  ).rejects.toThrow("Choose one");
  expect(p.jobs.some((j) => j.kind === "billing" || j.kind === "pdf")).toBe(
    false,
  );
  await expect(
    bill(p, "stripe", new MockBillingProvider("stripe")),
  ).rejects.toThrow("Choose one");
  expect(JSON.stringify(p)).toBe(before);
  const chosen = chooseItem(p.versions[0].quote, b.id, true);
  expect(billingLines(chosen)).toHaveLength(2);
});
it("excludes unchosen contract clauses from the signed evidence and keeps old frozen bytes on read", async () => {
  const { service, draft } = await choices();
  let p = await service.send(draft.id, staff);
  expect(publicResult(p).html).not.toContain("Only selected alternative");
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  expect(
    p.versions[0].content.find((b) => b.type === "contract")!.clauses,
  ).toHaveLength(1);
  const before = JSON.stringify(p),
    hash = p.versions[0].content_hash;
  publicResult(p);
  await service.forRead(p);
  expect(JSON.stringify(p)).toBe(before);
  const v = p.versions[0];
  expect(
    versionHash({
      content: v.content,
      quote: v.quote,
      variables_resolved: v.variables_resolved,
    }),
  ).toBe(hash);
});
it("MCP supports old flat inputs for create/set/update and returns canonical items plus compatibility lines", async () => {
  const { repo, draft } = await setup(),
    ai = { ...staff, workspace_id: repo.workspaceId, actor: "ai:Test" },
    scopes = ["proposals:read", "proposals:draft"];
  const created = (await aiTool(
    repo,
    ai,
    "create_proposal_draft",
    {
      client_id: draft.client.id,
      template_id: draft.template_id,
      title: "Compatibility",
      brief: "Entered values",
      content_markdown: "# Scope\n\nHello {{client.first_name}}.",
      lines: flatQuote(draft.quote),
    },
    scopes,
  )) as any;
  expect(created.items[0].sublines[0].amount).toBe(
    flatQuote(draft.quote)[0].amount,
  );
  expect(created.lines).toEqual(flatQuote(draft.quote));
  expect(created.ai_unreviewed).toBe(true);
  let p = (await aiTool(
    repo,
    ai,
    "set_quote_lines",
    { id: created.id, revision: created.revision, lines: created.lines },
    scopes,
  )) as any;
  expect(p.items).toHaveLength(2);
  p = (await aiTool(
    repo,
    ai,
    "update_proposal_draft",
    { id: p.id, revision: p.revision, lines: p.lines },
    scopes,
  )) as any;
  expect(p.lines).toEqual(created.lines);
  const newShape = (await aiTool(
    repo,
    ai,
    "set_quote_lines",
    { id: p.id, revision: p.revision, items: p.items },
    scopes,
  )) as any;
  expect(newShape.items).toEqual(p.items);
  await expect(
    aiTool(
      repo,
      ai,
      "set_quote_lines",
      { id: p.id, revision: newShape.revision, items: [], lines: [] },
      scopes,
    ),
  ).rejects.toThrow("items or");
  const catalog = (await aiTool(repo, ai, "list_catalog", {}, scopes)) as any[];
  expect(catalog.find((c) => c.sublines.length === 2)).toMatchObject({
    optional: false,
    default_selected: true,
    choice_group_id: null,
    order: 0,
  });
});
it("AI price overrides remain held after ordinary save and send confirmation until a staff price decision", async () => {
  const { service, repo, draft } = await setup(),
    items = quoteItems(draft.quote);
  items[0].sublines[0].amount = 12345;
  let p = await service.edit(
    draft.id,
    { revision: draft.revision, quote: items, content: draft.content },
    { ...staff, actor: "ai:Assistant" },
  );
  await expect(service.send(p.id, staff, true)).rejects.toThrow(
    "review AI price",
  );
  p = await service.edit(
    p.id,
    { revision: p.revision, title: "Still not reviewed" },
    staff,
  );
  await expect(service.send(p.id, staff, true)).rejects.toThrow(
    "review AI price",
  );
  const reviewed = quoteItems(p.quote);
  reviewed[0].price_review = { [reviewed[0].sublines[0].id]: "keep" };
  p = await service.edit(
    p.id,
    { revision: p.revision, quote: reviewed },
    staff,
  );
  expect(p.events.at(-1)!.metadata.price_decisions).toHaveLength(1);
  expect((await service.send(p.id, staff, true)).status).toBe("sent");
});
it("new send variables match money preferences while old sent variables stay fixed with cents", async () => {
  const { service, draft, repo, settings } = await setup();
  let p = await service.send(draft.id, staff);
  expect(p.versions[0].variables_resolved["quote.one_time_total"]).toBe(
    "$2,750",
  );
  expect(p.versions[0].variables_resolved["quote.monthly_total"]).toBe("$25");
  expect(variables(p, flatQuote(p.quote), false)["quote.monthly_total"]).toBe(
    "$25.00",
  );
  await repo.put("workspace_settings", {
    ...settings,
    money: { cents: "always" },
  });
  p = await service.send(draft.id, staff);
  expect(p.versions[1].variables_resolved["quote.monthly_total"]).toBe(
    "$25.00",
  );
  expect(p.versions[0].variables_resolved["quote.monthly_total"]).toBe("$25");
});
it("declined notification includes the client's exact note", async () => {
  const { service, draft } = await setup();
  const p = await service.send(draft.id, staff);
  const declined = await service.decline(
    p.token!,
    "",
    clientActor,
    "Please revisit the timeline & scope.",
  );
  expect(
    declined.jobs
      .filter((j) => j.kind === "email")
      .some((j) =>
        String(j.payload.text).includes("Please revisit the timeline & scope."),
      ),
  ).toBe(true);
});

it("section IDs stay unique when template blocks are reused and AI cannot supply its own approval", async () => {
  const { reviewBlocks, contentSections } =
    await import("../src/lib/ai-review");
  const content = reviewBlocks(
    [
      { type: "heading", id: "block-1", text: "First" },
      {
        type: "heading",
        id: "block-1",
        text: "Second",
        ai_review: { source: "staff", reviewed: true },
      },
    ],
    true,
  );
  expect(new Set(contentSections(content).map((s) => s.id)).size).toBe(2);
  expect(content.every((b) => b.ai_review?.reviewed === false)).toBe(true);
  const { service, draft } = await setup(),
    items = quoteItems(draft.quote);
  items[0].sublines[0].amount = 12345;
  items[0].price_review = { [items[0].sublines[0].id]: "keep" };
  const p = await service.edit(
    draft.id,
    { revision: draft.revision, quote: items },
    { ...staff, actor: "ai:Assistant" },
  );
  expect(quoteItems(p.quote)[0].price_review).toBeUndefined();
  await expect(service.send(p.id, staff, true)).rejects.toThrow(
    "review AI price",
  );
});
it("rejects malformed and duplicate contract conditions before sending", async () => {
  const { repo, service, draft } = await setup();
  const p = {
    ...draft,
    content: [
      ...draft.content,
      {
        type: "contract" as const,
        clauses: [
          { id: "duplicate", heading: "A", body: "", show_when: null },
          { id: "duplicate", heading: "B", body: "", show_when: null },
        ],
      },
    ],
  };
  expect(
    readiness(p, await repo.entities<Item>("pricing_items")).errors.join(),
  ).toContain("Duplicate contract clause");
  p.content.at(-1)!.clauses![1] = {
    id: "other",
    heading: "B",
    body: "",
    show_when: { kind: "item_selected", pricing_item_id: "bad" },
  };
  expect(readiness(p, await repo.entities<Item>("pricing_items")).ready).toBe(
    false,
  );
});
it("renders canonical item names once with separate sublines and alternatives; old flat HTML stays fixed", async () => {
  const { a, b } = await choices(),
    html = renderBlocks(
      [{ type: "pricing_table" }],
      [a, b],
      {},
      "USD",
      "always",
    );
  expect(html).toContain("Choose one");
  expect(html.split(b.name)).toHaveLength(2);
  expect(html).toContain("Not included");
  expect(html).toContain("$25.00/mo");
  expect(html).not.toContain("Yearly:");
  const old = flatQuote([a, b]);
  expect(
    renderBlocks([{ type: "pricing_table" }], old, {}, "USD", "auto"),
  ).toBe(renderBlocks([{ type: "pricing_table" }], old, {}, "USD", "always"));
});
it("quote-only MCP edits reopen the quote section while preserving reviewed text", async () => {
  const { service, repo, draft } = await setup(),
    ai = { ...staff, workspace_id: repo.workspaceId, actor: "ai:Assistant" },
    scopes = ["proposals:read", "proposals:draft"];
  let p = await service.edit(
    draft.id,
    { revision: draft.revision, content: draft.content },
    ai,
  );
  p = await service.edit(
    p.id,
    {
      revision: p.revision,
      content: p.content.map((b) =>
        b.ai_review
          ? { ...b, ai_review: { ...b.ai_review, reviewed: true } }
          : b,
      ),
    },
    staff,
  );
  expect(p.ai_unreviewed).toBe(false);
  p = await service.edit(
    p.id,
    { revision: p.revision, title: "Assistant title change" },
    ai,
  );
  expect(p.content.some((b) => b.ai_review && !b.ai_review.reviewed)).toBe(
    true,
  );
  p = await service.edit(
    p.id,
    {
      revision: p.revision,
      content: p.content.map((b) =>
        b.ai_review
          ? { ...b, ai_review: { ...b.ai_review, reviewed: true } }
          : b,
      ),
    },
    staff,
  );
  await aiTool(
    repo,
    ai,
    "set_quote_lines",
    { id: p.id, revision: p.revision, lines: flatQuote(p.quote) },
    scopes,
  );
  p = (await repo.get(p.id))!;
  expect(
    p.content.find((b) => b.type === "pricing_table")!.ai_review?.reviewed,
  ).toBe(false);
  expect(p.content.find((b) => b.type === "heading")!.ai_review?.reviewed).toBe(
    true,
  );
  p = await service.edit(
    p.id,
    { revision: p.revision, title: "Unrelated staff edit" },
    staff,
  );
  expect(p.ai_unreviewed).toBe(true);
  await expect(service.send(p.id, staff)).rejects.toThrow("Confirm review");
  expect((await service.send(p.id, staff, true)).status).toBe("sent");
});
