import { randomUUID } from "node:crypto";
import type { Proposal, Version } from "./model";
import { variables, renderBlocks, versionHash } from "./content";
import { freezeStyles } from "./proposal-styles";

/** Staff work and client publication are distinct until a readiness-checked commit. */
export type EditorialWork = Pick<
  Proposal,
  | "cover"
  | "title"
  | "brief"
  | "content"
  | "quote"
  | "valid_until"
  | "pagination"
  | "style_overrides"
  | "template_style_overrides"
>;
export type PublishedState = Pick<
  Proposal,
  | "cover"
  | "title"
  | "valid_until"
  | "style_overrides"
  | "template_style_overrides"
>;
export function editableProposal(p: Proposal) {
  return (
    p.source === "native" &&
    !p.archived_at &&
    !p.signers.length &&
    !p.versions.some((v) => v.frozen) &&
    ["draft", "sent", "viewed", "declined", "expired"].includes(p.status)
  );
}
export function editorialWork(p: Proposal): EditorialWork {
  return structuredClone({
    cover: p.cover,
    title: p.title,
    brief: p.brief,
    content: p.content,
    quote: p.quote,
    valid_until: p.valid_until,
    pagination: p.pagination,
    style_overrides: p.style_overrides,
    template_style_overrides: p.template_style_overrides,
  });
}
export function publicationState(p: Proposal): PublishedState {
  return structuredClone({
    cover: p.cover,
    title: p.title,
    valid_until: p.valid_until,
    style_overrides: p.style_overrides,
    template_style_overrides: p.template_style_overrides,
  });
}
export function publishedExpiry(p: Proposal) {
  return p.published_state ? p.published_state.valid_until : p.valid_until;
}
export function publishedPresentation(p: Proposal): Proposal {
  return p.published_state ? { ...p, ...p.published_state } : p;
}
/** Uses exactly the existing version/hash inputs; the PagePlan format is untouched. */
export function editorialVersion(p: Proposal, now: string): Version {
  const map = variables(p, p.quote);
  renderBlocks(p.content, p.quote, map, p.currency);
  const version: Version = {
    id: randomUUID(),
    version_no: p.versions.length + 1,
    resolved_styles: freezeStyles(
      p.workspace_settings,
      p.template_style_overrides,
      p.style_overrides,
    ),
    ...(p.pagination ? { pagination: structuredClone(p.pagination) } : {}),
    ...(p.cover ? { cover: structuredClone(p.cover) } : {}),
    content: structuredClone(p.content),
    quote: structuredClone(p.quote),
    variables_resolved: map,
    content_hash: "",
    created_at: now,
    frozen: false,
  };
  version.content_hash = versionHash(version);
  return version;
}
/** The signed editor and billing keep using the accepted version, never an invalid WIP. */
export function restorePublishedForSigning(p: Proposal) {
  const v = p.versions.at(-1)!;
  if (p.live_blockers?.length) p.unpublished_work = editorialWork(p);
  if (p.published_state) Object.assign(p, p.published_state);
  p.cover = structuredClone(v.cover);
  p.content = structuredClone(v.content);
  p.quote = structuredClone(v.quote);
  p.pagination = structuredClone(v.pagination);
  p.ai_unreviewed = false;
  delete p.live_blockers;
}

/** Autosaved publications do not start another email/reminder cycle. */
export function reminderCycle(p: Proposal) {
  const sent = p.events
    .filter((e) => ["sent", "reopened"].includes(e.type))
    .at(-1);
  return {
    version: Number(sent?.metadata.version ?? p.versions.length),
    at: sent?.created_at ?? p.sent_at!,
  };
}
