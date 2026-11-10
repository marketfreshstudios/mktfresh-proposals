import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { starterId } from "../seed/starter-templates";
import { marketFreshWebsiteChoices } from "../seed/oiot-quote";
import { planAwarePaymentPlanClause } from "../seed/oiot-clause";
import { oiotCarePlans } from "../seed/oiot-plan";
import {
  billingLines,
  chooseItem,
  draftItems,
  validateItems,
  visibleQuote,
} from "../src/lib/quote-model";
import { variables, renderBlocks, totals } from "../src/lib/presentation";
import { readiness } from "../src/lib/quote";
import { documentQuote } from "../src/lib/document-quote";
import { StripeProvider } from "../src/lib/providers/stripe";
import type { StripeTransport } from "../src/lib/catalog";
import { setup, staff, clientActor, signature } from "./helpers";
import type { Item, QuoteItem } from "../src/lib/model";

async function scenario() {
  const f = await setup();
  const catalog = await f.repo.entities<Item>("pricing_items");
  const quote = marketFreshWebsiteChoices(catalog, (key) =>
    starterId(f.draft.id, key),
  )!;
  const build = quote.find((item) => item.oiot_build)!;
  const now = quote[0];
  const care = quote.slice(-2);
  const content = f.draft.content.map((block) =>
    block.type === "contract"
      ? { ...block, clauses: [planAwarePaymentPlanClause] }
      : block,
  );
  return { ...f, catalog, quote, build, now, care, content };
}
function addKickoff(item: QuoteItem): QuoteItem {
  return {
    ...item,
    oiot_purchase_price: 375000,
    sublines: [
      {
        id: randomUUID(),
        label: "Kickoff",
        interval: "one_time",
        amount: 150000,
        qty: 1,
        oiot_kickoff: true,
        list_amount: null,
        stripe_lookup_key: null,
        qbo_item_ref: null,
      },
    ],
  };
}
it("keeps the draft unpriced, validates required defaults, and rejects hidden or circular choices", async () => {
  const f = await scenario();
  expect(f.build.sublines).toEqual([]);
  expect(
    readiness({ ...f.draft, content: f.content, quote: f.quote }, f.catalog)
      .errors,
  ).toEqual(
    expect.arrayContaining([
      "Enter the kickoff amount for Own It Over Time",
      "Enter the website purchase price for Own It Over Time",
    ]),
  );
  expect(() => chooseItem(f.quote, f.care[1].id, true)).toThrow(
    "not currently available",
  );
  expect(() => chooseItem(f.quote, f.now.id, false)).toThrow(
    "required choice group",
  );
  const cycle = f.quote.map((item) =>
    item.id === f.build.id
      ? {
          ...item,
          show_when: { kind: "quote_item" as const, id: f.care[1].id },
        }
      : item,
  );
  expect(() => validateItems(cycle)).toThrow("cannot loop");
  const noDefault = draftItems(
    f.quote.map((item) => ({
      ...item,
      default_selected: item.id === f.build.id,
    })),
  );
  expect(
    readiness({ ...f.draft, quote: noDefault, content: f.content }, f.catalog)
      .errors,
  ).toContain(
    "Add a required Own It Over Time care group with a default plan.",
  );
  const unrelatedCare = {
    ...f.quote[2],
    choice_group_id: f.care[0].choice_group_id,
    choice_group_required: true,
    show_when: f.care[0].show_when,
  };
  expect(
    readiness(
      {
        ...f.draft,
        content: f.content,
        quote: f.quote.map((item) =>
          item.id === unrelatedCare.id ? unrelatedCare : item,
        ),
      },
      f.catalog,
    ).errors,
  ).toContain(
    "Add a required Own It Over Time care group with a default plan.",
  );
});

it("switches branches, deselects hidden options, and supports clearing optional groups", async () => {
  const f = await scenario();
  const funded = f.quote.map((item) =>
    item.id === f.build.id ? addKickoff(item) : item,
  );
  const essentials = visibleQuote(funded)[2];
  const withCare = chooseItem(funded, essentials.id, true);
  expect(totals(withCare)).toMatchObject({
    one_time_total: 275000,
    monthly_total: 2500,
  });
  expect(totals(chooseItem(withCare, essentials.id, false)).monthly_total).toBe(
    0,
  );
  const standard = chooseItem(withCare, f.build.id, true);
  expect(standard.find((item) => item.id === essentials.id)?.selected).toBe(
    false,
  );
  expect(totals(standard)).toMatchObject({
    one_time_total: 150000,
    monthly_total: 17500,
  });
  const pro = chooseItem(standard, f.care[1].id, true);
  expect(totals(pro)).toMatchObject({
    one_time_total: 150000,
    monthly_total: 23900,
  });
  expect(documentQuote(pro, "USD")).not.toContain(essentials.name);
  expect(documentQuote(pro, "USD", "auto", "table")).not.toContain(
    essentials.name,
  );
  const reverted = chooseItem(pro, f.now.id, true);
  expect(reverted.find((item) => item.id === f.care[1].id)?.selected).toBe(
    false,
  );
  expect(totals(reverted)).toMatchObject({
    one_time_total: 275000,
    monthly_total: 0,
  });
  expect(totals(chooseItem(reverted, f.build.id, true)).monthly_total).toBe(
    17500,
  );
});

for (const [index, amounts] of [
  [0, [17500, 10000]],
  [1, [23900, 16400]],
] as const) {
  it(`freezes ${oiotCarePlans[index].name} and only schedules the lower price after the 30th paid invoice`, async () => {
    const f = await scenario();
    const plan = oiotCarePlans[index];
    const [monthly, reduced] = amounts;
    let p = await f.service.edit(
      f.draft.id,
      {
        revision: f.draft.revision,
        content: f.content,
        quote: f.quote.map((item) =>
          item.id === f.build.id ? addKickoff(item) : item,
        ),
      },
      staff,
    );
    expect(readiness(p, f.catalog).errors).toEqual([]);
    p = await f.service.send(p.id, staff);
    const choose = (id: string) =>
      f.service.toggle(
        p.token!,
        "",
        { revision: p.revision, item_id: id, selected: true },
        clientActor,
      );
    p = await choose(f.build.id);
    if (index) p = await choose(f.care[index].id);
    expect(variables(p)).toMatchObject({
      "oiot.monthly": `$${monthly / 100}`,
      "oiot.step_down": `$${reduced / 100}`,
      "oiot.step_down_plan": plan.stepDownPlan,
    });
    expect(renderBlocks(p.content, p.quote, variables(p), "USD")).toContain(
      `from $${monthly / 100} to $${reduced / 100} per month`,
    );
    p = await f.service.sign(
      p.id,
      signature(p.revision),
      "client",
      clientActor,
      { token: p.token!, password: "" },
    );
    const frozen = p.versions.at(-1)!;
    expect(frozen.frozen).toBe(true);
    expect(frozen.variables_resolved["oiot.monthly"]).toBe(`$${monthly / 100}`);
    const lines = billingLines(frozen.quote);
    expect(lines.map((line) => [line.interval, line.amount])).toEqual([
      ["one_time", 150000],
      ["month", monthly],
    ]);
    const line = lines[1];
    expect(line.stripe_lookup_key).toBe(plan.lookup);
    expect(line.schedule).toEqual({
      after_paid_invoices: 30,
      then: { amount: reduced, lookup_key: plan.stepDownLookup },
    });
    const paid = Array.from({ length: 29 }, (_, n) => ({
      id: `in_${n}`,
      amount_paid: monthly,
      status: "paid",
    }));
    const late = { id: "in_late", amount_paid: 0, status: "open" };
    const writes: { path: string; params: Record<string, unknown> }[] = [];
    const api: StripeTransport = {
      async get<T>(path: string, params: Record<string, string>) {
        if (path === "/v1/invoices")
          return { data: [...paid, late], has_more: false } as T;
        const lookup = params["lookup_keys[]"];
        expect([plan.lookup, plan.stepDownLookup]).toContain(lookup);
        const initial = lookup === plan.lookup;
        return {
          data: [
            {
              id: initial ? "price_initial" : "price_stepdown",
              recurring: { interval: "month" },
              unit_amount: initial ? monthly : reduced,
              product: { active: true },
              metadata: {},
            },
          ],
          has_more: false,
        } as T;
      },
      async post<T>(path: string, params: Record<string, unknown>) {
        writes.push({ path, params });
        return (
          path === "/v1/subscriptions" ? subscription : { id: "sub_sched_test" }
        ) as T;
      },
    };
    const provider = new StripeProvider(api, f.repo);
    const subscription: Parameters<StripeProvider["configureSchedule"]>[0] = {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      schedule: null,
      default_payment_method: null,
      currency: "usd",
      current_period_start: 1800000000,
      current_period_end: 1802678400,
      latest_invoice: late.id,
      metadata: { plan: plan.lookup },
      items: {
        data: [
          {
            id: "si_test",
            quantity: 1,
            price: {
              id: "price_initial",
              unit_amount: monthly,
              lookup_key: plan.lookup,
              recurring: { interval: "month" },
              currency: "usd",
            },
          },
        ],
      },
    };
    expect(
      await provider.finishSetup("cus_test", [line], "pm_test", "setup", {
        currency: "usd",
        collection_method: "charge_automatically",
        proposal_id: p.id,
      }),
    ).toEqual([subscription.id]);
    expect(writes).toMatchObject([
      {
        path: "/v1/subscriptions",
        params: {
          items: [{ price: "price_initial", quantity: 1 }],
          metadata: { plan: plan.lookup, proposal_id: p.id },
        },
      },
    ]);
    writes.length = 0;
    await provider.configureSchedule(subscription, line, "missed", p.id);
    expect(writes).toEqual([]);
    late.status = "paid";
    late.amount_paid = monthly;
    await provider.configureSchedule(subscription, line, "caught-up", p.id);
    expect(writes[1]).toMatchObject({
      path: "/v1/subscription_schedules/sub_sched_test",
      params: {
        phases: [
          {
            end_date: subscription.current_period_end,
            metadata: { plan: plan.lookup },
          },
          {
            items: [{ price: "price_stepdown", quantity: 1 }],
            metadata: { plan: plan.stepDownLookup },
          },
        ],
      },
    });
  });
}

it("migrates the exact legacy starter and matching draft after deploy while preserving edited and published quotes", async () => {
  const { readFile } = await import("node:fs/promises");
  const { postgresFixture } = await import("./postgres-fixture");
  const { starterTemplates } = await import("../seed/starter-templates");
  const { QuoteSchema } = await import("../src/lib/model");
  const f = await scenario(),
    db = await postgresFixture();
  const catalog = f.catalog.map((item) =>
    item.sku === "oiot-monthly"
      ? {
          ...item,
          sku: "oiot-monthly-175",
          stripe_lookup_key: "oiot-monthly-175",
        }
      : item.sku === "oiot-pro-monthly-239"
        ? { ...item, schedule: null }
        : item,
  );
  const template = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog: catalog.filter((item) => item.sku !== "oiot-pro-monthly-239"),
  })[1];
  template.default_items!.push({
    ...template.default_items![2],
    id: randomUUID(),
    order: 3,
    name: "Included with Own It Over Time",
    pricing_item_id: null,
    source: "custom",
    sublines: [
      {
        id: randomUUID(),
        amount: 0,
        qty: 1,
        interval: "one_time",
        list_amount: null,
        qbo_item_ref: null,
        stripe_lookup_key: null,
      },
    ],
  });
  const matching = {
    ...f.draft,
    template_id: template.id,
    quote: template.default_items,
    content: template.content,
  };
  const edited = {
    ...matching,
    id: randomUUID(),
    quote: matching.quote!.map((item, n) =>
      n === 0
        ? { ...item, sublines: [{ ...item.sublines[0], amount: 310000 }] }
        : item,
    ),
  };
  const sent = await f.service.send(f.draft.id, staff);
  const published = {
    ...sent,
    id: randomUUID(),
    template_id: template.id,
    revision: 0,
  };
  try {
    for (const item of catalog)
      await db.query(
        "insert into pricing_items(id,workspace_id,data) values($1,$2,$3)",
        [item.id, f.repo.workspaceId, item],
      );
    await db.query(
      "insert into templates(id,workspace_id,data) values($1,$2,$3)",
      [template.id, f.repo.workspaceId, template],
    );
    await db.query(
      "insert into clients(id,workspace_id,data) values($1,$2,$3)",
      [f.draft.client.id, f.repo.workspaceId, f.draft.client],
    );
    for (const draft of [matching, edited, published])
      await db.query("select save_proposal($1::jsonb,-1)", [draft]);
    const readStates = async () => ({
      templates: (
        await db.query<{ data: typeof template }>(
          "select data from templates order by id",
        )
      ).rows,
      proposals: (
        await db.query<{ state: typeof matching }>(
          "select state from proposals order by id",
        )
      ).rows,
      versions: (
        await db.query("select data from proposal_versions order by id")
      ).rows,
    });
    const before = await readStates();
    const sql = await readFile(
      "supabase/migrations/20261110210500_oiot_standard_pro.sql",
      "utf8",
    );
    await db.exec(sql);
    const after = await readStates();
    expect(after.versions).toEqual(before.versions);
    const changed = after.templates.find(
      ({ data }) => data.id === template.id,
    )!.data;
    const expected = marketFreshWebsiteChoices(catalog, (key) =>
      starterId(template.id, `website-choice:${key}`),
    )!;
    expect(QuoteSchema.parse(changed.default_items)).toEqual(expected);
    expect(
      changed.content.flatMap((block) => block.clauses ?? []),
    ).toContainEqual(planAwarePaymentPlanClause);
    expect(
      after.proposals.find(({ state }) => state.id === matching.id)?.state,
    ).toMatchObject({ quote: changed.default_items, revision: 1 });
    for (const p of [edited, published])
      expect(after.proposals.find(({ state }) => state.id === p.id)).toEqual(
        before.proposals.find(({ state }) => state.id === p.id),
      );
    await db.exec(sql);
    expect(await readStates()).toEqual(after);
  } finally {
    await db.close();
  }
});
