import { randomUUID } from "node:crypto";
import {
  check,
  type Actor,
  type Audit,
  type Block,
  type Proposal,
  type SavedBlock,
  type Template,
} from "./model";
import type { LinkedBlockCommit, Repository } from "./repository";
import {
  linkedInstances,
  replaceLinkedBlocks,
  savedBlocks,
  withoutBlockLink,
} from "./linked-blocks";
import { reviewBlocks } from "./ai-review";
import { proposalOwnerId } from "./proposal-owner";

export function validateSavedBlock(row: SavedBlock) {
  check(row.name?.trim() && row.name.length <= 200, "Name is required");
  const blocks = savedBlocks(row);
  check(
    blocks.length > 0 && blocks.length <= 300,
    "A reusable block needs 1–300 blocks",
  );
  if (row.type === "group")
    check(
      blocks.every(
        (b) =>
          !["pricing_table", "signature_block", "contract"].includes(b.type),
      ),
      "Groups cannot contain pricing tables, signatures or contracts",
    );
  check(
    blocks.every((b) =>
      [
        "heading",
        "paragraph",
        "image",
        "contract",
        "page_break",
        "variable",
      ].includes(b.type),
    ),
    "Unsupported saved block type",
  );
  const clean = reviewBlocks(blocks.map(withoutBlockLink), false);
  return {
    ...row,
    block: clean[0],
    ...(row.type === "group" ? { blocks: clean } : {}),
  };
}
const draftCopy = (p: Proposal) =>
  p.status === "draft" &&
  !p.token &&
  !p.signers.length &&
  !p.versions.some((v) => v.frozen) &&
  !p.archived_at &&
  p.source === "native";
function usageFrom(
  row: SavedBlock,
  templateRows: Template[],
  proposalRows: Proposal[],
) {
  const templates = templateRows.filter(
    (t) => !t.starter_key && t.content.some((b) => b.saved_block_id === row.id),
  );
  const drafts = proposalRows.filter(
    (p) => draftCopy(p) && p.content.some((b) => b.saved_block_id === row.id),
  );
  return {
    template_count: templates.length,
    draft_count: drafts.length,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      edited: linkedInstances(t.content, row.id).some((i) => i.edited),
    })),
    drafts: drafts.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      owner:
        p.owner?.display_name ??
        p.sender?.display_name ??
        proposalOwnerId(p) ??
        p.created_by,
    })),
  };
}
export async function savedBlockUsage(repo: Repository, row: SavedBlock) {
  const [templates, proposals] = await Promise.all([
    repo.entities<Template>("templates"),
    repo.list(),
  ]);
  return usageFrom(row, templates, proposals);
}
export async function savedBlockViews(repo: Repository, rows: SavedBlock[]) {
  const [templates, proposals] = await Promise.all([
    repo.entities<Template>("templates"),
    repo.list(),
  ]);
  return rows.map((row) => ({
    ...row,
    version: row.version ?? 1,
    used_in: usageFrom(row, templates, proposals),
  }));
}
export async function prepareLinkedSave(
  repo: Repository,
  before: SavedBlock | null,
  row: SavedBlock | null,
  actor: Actor,
  updateDrafts = false,
  draftIds?: string[],
): Promise<LinkedBlockCommit> {
  if (before) {
    before = { ...before };
    delete before.revision;
    delete before.used_in;
    delete before.connector_restore_event_id;
  }
  check(before || row, "Saved block required");
  if (before?.type === "group" && row)
    check(
      row.type === "group",
      "Groups keep their type. Edit their member blocks instead.",
    );
  const id = (before ?? row)!.id;
  const after = row
    ? validateSavedBlock({
        ...row,
        version: before ? (before.version ?? 1) + 1 : 1,
      })
    : null;
  const templates: LinkedBlockCommit["templates"] = [],
    proposals: LinkedBlockCommit["proposals"] = [],
    events: Audit[] = [];
  const now = new Date().toISOString();
  for (const current of await repo.entities<Template>("templates")) {
    if (
      current.starter_key ||
      !current.content.some((b) => b.saved_block_id === id)
    )
      continue;
    const content = after
      ? replaceLinkedBlocks(current.content, after)
      : current.content.map((b) =>
          b.saved_block_id === id ? withoutBlockLink(b) : b,
        );
    if (JSON.stringify(content) === JSON.stringify(current.content)) continue;
    const next = { ...current, content };
    delete next.pagination;
    templates.push({ before: current, after: next });
  }
  if (updateDrafts || !after) {
    const documents = await repo.list();
    if (updateDrafts && draftIds)
      check(
        new Set(draftIds).size === draftIds.length &&
          draftIds.every((draftId) =>
            documents.some(
              (p) =>
                p.id === draftId &&
                draftCopy(p) &&
                p.content.some((b) => b.saved_block_id === id),
            ),
          ),
        "The draft list changed. Reload Used in before saving.",
        409,
      );
    for (const current of documents) {
      if (after && draftIds && !draftIds.includes(current.id)) continue;
      if (
        !draftCopy(current) ||
        !current.content.some((b) => b.saved_block_id === id)
      )
        continue;
      const content = after
        ? replaceLinkedBlocks(current.content, after, true)
        : current.content.map((b) =>
            b.saved_block_id === id ? withoutBlockLink(b) : b,
          );
      const event: Audit = {
        id: randomUUID(),
        ...actor,
        type: after ? "saved_block_updated" : "saved_block_unlinked",
        created_at: now,
        metadata: {
          saved_block_id: id,
          name: (after ?? before)!.name,
          version: after?.version,
        },
      };
      const next = {
        ...current,
        content,
        revision: current.revision + 1,
        updated_at: now,
        events: [...current.events, event],
      };
      delete next.pagination;
      proposals.push({ before: current, after: next });
    }
  }
  return { before, after, templates, proposals, events };
}
