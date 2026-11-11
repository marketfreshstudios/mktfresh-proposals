import { expect, it } from "vitest";
import { aiTool } from "../src/lib/ai-tools";
import { documentQuote } from "../src/lib/document-quote";
import { QuoteItemSchema, type Quote } from "../src/lib/model";
import { quoteSublines, validateItems } from "../src/lib/quote-model";
import { setup } from "./helpers";

it("round-trips the group name through the connector quote tools", async () => {
  const { repo, draft } = await setup();
  const group = crypto.randomUUID();
  const scopes = ["proposals:read", "proposals:draft"];
  const actor = {
    actor: "ai:Claude",
    workspace_id: repo.workspaceId,
    ip: "",
    user_agent: "",
  };
  const items = draft.quote.map((item, index) => ({
    ...item,
    choice_group_id: group,
    choice_group_label: "Web Design Options",
    optional: true,
    default_selected: index === 0,
    selected: index === 0,
  }));
  await aiTool(
    repo,
    actor,
    "set_quote_lines",
    {
      id: draft.id,
      revision: draft.revision,
      items,
    },
    scopes,
  );
  const result = (await aiTool(
    repo,
    actor,
    "get_proposal",
    { id: draft.id },
    scopes,
  )) as {
    items: Quote;
  };
  expect(result.items.map((item) => item.choice_group_label)).toEqual([
    "Web Design Options",
    "Web Design Options",
  ]);
  expect(() =>
    validateItems([
      items[0],
      { ...items[1], choice_group_label: "Different group name" },
    ]),
  ).toThrow("Use the same name");
  expect(() =>
    QuoteItemSchema.parse({ ...items[0], choice_group_label: "X".repeat(81) }),
  ).toThrow();
});

it("renders group names as text in Cards and Table and keeps legacy headings", async () => {
  const { draft } = await setup();
  const group = crypto.randomUUID();
  const legacy = draft.quote.map((item, index) => ({
    ...item,
    optional: true,
    choice_group_id: group,
    choice_group_required: false,
    default_selected: index === 0,
    selected: index === 0,
  }));
  const named = legacy.map((item) => ({
    ...item,
    choice_group_label: "Build <Care>",
  }));
  for (const layout of ["cards", "table"] as const) {
    expect(documentQuote(legacy, "USD", "auto", layout)).toContain(
      "Choose up to one",
    );
    expect(documentQuote(named, "USD", "auto", layout)).toContain(
      "Build &lt;Care&gt;",
    );
    expect(documentQuote(named, "USD", "auto", layout)).not.toContain(
      "Build <Care>",
    );
  }
  expect(quoteSublines(legacy, true)).toEqual(quoteSublines(named, true));
});

it("keeps an empty draft group out of document pricing and prevents a priced placeholder", async () => {
  const { draft, service } = await setup();
  const id = crypto.randomUUID();
  const empty = QuoteItemSchema.parse({
    id,
    order: 0,
    name: "Web Design Options",
    source: "custom",
    choice_group_id: id,
    choice_group_label: "Web Design Options",
    optional: true,
    default_selected: false,
    choice_group_placeholder: true,
    sublines: [],
  });
  expect(() =>
    QuoteItemSchema.parse({ ...empty, sublines: draft.quote[0].sublines }),
  ).toThrow();
  const quote = [...draft.quote, empty];
  expect(quoteSublines(quote, true)).toEqual(quoteSublines(draft.quote, true));
  expect(documentQuote(quote, "USD")).toEqual(
    documentQuote(draft.quote, "USD"),
  );
  expect(
    (await service.checkReady({ ...draft, quote }, false, true)).errors,
  ).toContain("Add at least two options to Web Design Options");
});
