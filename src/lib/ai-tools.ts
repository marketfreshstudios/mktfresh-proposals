import { itemDisplayName, sellableCatalogue } from "./catalogue-display";
import { templateDefaultQuote } from "./template-quote";
import {
  documents,
  recordDocumentRead,
  readDocumentsForDraft,
} from "./documents";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ClientSchema,
  LineSchema,
  check,
  type Actor,
  type Client,
  type Item,
  type Template,
  type Proposal,
} from "./model";
import type { Repository } from "./repository";
import { ProposalService, event } from "./service";
import { variables } from "./content";
import { markdownBlocks } from "./markdown";
import { readiness } from "./quote";
export const READ_TOOLS = [
  "search_clients",
  "get_client",
  "list_templates",
  "get_template",
  "list_catalog",
  "list_documents",
  "get_document",
  "search_proposals",
  "get_proposal",
] as const;
export const WRITE_TOOLS = [
  "create_client",
  "create_proposal_draft",
  "update_proposal_draft",
  "set_quote_lines",
  "check_ready",
] as const;
const id = z.string().uuid();
const schemas: Record<string, z.ZodType> = {
  search_clients: z.object({ query: z.string().max(200).default("") }),
  get_client: z.object({ id }),
  list_templates: z.object({}),
  get_template: z.object({ id }),
  list_catalog: z.object({}),
  list_documents: z.object({}),
  get_document: z.object({ id }),
  search_proposals: z.object({ query: z.string().max(200).default("") }),
  get_proposal: z.object({ id }),
  create_client: ClientSchema.omit({
    id: true,
    qbo_customer_id: true,
    stripe_customer_id: true,
  }),
  create_proposal_draft: z.object({
    brief: z.string().min(1).max(50000),
    template_id: id,
    client_id: id,
    title: z.string().min(1).max(300),
    content_markdown: z.string().max(100000),
    lines: z.array(LineSchema).max(100).optional(),
  }),
  update_proposal_draft: z.object({
    id,
    revision: z.number().int(),
    title: z.string().min(1).max(300).optional(),
    brief: z.string().max(50000).optional(),
    content_markdown: z.string().max(100000).optional(),
  }),
  set_quote_lines: z.object({
    id,
    revision: z.number().int(),
    lines: z.array(LineSchema).max(100),
  }),
  check_ready: z.object({ id }),
};
export const toolDefinitions = Object.entries(schemas).map(
  ([name, schema]) => ({
    name,
    description: `${name.replaceAll("_", " ")}. Workspace-scoped. ${WRITE_TOOLS.includes(name as any) ? "Draft changes only; a person must review and send." : "Read only."}`,
    inputSchema: z.toJSONSchema(schema, { target: "draft-7" }),
    annotations: {
      readOnlyHint:
        !(WRITE_TOOLS as readonly string[]).includes(name) ||
        name === "check_ready",
      destructiveHint: false,
      openWorldHint: false,
    },
  }),
);
function proposalView(p: Proposal) {
  return {
    id: p.id,
    revision: p.revision,
    title: p.title,
    status: p.status,
    client: p.client,
    content: p.content,
    quote: p.quote,
    warnings: p.creation_warnings ?? [],
    brief: p.brief,
    ai_unreviewed: p.ai_unreviewed,
    search_text: p.search_text.slice(0, 50000),
  };
}
export async function aiTool(
  repo: Repository,
  actor: Actor,
  name: string,
  raw: unknown,
  scopes: string[],
) {
  check(
    actor.actor.startsWith("ai:") && actor.workspace_id === repo.workspaceId,
    "AI workspace authorization required",
    403,
  );
  check(name in schemas, "This action is forbidden for AI assistants", 403);
  const writing =
    (WRITE_TOOLS as readonly string[]).includes(name) && name !== "check_ready";
  check(
    scopes.includes(writing ? "proposals:draft" : "proposals:read"),
    "Insufficient connector scope",
    403,
  );
  const input = schemas[name].parse(raw) as any;
  const service = new ProposalService(repo);
  if (name === "search_clients")
    return (await repo.entities<Client>("clients"))
      .filter((c) =>
        (c.company + " " + c.email)
          .toLowerCase()
          .includes(input.query.toLowerCase()),
      )
      .slice(0, 50);
  if (name === "list_templates") return repo.entities<Template>("templates");
  if (name === "list_catalog")
    return sellableCatalogue(await repo.entities<Item>("pricing_items")).map(
      (i) => ({ ...i, synced_name: i.name, name: itemDisplayName(i) }),
    );
  if (name === "list_documents")
    return (await documents(repo)).map(
      ({ content: _content, url: _url, has_auth: _auth, ...doc }) => doc,
    );
  if (name === "get_document") {
    const doc = (await documents(repo)).find((d) => d.id === input.id);
    check(doc && doc.content_hash, "Reference has no successful version", 404);
    await recordDocumentRead(repo, actor, doc);
    const { url: _url, has_auth: _auth, ...view } = doc;
    return view;
  }
  if (["get_client", "get_template"].includes(name)) {
    const table = name === "get_client" ? "clients" : "templates";
    const entity = (await repo.entities<{ id: string }>(table)).find(
      (e) => e.id === input.id,
    );
    check(entity, "Not found", 404);
    return entity;
  }
  if (name === "search_proposals")
    return (await repo.list(input.query)).slice(0, 30).map(proposalView);
  if (name === "create_client") {
    const client = ClientSchema.parse({ ...input, id: randomUUID() });
    await repo.put("clients", client);
    await repo.put("workspace_events", {
      id: randomUUID(),
      type: "client_created",
      ...actor,
      created_at: new Date().toISOString(),
      metadata: { client_id: client.id },
    });
    return client;
  }
  if (name === "create_proposal_draft") {
    const settings = (
      await repo.entities<{ id: string; default_validity_days: number }>(
        "workspace_settings",
      )
    )[0];
    check(settings, "Workspace settings required");
    // Validate content before persisting a draft, using a provisional variable map.
    const client = (await repo.entities<Client>("clients")).find(
      (c) => c.id === input.client_id,
    );
    check(client, "Client not found", 404);
    const template = (await repo.entities<Template>("templates")).find(
      (t) => t.id === input.template_id && t.active,
    );
    check(template, "Active template required");
    const quoteForVariables =
      input.lines ??
      templateDefaultQuote(template, await repo.entities<Item>("pricing_items"))
        .quote;
    const allowed = Object.keys(
      variables({
        client,
        title: input.title,
        quote: quoteForVariables,
        currency: "USD",
        valid_until: new Date().toISOString(),
        created_at: new Date().toISOString(),
        sent_at: null,
      } as Proposal),
    );
    const blocks = markdownBlocks(input.content_markdown, allowed);
    const p = await service.create(
      {
        ...input,
        valid_until: new Date(
          Date.now() + settings.default_validity_days * 86400000,
        ).toISOString(),
        brief: input.brief,
        document_versions: await readDocumentsForDraft(repo, actor),
        content: [
          ...blocks,
          { type: "pricing_table" },
          { type: "signature_block", role: "client" },
          { type: "signature_block", role: "company" },
        ],
        quote: input.lines,
      },
      actor,
    );
    return proposalView(p);
  }
  const p = await repo.get(input.id);
  check(p, "Not found", 404);
  if (name === "get_proposal") return proposalView(p);
  if (name === "check_ready")
    return readiness(
      await service.forRead(p),
      await repo.entities<Item>("pricing_items"),
    );
  check(p.status === "draft", "AI assistants may only modify drafts", 403);
  const content =
    input.content_markdown === undefined
      ? undefined
      : [
          ...markdownBlocks(input.content_markdown, Object.keys(variables(p))),
          { type: "pricing_table" as const },
          { type: "signature_block" as const, role: "client" as const },
          { type: "signature_block" as const, role: "company" as const },
        ];
  return proposalView(
    await service.edit(
      p.id,
      {
        revision: input.revision,
        title: input.title,
        brief: input.brief,
        content,
        quote: input.lines,
      },
      actor,
    ),
  );
}
