import { cloneQuote } from "../src/lib/quote-model";
import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { aiTool } from "../src/lib/ai-tools";
import { inactiveTemplateItems } from "../src/lib/template-quote";
import type { Item, Template } from "../src/lib/model";
async function inactiveDefault() {
  const ctx = await setup();
  const template = (await ctx.repo.entities<Template>("templates")).find(
    (t) => t.id === ctx.draft.template_id,
  )!;
  const item = (await ctx.repo.entities<Item>("pricing_items")).find(
    (i) => i.id === template.default_quote[0].pricing_item_id,
  )!;
  await ctx.repo.put("pricing_items", { ...item, active: false });
  return { ...ctx, template, item };
}
it.each([false, true])(
  "explicit AI lines replace inactive defaults entirely (empty=%s)",
  async (empty) => {
    const { repo, draft, item } = await inactiveDefault();
    const lines = empty
      ? []
      : cloneQuote(draft.quote).filter((l) => l.pricing_item_id !== item.id);
    const result = (await aiTool(
      repo,
      { ...staff, workspace_id: repo.workspaceId, actor: "ai:Assistant" },
      "create_proposal_draft",
      {
        brief: "Discovery",
        template_id: draft.template_id,
        client_id: draft.client.id,
        title: "Proposal",
        content_markdown: "Scope",
        items: lines,
      },
      ["proposals:read", "proposals:draft"],
    )) as any;
    expect(result.items.map(({ ai_entered, ...i }: any) => i)).toEqual(lines);
    expect(result.items).toHaveLength(lines.length);
    expect(result.warnings).toEqual([]);
  },
);
it("omitted AI lines skip inactive defaults and report warnings in response and first event", async () => {
  const { repo, draft, item, template } = await inactiveDefault();
  const result = (await aiTool(
    repo,
    { ...staff, workspace_id: repo.workspaceId, actor: "ai:Assistant" },
    "create_proposal_draft",
    {
      brief: "Discovery",
      template_id: draft.template_id,
      client_id: draft.client.id,
      title: "Proposal",
      content_markdown: "Scope",
    },
    ["proposals:read", "proposals:draft"],
  )) as any;
  expect(result.quote).toHaveLength(template.default_quote.length - 1);
  expect(result.quote.some((l: any) => l.pricing_item_id === item.id)).toBe(
    false,
  );
  expect(result.warnings).toEqual([expect.stringContaining(item.name)]);
  expect((await repo.get(result.id))!.events[0].metadata.warnings).toEqual(
    result.warnings,
  );
});
it("staff creation skips inactive and missing defaults while preserving active defaults", async () => {
  const { service, repo, draft, item, template } = await inactiveDefault();
  const missing = "00000000-0000-4000-8000-000000000999";
  template.default_quote.push({
    pricing_item_id: missing,
    qty: 1,
    optional: false,
    selected: true,
  });
  await repo.put("templates", template);
  const p = await service.create(
    {
      client_id: draft.client.id,
      template_id: template.id,
      title: "Default quote",
      valid_until: new Date(Date.now() + 86400000).toISOString(),
    },
    staff,
  );
  expect(p.creation_warnings).toEqual([
    expect.stringContaining(item.name),
    expect.stringContaining(missing),
  ]);
  expect(p.quote).toHaveLength(template.default_quote.length - 2);
  const custom = await service.create(
    {
      client_id: draft.client.id,
      template_id: template.id,
      title: "Explicit quote",
      valid_until: new Date(Date.now() + 86400000).toISOString(),
      quote: [],
    },
    staff,
  );
  expect(custom.quote).toEqual([]);
  expect(custom.creation_warnings).toEqual([]);
  expect(
    inactiveTemplateItems(template, await repo.entities<Item>("pricing_items")),
  ).toHaveLength(2);
});
