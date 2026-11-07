import { expect, it } from "vitest";
import { setup } from "./helpers";
import {
  connectorStudioSchemas,
  connectorStudioTool,
  connectorFields,
  validateConnectorFields,
  connectorCover,
  savedBlockView,
} from "../src/lib/connector-studio";
import { studioRevision } from "../src/lib/studio-history";
import { workspaceStarterTemplates } from "../seed/starter-templates";
import type { Item, Template, Audit } from "../src/lib/model";
const actor = (workspace_id: string) => ({
  actor: "ai:Claude",
  workspace_id,
  on_behalf_of_user_id: crypto.randomUUID(),
  on_behalf_of_name: "Taylor Editor",
  ip: "",
  user_agent: "MCP",
});
const call = async (
  f: Awaited<ReturnType<typeof setup>>,
  name: keyof typeof connectorStudioSchemas,
  input: unknown,
) =>
  connectorStudioTool(
    f.repo,
    actor(f.repo.workspaceId),
    name,
    connectorStudioSchemas[name].parse(input),
  );
it("creates hidden templates with supplied prices and field chips; copies starters without changing any proposal", async () => {
  const f = await setup(),
    proposals = await f.repo.list();
  const created: any = await call(f, "create_template", {
    name: "Case studies",
    description: "Reviewed by a person before use",
    content:
      "# Why {{workspace.name}}\n\nOur **work** for {{client.company}}.\n\n## Results\n\n- [Add result]",
    cover: { eyebrow: "Case study", title: "{{proposal.title}}" },
    default_quote_items: f.draft.quote,
  });
  expect(created.active).toBe(false);
  expect(created.connector_created).toBe(true);
  expect(created.default_items[0].sublines[0].amount).toBe(
    f.draft.quote[0].sublines[0].amount,
  );
  expect(created.content[0].type).toBe("page_break");
  expect(JSON.stringify(created.content)).toContain('"type":"variable"');
  expect(created.content.find((b: any) => b.level === 2).text).toBe("Results");
  const starter = workspaceStarterTemplates(
    f.repo.workspaceId,
    await f.repo.entities<Item>("pricing_items"),
  )[0];
  await f.repo.put("templates", starter);
  const copy: any = await call(f, "duplicate_template", {
    template_id: starter.id,
    name: "My case studies",
  });
  expect(copy.active).toBe(false);
  expect(copy.starter_key).toBeUndefined();
  expect(copy.source_starter_key).toBe(starter.starter_key);
  expect(copy.content).toEqual(starter.content);
  expect(copy.cover).toEqual(starter.cover);
  expect(copy.header_footer).toEqual(starter.header_footer);
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === starter.id,
    ),
  ).toEqual(starter);
  expect(await f.repo.list()).toEqual(proposals);
  await expect(
    call(f, "duplicate_template", {
      template_id: crypto.randomUUID(),
      name: "Missing",
    }),
  ).rejects.toMatchObject({ status: 404 });
});
it("rejects unknown fields with the valid list and rejects HTML, unknown availability and invalid quote amounts", async () => {
  const f = await setup();
  await expect(
    call(f, "create_template", {
      name: "Bad",
      content: "Hello {{client.nonexistent}}",
    }),
  ).rejects.toThrow(/Unknown field:.*Valid fields:.*client.company/);
  await expect(
    call(f, "create_saved_block", {
      name: "Bad",
      type: "text",
      content: "{{page.number}}",
    }),
  ).rejects.toThrow(/Unknown field/);
  await expect(
    call(f, "create_template", {
      name: "Bad",
      content: "<script>alert(1)</script>",
    }),
  ).rejects.toThrow(/Unsupported Markdown/);
  expect(() =>
    connectorStudioSchemas.create_template.parse({
      name: "Bad",
      content: "Text",
      active: true,
    }),
  ).toThrow();
  const items = structuredClone(f.draft.quote);
  (items[0].sublines[0] as any).amount = null;
  await expect(
    call(f, "create_template", {
      name: "Bad",
      content: "Text",
      default_quote_items: items,
    }),
  ).rejects.toThrow();
  expect(await f.repo.entities<Audit>("workspace_events")).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "connector_template_created" }),
    ]),
  );
});
it("saved Text/List tools read, replace, safely convert and reject stale revisions; clauses remain plain text", async () => {
  const f = await setup(),
    proposals = await f.repo.list();
  let block: any = await call(f, "create_saved_block", {
    name: "Our work",
    type: "text",
    content: "A **case study** for {{client.company}}.",
  });
  expect(block.type).toBe("text");
  expect(block.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (
      (await call(f, "get_saved_block", {
        saved_block_id: block.saved_block_id,
      })) as any
    ).content,
  ).toBe(block.content);
  const first = block;
  block = await call(f, "update_saved_block", {
    saved_block_id: block.saved_block_id,
    revision: block.revision,
    type: "list",
    content: "1. **Results** for {{client.company}}\n2. Next steps",
  });
  expect(block.content).toContain("1. **Results**");
  block = await call(f, "update_saved_block", {
    saved_block_id: block.saved_block_id,
    revision: block.revision,
    type: "list",
    name: "Renamed ordered list",
  });
  expect(block.content).toContain("1. **Results**");
  expect((await call(f, "list_saved_blocks", {})) as any[]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ saved_block_id: block.saved_block_id }),
    ]),
  );
  await expect(
    call(f, "update_saved_block", {
      saved_block_id: block.saved_block_id,
      revision: first.revision,
      name: "Stale",
    }),
  ).rejects.toMatchObject({ status: 409 });
  const contract: any = await call(f, "create_saved_block", {
    name: "Our terms",
    type: "contract_clause",
    content: "Plain {{workspace.name}} terms, including [guidance].",
  });
  expect(contract.content.clauses[0].body).toContain("[guidance]");
  const next: any = await call(f, "update_saved_block", {
    saved_block_id: contract.saved_block_id,
    revision: contract.revision,
    content: {
      clauses: [
        { ...contract.content.clauses[0], body: "Updated plain terms." },
      ],
    },
  });
  expect(next.content.clauses[0].body).toBe("Updated plain terms.");
  await expect(
    call(f, "update_saved_block", {
      saved_block_id: next.saved_block_id,
      revision: next.revision,
      type: "text",
      content: "Cannot change contract type",
    }),
  ).rejects.toThrow(/type/);
  await expect(
    call(f, "get_saved_block", { saved_block_id: crypto.randomUUID() }),
  ).rejects.toMatchObject({ status: 404 });
  expect(await f.repo.list()).toEqual(proposals);
});
it("unchanged saved-block round trips preserve rich marks, nested structure and IDs", async () => {
  const f = await setup(),
    row = {
      id: crypto.randomUUID(),
      name: "Detailed text",
      block: {
        id: "stable-block",
        type: "paragraph" as const,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Sized word",
                  marks: [{ type: "fontSize", attrs: { size: 24 } }],
                },
              ],
            },
          ],
        },
      },
    };
  await f.repo.put("content_library", row);
  const view = savedBlockView(row);
  await call(f, "update_saved_block", {
    saved_block_id: row.id,
    revision: studioRevision(row),
    content: view.content,
    name: "Renamed",
  });
  expect(
    (await f.repo.entities<any>("content_library")).find((r) => r.id === row.id)
      .block,
  ).toEqual(row.block);
  const allowed = await connectorFields(f.repo);
  const prior = (await f.repo.entities<Template>("templates"))[0];
  const cover = connectorCover(
    prior.cover,
    { eyebrow: "Our {{workspace.name}}" },
    allowed,
  );
  expect(
    cover.elements?.find((e) => e.id === "eyebrow")?.content,
  ).toBeDefined();
  expect(() =>
    validateConnectorFields(
      { type: "variable", attrs: { path: "evil.secret" } },
      allowed,
    ),
  ).toThrow(/Valid fields/);
});
it("new tools enforce the separate scope without widening an existing proposal grant", async () => {
  const { aiTool, toolDefinitions } = await import("../src/lib/ai-tools");
  const f = await setup(),
    ai = actor(f.repo.workspaceId);
  for (const [name, input] of [
    ["create_template", { name: "Scoped", content: "Copy" }],
    [
      "duplicate_template",
      { template_id: f.draft.template_id, name: "Scoped copy" },
    ],
    [
      "create_saved_block",
      { name: "Scoped block", type: "text", content: "Copy" },
    ],
    [
      "update_saved_block",
      {
        saved_block_id: crypto.randomUUID(),
        revision: "a".repeat(64),
        name: "Blocked",
      },
    ],
  ] as const)
    await expect(
      aiTool(f.repo, ai, name, input, ["proposals:read", "proposals:draft"]),
    ).rejects.toMatchObject({ status: 403 });
  const created: any = await aiTool(
    f.repo,
    ai,
    "create_template",
    { name: "Scoped", content: "# Overview\n\nCopy" },
    ["templates:edit"],
  );
  expect(created.available_for_new_proposals).toBe(false);
  const block: any = await aiTool(
    f.repo,
    ai,
    "create_saved_block",
    { name: "Scoped block", type: "text", content: "Copy" },
    ["templates:edit"],
  );
  expect(
    (await aiTool(
      f.repo,
      ai,
      "get_saved_block",
      { saved_block_id: block.saved_block_id },
      ["proposals:read"],
    )) as any,
  ).toMatchObject({ name: "Scoped block" });
  await expect(
    aiTool(
      f.repo,
      ai,
      "get_saved_block",
      { saved_block_id: block.saved_block_id },
      ["templates:edit"],
    ),
  ).rejects.toMatchObject({ status: 403 });
  for (const tool of [
    "create_template",
    "duplicate_template",
    "create_saved_block",
    "update_saved_block",
  ])
    expect(
      toolDefinitions.find((t) => t.name === tool)?.annotations.readOnlyHint,
    ).toBe(false);
  for (const forbidden of [
    "delete_template",
    "hide_template",
    "reset_template",
    "delete_saved_block",
  ])
    await expect(
      aiTool(f.repo, ai, forbidden, {}, [
        "templates:edit",
        "proposals:read",
        "proposals:draft",
      ]),
    ).rejects.toMatchObject({ status: 403 });
});
it("template metadata merges, quotes replace exactly, and starters refuse writes with the copy hint", async () => {
  const f = await setup(),
    template = (await f.repo.entities<Template>("templates"))[0],
    proposals = await f.repo.list();
  const result: any = await call(f, "update_template", {
    template_id: template.id,
    revision: studioRevision(template),
    name: "New name",
    cover: { eyebrow: "{{workspace.name}} case studies" },
    default_quote_items: [],
  });
  expect(result.content).toEqual(template.content);
  expect(result.header_footer).toEqual(template.header_footer);
  expect(result.active).toBe(template.active);
  expect(result.default_items).toEqual([]);
  expect(result.default_quote).toEqual([]);
  await expect(
    call(f, "update_template", {
      template_id: template.id,
      revision: studioRevision(template),
      description: "Stale",
    }),
  ).rejects.toMatchObject({ status: 409 });
  const starter = workspaceStarterTemplates(
    f.repo.workspaceId,
    await f.repo.entities<Item>("pricing_items"),
  )[0];
  await f.repo.put("templates", starter);
  await expect(
    call(f, "update_template", {
      template_id: starter.id,
      revision: studioRevision(starter),
      name: "Cannot edit",
    }),
  ).rejects.toThrow(/duplicate_template first/);
  expect(await f.repo.list()).toEqual(proposals);
  await expect(
    call(f, "create_saved_block", {
      name: "Too long",
      type: "contract_clause",
      content: "x".repeat(30001),
    }),
  ).rejects.toThrow();
});
it("all published tool definitions are valid MCP schemas, including backward-compatible template IDs", async () => {
  const { toolDefinitions, aiTool } = await import("../src/lib/ai-tools"),
    { ToolSchema } = await import("@modelcontextprotocol/sdk/types.js");
  for (const tool of toolDefinitions)
    expect(() => ToolSchema.parse(tool)).not.toThrow();
  const f = await setup(),
    ai = actor(f.repo.workspaceId),
    scopes = ["proposals:read"],
    id = f.draft.template_id;
  const original: any = await aiTool(
      f.repo,
      ai,
      "get_template",
      { id },
      scopes,
    ),
    alias: any = await aiTool(
      f.repo,
      ai,
      "get_template",
      { template_id: id },
      scopes,
    );
  expect(alias).toEqual(original);
  expect(original.revision).toMatch(/^[a-f0-9]{64}$/);
});
