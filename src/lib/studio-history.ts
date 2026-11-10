import { randomUUID } from "node:crypto";
import { canonical, sha256 } from "./content";
import { check, type Actor, type Audit, type Template } from "./model";
import type { Repository, StudioEntityTable } from "./repository";
import { prepareLinkedSave } from "./saved-blocks";
import type { SavedBlock } from "./model";
import { replaceLinkedBlocks, withoutBlockLink } from "./linked-blocks";
const derived = new Set([
  "revision",
  "connector_restore_event_id",
  "starter_edited",
  "source_starter_name",
  "used_in",
]);
export function storedStudioEntity<T extends { id: string }>(value: T): T {
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(value).filter(([key]) => !derived.has(key)),
      ),
    ),
  ) as T;
}
export const studioRevision = (value: { id: string }) =>
  sha256(canonical(storedStudioEntity(value)));
export const connectorEvent = (event: Pick<Audit, "type">) =>
  ["connector_template_updated", "connector_saved_block_updated"].includes(
    event.type,
  );
export const mayRestore = (event: Audit, actor: Actor) =>
  actor.actor.startsWith("staff:") &&
  (actor.staff_role === "owner" ||
    event.metadata.editor_user_id === actor.actor.slice(6));
export function assertStudioRevision(
  table: StudioEntityTable,
  before: { id: string },
  expected: string | undefined,
) {
  if (expected !== undefined)
    check(
      studioRevision(before) === expected,
      `409: ${table === "templates" ? "Template" : "Saved block"} changed. Call ${table === "templates" ? "get_template" : "get_saved_block"} again, merge your edits, then retry with its revision.`,
      409,
    );
}
export async function writeStudioEntity<T extends { id: string }>(
  repo: Repository,
  table: StudioEntityTable,
  before: { id: string } | null,
  after: T,
  actor: Actor,
  options: {
    type?: string;
    revision?: string;
    connector?: boolean;
    updateDrafts?: boolean;
    draftIds?: string[];
  } = {},
) {
  if (before) assertStudioRevision(table, before, options.revision);
  let value = storedStudioEntity(after);
  if (table === "templates") {
    const template = value as unknown as Template;
    if (!template.starter_key) {
      const sources = await repo.entities<SavedBlock>("content_library");
      template.content = template.content.map((b) =>
        b.saved_block_id && !sources.some((r) => r.id === b.saved_block_id)
          ? withoutBlockLink(b)
          : b,
      );
      for (const source of sources) {
        if (template.content.some((b) => b.saved_block_id === source.id))
          template.content = replaceLinkedBlocks(template.content, source);
      }
    }
  }
  const linked =
    table === "content_library"
      ? await prepareLinkedSave(
          repo,
          before as SavedBlock | null,
          value as unknown as SavedBlock,
          actor,
          !options.connector && !!options.updateDrafts,
          options.connector ? undefined : options.draftIds,
        )
      : null;
  if (linked) value = linked.after as unknown as T;
  const events = options.connector
    ? await repo.entities<Audit>("workspace_events")
    : [];
  const priorTime = events
    .filter((e) => e.metadata?.entity_id === value.id)
    .reduce((max, e) => Math.max(max, Date.parse(e.created_at) || 0), 0);
  const audit: Audit = {
    id: randomUUID(),
    ...actor,
    type: options.type ?? `${table}_saved`,
    created_at: new Date(Math.max(Date.now(), priorTime + 1)).toISOString(),
    metadata: {
      entity_id: value.id,
      entity_table: table,
      name: (value as any).name,
      ...(linked
        ? {
            linked_templates: linked.templates.map((t) => t.after.id),
            updated_drafts: linked.proposals.map((p) => p.after.id),
          }
        : {}),
      ...(options.connector
        ? {
            before: before ? storedStudioEntity(before) : null,
            after: value,
            before_revision: before ? studioRevision(before) : null,
            after_revision: studioRevision(value),
            editor_user_id: actor.on_behalf_of_user_id,
            editor_name: actor.on_behalf_of_name ?? "Staff member",
            actor_name: "Claude",
          }
        : {}),
    },
  };
  check(
    linked
      ? await repo.commitLinkedBlock(linked, audit)
      : table === "templates" && (before as Template | null)?.starter_key
        ? await repo.replaceStarter(
            storedStudioEntity(before as Template),
            value as unknown as Template,
            audit,
          )
        : await repo.saveStudioEntity(
            table,
            before ? storedStudioEntity(before) : null,
            value,
            audit,
          ),
    `409: ${table === "templates" ? "Template" : "Saved block"} changed during save. Reload it and merge your changes before retrying.`,
    409,
  );
  return { ...value, revision: studioRevision(value) };
}
export async function studioEntityViews<T extends { id: string }>(
  repo: Repository,
  table: StudioEntityTable,
  rows: T[],
  actor?: Actor,
) {
  const changes = (await repo.entities<Audit>("workspace_events"))
    .filter(
      (e) =>
        connectorEvent(e) &&
        e.metadata.entity_table === table &&
        e.metadata.before,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return rows.map((row) => {
    const revision = studioRevision(row),
      change = changes.find((e) => e.metadata.entity_id === row.id);
    return {
      ...row,
      revision,
      ...(change &&
      actor &&
      mayRestore(change, actor) &&
      change.metadata.after_revision === revision
        ? { connector_restore_event_id: change.id }
        : {}),
    };
  });
}
export async function restoreConnectorChange(
  repo: Repository,
  id: string,
  actor: Actor,
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 401);
  const event = (await repo.entities<Audit>("workspace_events")).find(
    (e) => e.id === id && connectorEvent(e),
  );
  check(event && event.metadata.before, "Previous version not found", 404);
  check(
    mayRestore(event, actor),
    "Only a super admin or this template's editor can restore this change",
    403,
  );
  const table = event.metadata.entity_table as StudioEntityTable;
  check(
    ["templates", "content_library"].includes(table),
    "Invalid revision",
    400,
  );
  const current = (
    await repo.entities<{ id: string; starter_key?: string }>(table)
  ).find((e) => e.id === event.metadata.entity_id);
  check(current, "Item not found", 404);
  check(
    studioRevision(current) === event.metadata.after_revision,
    "409: This item changed after Claude's edit. Your later edits are kept; refresh and review them before restoring.",
    409,
  );
  return writeStudioEntity(
    repo,
    table,
    current,
    event.metadata.before as { id: string } & Record<string, unknown>,
    actor,
    {
      type: "connector_change_restored",
      revision: event.metadata.after_revision as string,
    },
  );
}
/** Revision snapshots stay server-side; Activity receives only safe action metadata. */
export async function connectorActivityViews<T extends Audit>(
  repo: Repository,
  rows: T[],
  actor: Actor,
) {
  const templates = await repo.entities<{ id: string }>("templates"),
    blocks = await repo.entities<{ id: string }>("content_library");
  return rows.map((e) => {
    if (!/^connector_(template|saved_block)_/.test(e.type)) return e;
    const { before, after, ...metadata } = e.metadata;
    const current = (
      metadata.entity_table === "templates" ? templates : blocks
    ).find((t) => t.id === metadata.entity_id);
    return {
      ...e,
      metadata: {
        ...metadata,
        can_restore:
          !!before &&
          mayRestore(e, actor) &&
          !!current &&
          studioRevision(current) === metadata.after_revision,
      },
    };
  });
}
