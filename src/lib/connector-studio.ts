import {
  templateMarkdown,
  templateMarkdownBlocks,
  replaceTemplateMarkdown,
  templateBlockLabel,
} from "./connector-template-markdown";
import { validateStyles } from "./studio";
import { withSignatureHeadings } from "./signature-headings";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  check,
  ContractClauseSchema,
  QuoteItemSchema,
  type Actor,
  type Block,
  type Item,
  type RichText,
  type Template,
} from "./model";
import type { Repository } from "./repository";
import { markdownBlocks } from "./markdown";
import {
  coverElements,
  coverPlainText,
  coverText,
  defaultCover,
  loadedCover,
  type Cover,
} from "./cover";
import { fieldNodes } from "./editor-fields";
import { reviewBlocks } from "./ai-review";
import { contentAfterCover } from "./cover";
import { authoringPreview } from "./authoring-preview";
import { variables } from "./content";
import type { WorkspaceSettings } from "./workspace";
import { catalogQuoteItem, prepareQuote } from "./quote-model";
import { templateAuthoringItems } from "./template-quote";
import { TemplateInputSchema } from "./template-library";
import {
  studioRevision,
  assertStudioRevision,
  storedStudioEntity,
  writeStudioEntity,
} from "./studio-history";
import { convertSavedBlockType, savedBlockType } from "./saved-block-type";

const id = z.string().uuid(),
  revision = z
    .string()
    .regex(
      /^[a-f0-9]{64}$/,
      "Use the revision returned by get_template or get_saved_block",
    );
const name = z.string().trim().min(1).max(200),
  text = z.string().max(100000);
const cover = z.record(z.string().min(1).max(100), z.string().max(4000));
const items = z.array(QuoteItemSchema).max(100);
const blockType = z.enum(["text", "list", "contract_clause"]);
const clauseContent = z
  .object({ clauses: z.array(ContractClauseSchema.strict()).min(1).max(100) })
  .strict();
const blockContent = z.union([text, clauseContent]);
export const connectorStudioSchemas = {
  create_template: z
    .object({
      name,
      description: z.string().max(1000).optional(),
      content: text,
      cover: cover.optional(),
      default_quote_items: items.optional(),
    })
    .strict(),
  update_template: z
    .object({
      template_id: id,
      revision,
      name: name.optional(),
      description: z.string().max(1000).optional(),
      content: text.optional(),
      cover: cover.optional(),
      default_quote_items: items.optional(),
      remove_blocks: z.array(z.string().min(1).max(200)).max(300).optional(),
    })
    .strict(),
  duplicate_template: z.object({ template_id: id, name }).strict(),
  create_saved_block: z
    .object({ name, type: blockType, content: blockContent })
    .strict(),
  update_saved_block: z
    .object({
      saved_block_id: id,
      revision,
      name: name.optional(),
      type: blockType.optional(),
      content: blockContent.optional(),
    })
    .strict(),
  list_saved_blocks: z.object({}).strict(),
  get_saved_block: z.object({ saved_block_id: id }).strict(),
};
export const CONNECTOR_STUDIO_WRITES = [
  "create_template",
  "update_template",
  "duplicate_template",
  "create_saved_block",
  "update_saved_block",
];
const markerRules =
  "Each <!-- yeswell:block:ID --> is an opaque id only, never block JSON. A marker alone preserves the entire block. Keep it exactly once on its own line, with any edited Markdown immediately after it; move the marker with its text to move that block. Object markers move their preserved blocks without echoing their data. Unknown, duplicated or edited markers are rejected. A missing ordinary text/list/heading/image/divider marker removes that block. A missing pricing_table, signature_block, contract or page_break marker is REFUSED unless its id is explicitly listed in update_template remove_blocks: [ids]; also omit the marker when removing. Newly inserted ordinary Markdown needs no marker. ";
export const connectorStudioDescriptions: Record<string, string> = {
  create_template:
    "Create a hidden template for human review. content is proposal Markdown: # section, ##/### subheads, paragraphs, bold/italic and flat lists. cover maps line IDs (eyebrow, title, prepared_for, byline, date, validity) to text with valid fields. default_quote_items uses set_quote_lines items/sublines; supply exact provided or list_catalog amounts, never invent or calculate prices. Requires templates:edit; reconnect to grant it.",
  get_template:
    "Read a template as content Markdown with preservation markers, cover text keyed by stored line id, default_quote_items, revision and a block-id/type summary. Implicit cover title inherits proposal.title and is omitted from cover. Starters are read-only: duplicate_template first. " +
    markerRules +
    "Read-only metadata (active, starter_key, blocks) is not an update argument. Use the returned revision when writing. Preservation markers are only for update_template, never for proposal Markdown.",
  update_template:
    "Update a non-starter template using the latest get_template revision; on 409 read again, merge and retry. Provided content replaces the body subject to marker/removal guards; provided default_quote_items replace the quote; cover merges only supplied text lines, retaining images/layout/spacing. Omitted fields remain unchanged. " +
    markerRules +
    "remove_blocks requires content. Edited text supports the same Markdown as proposals; unchanged marked blocks keep their exact rich data. Staff can Restore previous version. Starters are read-only: duplicate_template first. Availability is human-only. Supply agreed or exact list_catalog amounts, never invent/calculate prices. Requires templates:edit.",
  duplicate_template:
    "Copy any template, including a read-only Yeswell starter, into a hidden editable template. Use this before customizing a starter. A person must review and enable it in Studio. No proposals are changed. Requires templates:edit.",
  create_saved_block:
    "Create a reusable text, list or plain contract_clause block. Text/list content uses proposal Markdown (no HTML or images); contract_clause uses plain text or {clauses:[{id,heading,body,show_when}]}, preserving Studio's plain-text clauses. No proposal is changed. Requires templates:edit.",
  update_saved_block:
    "Update a saved block with the latest get_saved_block revision. Provided content replaces the whole block's content; name merges. Only Text ↔ List conversions are allowed; contracts keep their type. Previous state is retained for staff Restore. On 409 read again, merge and retry. No proposals are changed. Requires templates:edit.",
  list_saved_blocks:
    "Read workspace saved blocks, their types and revisions. No proposal is changed.",
  get_saved_block:
    "Read a saved block's name, type, revision and content in the shape update_saved_block accepts. Contract clauses remain plain text. Image and other fixed block types are read-only to the connector.",
};
export function connectorTemplateView(template: Template, catalog: Item[]) {
  const value = template.cover;
  const cover = value
    ? Object.fromEntries(
        coverElements(value, "")
          .filter((e) => e.kind !== "logo" && e.content)
          .map((e) => [e.id, coverPlainText(e.content!)]),
      )
    : {};
  return {
    template_id: template.id,
    id: template.id,
    revision: studioRevision(template),
    name: template.name,
    description: template.description,
    content: templateMarkdown(template),
    cover,
    default_quote_items: templateAuthoringItems(template, catalog),
    active: template.active,
    starter_key: template.starter_key,
    blocks: templateMarkdownBlocks(template).map((row) => ({
      id: row.id,
      type: row.block.type,
      label: templateBlockLabel(row.block),
      requires_remove_blocks: row.protected,
    })),
  };
}
export type SavedBlock = { id: string; name: string; block: Block };
export async function connectorFields(
  repo: Repository,
  quote: import("./model").Quote = [],
) {
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  check(settings, "Workspace settings required");
  // Catalog line fields already supported by the renderer remain valid in reusable copy.
  const catalog = await repo.entities<Item>("pricing_items");
  const sample = authoringPreview(
    {
      id: randomUUID(),
      content: [],
      quote: [
        ...catalog
          .filter((i) => i.active)
          .map((i, n) =>
            catalogQuoteItem(
              i,
              n,
              i.id,
              i.sublines?.map((s) => s.id) ?? [i.id],
            ),
          ),
        ...quote,
      ],
    },
    settings,
    repo.workspaceId,
  );
  sample.workspace_settings = settings;
  return Object.keys(variables(sample)).sort();
}
export function validateConnectorFields(value: unknown, allowed: string[]) {
  const inspect = (x: unknown): void => {
    if (typeof x === "string")
      for (const match of x.matchAll(/{{\s*([^{}]+?)\s*}}/g))
        check(
          allowed.includes(match[1]),
          `Unknown field: {{${match[1]}}}. Valid fields: ${allowed.map((p) => `{{${p}}}`).join(", ")}`,
        );
    else if (Array.isArray(x)) x.forEach(inspect);
    else if (x && typeof x === "object") {
      const node = x as RichText;
      if (node.type === "variable")
        check(
          allowed.includes(node.attrs?.path ?? ""),
          `Unknown field: ${node.attrs?.path}. Valid fields: ${allowed.join(", ")}`,
        );
      Object.values(x).forEach(inspect);
    }
  };
  inspect(value);
}
export function connectorMarkdown(markdown: string, allowed: string[]) {
  validateConnectorFields(markdown, allowed);
  return reviewBlocks(
    markdownBlocks(markdown, allowed).map((b) => ({
      ...b,
      id: randomUUID(),
      ...(b.type === "heading"
        ? { rich_heading: true, content: fieldNodes(coverText(b.text ?? "")) }
        : b.content
          ? { content: fieldNodes(b.content) }
          : {}),
    })),
    false,
  );
}
export function connectorCover(
  previous: Cover | undefined,
  patch: Record<string, string> | undefined,
  allowed: string[],
) {
  const value = structuredClone(previous ?? defaultCover(true));
  if (!patch) return value;
  validateConnectorFields(patch, allowed);
  const elements = coverElements(value, "{{proposal.title}}").map((e) => ({
    ...e,
  }));
  let changed = false;
  for (const [key, line] of Object.entries(patch)) {
    const meta = (
      {
        byline: "prepared_by",
        date: "date",
        validity: "valid_until",
      } as Record<string, string>
    )[key];
    let element =
      elements.find((e) => e.id === key && e.kind !== "logo") ??
      (meta ? elements.find((e) => e.meta === meta) : undefined);
    if (!element) {
      check(
        [
          "date",
          "validity",
          "eyebrow",
          "byline",
          "prepared_for",
          "workspace",
          "title",
        ].includes(key),
        `Unknown cover line: ${key}. Valid line IDs: ${elements
          .filter((e) => e.kind !== "logo")
          .map((e) => e.id)
          .join(", ")}, date, validity`,
      );
      element = {
        id: key,
        kind: ["date", "validity"].includes(key) ? "extra" : (key as any),
        align: "left",
      };
      elements.push(element);
    }
    const currentText = element.content ? coverPlainText(element.content) : "";
    if (!element.content || currentText !== line) {
      changed = true;
      element.content = fieldNodes(coverText(line));
      element.hidden = false;
      if (
        element.kind === key &&
        ["workspace", "eyebrow", "byline", "prepared_for"].includes(key)
      )
        (value as any)[key] = line;
    }
  }
  if (changed) value.elements = elements;
  return value;
}
export function savedBlockView(row: SavedBlock) {
  const label = savedBlockType(row.block),
    editable = [
      "Text",
      "Bulleted list",
      "Numbered list",
      "Contract clause",
    ].includes(label);
  return {
    saved_block_id: row.id,
    name: row.name,
    revision: studioRevision(row),
    type:
      label === "Text"
        ? "text"
        : /list$/i.test(label)
          ? "list"
          : label === "Contract clause"
            ? "contract_clause"
            : row.block.type,
    editable,
    content:
      row.block.type === "contract"
        ? { clauses: row.block.clauses ?? [] }
        : richMarkdown(row.block.content) || row.block.text || "",
    ...(!editable
      ? { reason: "This block type is read-only to the connector" }
      : {}),
  };
}
export function richMarkdown(node: RichText | undefined): string {
  if (!node) return "";
  let value =
    node.type === "variable"
      ? `{{${node.attrs?.path ?? ""}}}`
      : node.type === "hardBreak"
        ? "  \n"
        : (node.text ??
          (node.content ?? [])
            .map(richMarkdown)
            .join(
              node.type === "doc"
                ? "\n\n"
                : node.type === "listItem"
                  ? "\n"
                  : ["bulletList", "orderedList"].includes(node.type)
                    ? "\n"
                    : "",
            ));
  if (["bulletList", "orderedList"].includes(node.type))
    value = (node.content ?? [])
      .map(
        (n, i) =>
          `${node.type === "orderedList" ? `${i + 1}.` : "-"} ${richMarkdown(n)}`,
      )
      .join("\n");
  for (const m of node.marks ?? [])
    if (m.type === "bold") value = `**${value}**`;
    else if (m.type === "italic") value = `_${value}_`;
  return value;
}
export function connectorSavedContent(
  type: string,
  content: string | z.infer<typeof clauseContent>,
  allowed: string[],
  before?: Block,
): Block {
  if (type === "contract_clause") {
    check(
      !before || before.type === "contract",
      "Only Text and List can change type; contract clauses keep their type",
    );
    validateConnectorFields(content, allowed);
    const clauses = clauseContent.parse({
      clauses:
        typeof content === "string"
          ? [
              {
                id: before?.clauses?.[0]?.id ?? randomUUID(),
                heading: before?.clauses?.[0]?.heading ?? "Clause",
                body: content,
                show_when: before?.clauses?.[0]?.show_when ?? null,
              },
            ]
          : content.clauses,
    }).clauses;
    return {
      ...(before ?? {}),
      id: before?.id ?? randomUUID(),
      type: "contract",
      text: before?.text ?? "Terms",
      clauses,
    };
  }
  check(
    !before || ["paragraph", "heading"].includes(before.type),
    "This block type can't be changed",
  );
  check(typeof content === "string", "Text and List content must be Markdown");
  const blocks = connectorMarkdown(content, allowed);
  const doc: RichText = {
    type: "doc",
    content: blocks.flatMap(
      (b) =>
        b.content?.content ?? [
          {
            type: "paragraph",
            content: [{ type: "text", text: b.text ?? "" }],
          },
        ],
    ),
  };
  return convertSavedBlockType(
    {
      ...(before ?? {}),
      id: before?.id ?? randomUUID(),
      type: "paragraph",
      text: undefined,
      content: doc,
    },
    type === "text"
      ? "Text"
      : doc.content?.[0]?.type === "orderedList"
        ? "Numbered list"
        : "Bulleted list",
  );
}
async function validatedTemplate(repo: Repository, value: Template) {
  const parsed = TemplateInputSchema.parse(value);
  reviewBlocks(parsed.content as Block[], false);
  await validateStyles(
    repo,
    (await repo.entities<WorkspaceSettings>("workspace_settings"))[0],
    parsed.style_overrides,
  );
  const allowed = await connectorFields(
    repo,
    templateAuthoringItems(
      parsed as Template,
      await repo.entities<Item>("pricing_items"),
    ),
  );
  validateConnectorFields(
    [parsed.content, parsed.cover, parsed.default_items],
    allowed,
  );
  const result = parsed as Template;
  if (value.header_footer === undefined) delete result.header_footer;
  return result;
}
export async function connectorStudioTool(
  repo: Repository,
  actor: Actor,
  name: string,
  input: any,
) {
  const catalog = await repo.entities<Item>("pricing_items");
  if (name === "list_saved_blocks")
    return (await repo.entities<SavedBlock>("content_library")).map((row) => {
      const { content: _content, ...summary } = savedBlockView(row);
      return summary;
    });
  if (name === "get_saved_block") {
    const row = (await repo.entities<SavedBlock>("content_library")).find(
      (r) => r.id === input.saved_block_id,
    );
    check(row, "Saved block not found", 404);
    return savedBlockView(row);
  }
  if (name.includes("saved_block")) {
    const before =
      name === "update_saved_block"
        ? (await repo.entities<SavedBlock>("content_library")).find(
            (r) => r.id === input.saved_block_id,
          )
        : undefined;
    if (name === "update_saved_block") {
      check(before, "Saved block not found", 404);
      assertStudioRevision("content_library", before, input.revision);
    }
    const type =
      input.type ??
      (before?.block.type === "contract"
        ? "contract_clause"
        : /list$/i.test(savedBlockType(before!.block))
          ? "list"
          : "text");
    if (before)
      check(
        ["Text", "Bulleted list", "Numbered list", "Contract clause"].includes(
          savedBlockType(before.block),
        ),
        "This block type is read-only to the connector",
      );
    const block =
      before &&
      input.content !== undefined &&
      JSON.stringify(input.content) ===
        JSON.stringify(savedBlockView(before).content) &&
      (!input.type || input.type === savedBlockView(before).type)
        ? before.block
        : input.content !== undefined
          ? connectorSavedContent(
              type,
              input.content,
              await connectorFields(repo),
              before?.block,
            )
          : input.type !== undefined &&
              input.type !== savedBlockView(before!).type
            ? convertSavedBlockType(
                before!.block,
                input.type === "list" ? "Bulleted list" : "Text",
              )
            : before!.block;
    if (before && input.type)
      check(
        (type === "contract_clause") === (before.block.type === "contract"),
        "Only Text and List can change type; contract clauses keep their type",
      );
    const after = {
      ...before,
      id: before?.id ?? randomUUID(),
      name: input.name ?? before!.name,
      block,
    };
    const value = await writeStudioEntity(
      repo,
      "content_library",
      before ?? null,
      after,
      actor,
      {
        connector: true,
        type: `connector_saved_block_${before ? "updated" : "created"}`,
        revision: input.revision,
      },
    );
    return savedBlockView(value);
  }
  if (name === "duplicate_template") {
    const before = (await repo.entities<Template>("templates")).find(
      (t) => t.id === input.template_id,
    );
    check(before, "Template not found", 404);
    const after = storedStudioEntity({
      ...structuredClone(before),
      id: randomUUID(),
      name: input.name,
      active: false,
      connector_created: true,
      ...(before.starter_key ? { source_starter_key: before.starter_key } : {}),
    });
    delete after.starter_key;
    delete after.starter_order;
    delete after.pagination;
    if (!after.signature_heading_defaulted)
      after.content = withSignatureHeadings(after.content);
    after.signature_heading_defaulted = true;
    return writeStudioEntity(
      repo,
      "templates",
      null,
      await validatedTemplate(repo, after),
      actor,
      {
        connector: true,
        type: "connector_template_created",
      },
    );
  }
  if (name === "create_template") {
    const quote = prepareQuote(input.default_quote_items ?? [], catalog, true),
      allowed = await connectorFields(repo, quote);
    validateConnectorFields(input, allowed);
    const value = TemplateInputSchema.parse({
      id: randomUUID(),
      name: input.name,
      description: input.description,
      active: false,
      connector_created: true,
      signature_heading_defaulted: true,
      content: contentAfterCover(connectorMarkdown(input.content, allowed)),
      cover: connectorCover(undefined, input.cover, allowed),
      default_quote: [],
      default_items: quote,
    });
    return writeStudioEntity(
      repo,
      "templates",
      null,
      await validatedTemplate(repo, value as Template),
      actor,
      {
        connector: true,
        type: "connector_template_created",
      },
    );
  }
  if (name === "update_template") {
    const before = (await repo.entities<Template>("templates")).find(
      (t) => t.id === input.template_id,
    );
    check(before, "Template not found", 404);
    check(
      !before.starter_key,
      "Yeswell starters are read-only. Call duplicate_template first, then update the new template.",
      403,
    );
    assertStudioRevision("templates", before, input.revision);
    const quote =
      input.default_quote_items === undefined
        ? templateAuthoringItems(before, catalog)
        : prepareQuote(input.default_quote_items, catalog, true);
    const allowed = await connectorFields(repo, quote);
    validateConnectorFields(input, allowed);
    check(
      input.remove_blocks === undefined || input.content !== undefined,
      "remove_blocks requires content: supply the edited Markdown with those markers omitted",
    );
    const after: Template = {
      ...before,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.cover === undefined || !Object.keys(input.cover).length
        ? {}
        : {
            cover: connectorCover(
              before.cover ?? loadedCover(undefined),
              input.cover,
              allowed,
            ),
          }),
      ...(input.default_quote_items === undefined
        ? {}
        : { default_items: quote, default_quote: [] }),
      ...(input.content === undefined
        ? {}
        : {
            content: replaceTemplateMarkdown(
              input.content,
              before,
              input.remove_blocks ?? [],
              (md) => connectorMarkdown(md, allowed),
            ),
          }),
    };
    if (!after.signature_heading_defaulted && input.content === undefined)
      after.content = withSignatureHeadings(after.content);
    after.signature_heading_defaulted = true;
    // Cached page plans describe the old content; the existing editor recomputes them.
    if (
      input.content !== undefined ||
      input.cover !== undefined ||
      input.default_quote_items !== undefined
    )
      delete after.pagination;
    return writeStudioEntity(
      repo,
      "templates",
      before,
      await validatedTemplate(repo, after),
      actor,
      {
        connector: true,
        type: "connector_template_updated",
        revision: input.revision,
      },
    );
  }
  throw new Error("Unsupported Studio connector tool");
}
