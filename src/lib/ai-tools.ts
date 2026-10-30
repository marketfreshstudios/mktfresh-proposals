import { AddressSchema, PhoneInputSchema, clientView } from "./client-contact";
import { saveClient } from "./clients";
import { cloneQuote, quoteSublines } from "./quote-model";
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
  QuoteItemSchema,
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
  "update_client",
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
  update_client: z
    .object({
      id,
      company: ClientSchema.shape.company.optional(),
      first_name: ClientSchema.shape.first_name.optional(),
      last_name: ClientSchema.shape.last_name.optional(),
      title: ClientSchema.shape.title,
      email: ClientSchema.shape.email.optional(),
      phone: z.string().max(80).optional(),
      address: AddressSchema.optional(),
      notes: z.string().max(10000).optional(),
    })
    .strict(),
  create_client: ClientSchema.extend({
    phone: PhoneInputSchema,
    address: AddressSchema.optional(),
  })
    .omit({
      id: true,
      qbo_customer_id: true,
      stripe_customer_id: true,
    })
    .strict(),
  create_proposal_draft: z.object({
    brief: z.string().min(1).max(50000),
    template_id: id,
    client_id: id,
    title: z.string().min(1).max(300),
    valid_until: z.string().nullable().optional(),
    content_markdown: z.string().max(100000),
    items: z.array(QuoteItemSchema).max(100).optional(),
  }),
  update_proposal_draft: z.object({
    id,
    revision: z.number().int(),
    title: z.string().min(1).max(300).optional(),
    brief: z.string().max(50000).optional(),
    valid_until: z.string().nullable().optional(),
    content_markdown: z.string().max(100000).optional(),
    items: z.array(QuoteItemSchema).max(100).optional(),
  }),
  set_quote_lines: z.object({
    id,
    revision: z.number().int(),
    items: z.array(QuoteItemSchema).max(100),
  }),
  check_ready: z.object({ id }),
};
export const toolDefinitions = Object.entries(schemas).map(
  ([name, schema]) => ({
    name,
    description: `${["create_client", "get_client", "update_client"].includes(name) ? "Client phone is E.164 with phone_formatted for display; invalid unsaved legacy values return phone=null and phone_needs_review=true. Address: line1, line2, city, region, postal_code, country (ISO 3166 alpha-2; defaults US). Updating contacts never changes provider links. " : ""}${["create_proposal_draft", "update_proposal_draft", "set_quote_lines", "get_proposal", "list_catalog", "check_ready"].includes(name) ? "Quote items have order, optional/default_selected/choice_group_id and sublines with cents/qty/interval/provider mapping. Supply current quote items with sublines. Flat lines inputs are rejected. Client must choose exactly one item per choice group before signing. Amounts are given by you, never calculated or suggested. " : ""}${name === "list_catalog" ? "list products" : name.replaceAll("_", " ")}. Workspace-scoped. ${["create_client", "update_client"].includes(name) ? "Contact data only; provider links require staff review in the app." : WRITE_TOOLS.includes(name as any) ? "Draft changes only; a person must review and send." : "Read only."}`,
    inputSchema: z.toJSONSchema(schema, { target: "draft-7", io: "input" }),
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
    valid_until: p.valid_until,
    client: p.client,
    content: p.content,
    quote: cloneQuote(p.quote),
    items: cloneQuote(p.quote),
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
  service = new ProposalService(repo),
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
  check(
    !(raw && typeof raw === "object" && "lines" in raw),
    "Flat lines are no longer supported; supply items with sublines",
  );
  const input = schemas[name].parse(raw) as any;
  if (name === "set_quote_lines")
    check(input.items !== undefined, "Items required");
  if (name === "search_clients")
    return (await repo.entities<Client>("clients"))
      .filter((c) =>
        (c.company + " " + c.email)
          .toLowerCase()
          .includes(input.query.toLowerCase()),
      )
      .slice(0, 50)
      .map(clientView);
  if (name === "list_templates") return repo.entities<Template>("templates");
  if (name === "list_catalog")
    return sellableCatalogue(await repo.entities<Item>("pricing_items")).map(
      (i) => ({
        ...i,
        synced_name: i.name,
        name: itemDisplayName(i),
        sublines: i.sublines ?? [
          {
            id: i.id,
            amount: i.amount,
            list_amount: i.amount,
            interval: i.interval,
            qty: 1,
            stripe_lookup_key: i.stripe_lookup_key,
            qbo_item_ref: i.qbo_item_ref,
          },
        ],
        optional: false,
        default_selected: true,
        choice_group_id: null,
        order: 0,
      }),
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
    return name === "get_client" ? clientView(entity as Client) : entity;
  }
  if (name === "search_proposals")
    return (await repo.list(input.query)).slice(0, 30).map(proposalView);
  if (name === "create_client" || name === "update_client") {
    const previous =
      name === "update_client"
        ? (await repo.entities<Client>("clients")).find(
            (c) => c.id === input.id,
          )
        : undefined;
    if (name === "update_client") check(previous, "Client not found", 404);
    const client = await saveClient(repo, {
      ...previous,
      ...input,
      id: previous?.id ?? randomUUID(),
    });
    await repo.put("workspace_events", {
      id: randomUUID(),
      type: name === "create_client" ? "client_created" : "client_saved",
      ...actor,
      created_at: new Date().toISOString(),
      metadata: { client_id: client.id },
    });
    return clientView(client);
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
      input.items ??
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
        valid_until: input.valid_until,
        brief: input.brief,
        document_versions: await readDocumentsForDraft(repo, actor),
        content: [
          ...blocks,
          ...template.content.filter((b) => b.type === "contract"),
          { type: "pricing_table" },
          { type: "signature_block", role: "client" },
          { type: "signature_block", role: "company" },
        ],
        quote: input.items,
      },
      actor,
    );
    return proposalView(p);
  }
  const p = await repo.get(input.id);
  check(p, "Not found", 404);
  if (name === "get_proposal") return proposalView(p);
  if (name === "check_ready") return service.checkReady(p);
  check(p.status === "draft", "AI assistants may only modify drafts", 403);
  const content =
    input.content_markdown === undefined
      ? undefined
      : [
          ...markdownBlocks(input.content_markdown, Object.keys(variables(p))),
          ...p.content.filter((b) => b.type === "contract"),
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
        valid_until: input.valid_until,
        quote: input.items,
      },
      actor,
    ),
  );
}
