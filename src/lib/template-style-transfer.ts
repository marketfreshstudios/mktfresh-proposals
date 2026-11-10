import { randomUUID } from "node:crypto";
import { validateStyles } from "./studio";
import { canonical } from "./content";
import {
  check,
  type Actor,
  type Audit,
  type Proposal,
  type Template,
} from "./model";
import { proposalBands, TemplateBandsSchema } from "./page-bands";
import {
  resolveStyles,
  StyleOverridesSchema,
  styleLabels,
} from "./proposal-styles";
import type { Repository } from "./repository";
import { storedStudioEntity, studioRevision } from "./studio-history";
import type { WorkspaceSettings } from "./workspace";

const same = (a: unknown, b: unknown) =>
  canonical(a ?? null) === canonical(b ?? null);
/** Materialize the current appearance, then retain only differences from workspace defaults. */
function inheritedStyles(
  settings: WorkspaceSettings | undefined,
  proposal: Proposal,
) {
  const resolved = resolveStyles(
    proposal.workspace_settings ?? settings,
    proposal.template_style_overrides,
    proposal.style_overrides,
  );
  const defaults = resolveStyles(settings);
  const flatten = ({ layout, ...text }: ReturnType<typeof resolveStyles>) => ({
    ...text,
    ...layout,
    quote_layout: layout?.quote_layout ?? "cards",
  });
  function differences(
    value: Record<string, unknown>,
    base: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, next]) => {
        if (same(next, base[key])) return [];
        if (
          key !== "font" &&
          next &&
          typeof next === "object" &&
          !Array.isArray(next) &&
          base[key] &&
          typeof base[key] === "object"
        ) {
          const child = differences(
            next as Record<string, unknown>,
            base[key] as Record<string, unknown>,
          );
          return Object.keys(child).length ? [[key, child]] : [];
        }
        return [[key, next]];
      }),
    );
  }
  return StyleOverridesSchema.parse(
    differences(flatten(resolved), flatten(defaults)),
  );
}
function globalBands(proposal: Proposal) {
  const { overrides: _own, ...global } = proposalBands(proposal.header_footer);
  return TemplateBandsSchema.parse(global);
}
function changedSettings(
  before: Template,
  after: Template,
  settings?: WorkspaceSettings,
) {
  const oldStyles = resolveStyles(settings, before.style_overrides),
    nextStyles = resolveStyles(settings, after.style_overrides);
  const changes: string[] = [];
  for (const level of Object.keys(styleLabels) as (keyof typeof styleLabels)[])
    for (const key of Object.keys(
      nextStyles[level],
    ) as (keyof (typeof nextStyles)[typeof level])[])
      if (!same(oldStyles[level][key], nextStyles[level][key]))
        changes.push(
          `${styleLabels[level]}: ${key.replaceAll("_", " ")} (${display(oldStyles[level][key])} → ${display(nextStyles[level][key])})`,
        );
  for (const key of Object.keys(nextStyles.layout ?? {}) as (keyof NonNullable<
    typeof nextStyles.layout
  >)[])
    if (!same(oldStyles.layout?.[key], nextStyles.layout?.[key]))
      changes.push(
        key === "quote_layout"
          ? "Quote layout"
          : key[0].toUpperCase() + key.slice(1).replaceAll("_", " "),
      );
  const oldBands = globalBands({
      header_footer: before.header_footer,
    } as Proposal),
    nextBands = globalBands({ header_footer: after.header_footer } as Proposal);
  if (!same(oldBands.shared.header, nextBands.shared.header))
    changes.push("Shared header content");
  if (!same(oldBands.shared.footer, nextBands.shared.footer))
    changes.push("Shared footer content");
  const { shared: _old, ...oldGlobal } = oldBands,
    { shared: _next, ...nextGlobal } = nextBands;
  if (!same(oldGlobal, nextGlobal))
    changes.push("Header and footer spacing and visibility");
  return changes;
}
function display(value: unknown) {
  return typeof value === "object"
    ? ((value as { name?: string })?.name ?? "Custom")
    : String(value);
}
async function target(repo: Repository, id: string, actor: Actor) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 403);
  const proposal = await repo.get(id);
  check(proposal, "Proposal not found", 404);
  const template = (await repo.entities<Template>("templates")).find(
    (t) => t.id === proposal.template_id,
  );
  check(template, "The source template is no longer available", 404);
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  const after = {
    ...storedStudioEntity(template),
    style_overrides: inheritedStyles(settings, proposal),
    header_footer: globalBands(proposal),
  };
  await validateStyles(repo, settings, after.style_overrides);
  return {
    proposal,
    template,
    after,
    changes: changedSettings(template, after, settings),
  };
}
export async function templateStyleTarget(
  repo: Repository,
  id: string,
  actor: Actor,
) {
  const { proposal, template, changes } = await target(repo, id, actor);
  return {
    name: template.name,
    template_id: template.id,
    revision: studioRevision(template),
    proposal_revision: proposal.revision,
    changes,
  };
}
export async function saveTemplateStyles(
  repo: Repository,
  id: string,
  input: { revision: string; proposal_revision: number },
  actor: Actor,
) {
  const { proposal, template, after, changes } = await target(repo, id, actor);
  check(
    studioRevision(template) === input.revision &&
      proposal.revision === input.proposal_revision,
    "409: The template or proposal changed. Reload the styles and review the changes again before saving.",
    409,
  );
  if (!changes.length)
    return {
      revision: studioRevision(template),
      style_overrides: template.style_overrides ?? {},
      event_id: null,
    };
  const event: Audit = {
    id: randomUUID(),
    ...actor,
    created_at: new Date().toISOString(),
    type: "template_styles_saved_from_proposal",
    metadata: {
      entity_id: template.id,
      entity_table: "templates",
      name: template.name,
      proposal_id: proposal.id,
      proposal_title: proposal.title,
      editor_name: actor.staff_name ?? "Staff member",
      before_styles: template.style_overrides ?? null,
      before_bands: template.header_footer ?? null,
      after_revision: studioRevision(after),
      changes,
    },
  };
  check(
    await (template.starter_key
      ? repo.replaceStarter(storedStudioEntity(template), after, event)
      : repo.saveStudioEntity(
          "templates",
          storedStudioEntity(template),
          after,
          event,
        )),
    "409: The template changed during save. Reload and review it again.",
    409,
  );
  return {
    revision: studioRevision(after),
    style_overrides: after.style_overrides,
    event_id: event.id,
  };
}
export async function undoTemplateStyles(
  repo: Repository,
  id: string,
  eventId: string,
  actor: Actor,
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 403);
  const event = (await repo.entities<Audit>("workspace_events")).find(
    (e) =>
      e.id === eventId &&
      e.type === "template_styles_saved_from_proposal" &&
      e.metadata.proposal_id === id &&
      e.actor === actor.actor,
  );
  check(
    event && Date.now() - Date.parse(event.created_at) <= 5000,
    "Undo is no longer available",
    409,
  );
  const template = (await repo.entities<Template>("templates")).find(
    (t) => t.id === event.metadata.entity_id,
  );
  check(
    template && studioRevision(template) === event.metadata.after_revision,
    "409: The template changed after your save. Later edits are kept; reload to review them.",
    409,
  );
  const after = storedStudioEntity(template);
  if (event.metadata.before_styles === null) delete after.style_overrides;
  else
    after.style_overrides = StyleOverridesSchema.parse(
      event.metadata.before_styles,
    );
  if (event.metadata.before_bands === null) delete after.header_footer;
  else
    after.header_footer = TemplateBandsSchema.parse(
      event.metadata.before_bands,
    );
  const audit: Audit = {
    id: randomUUID(),
    ...actor,
    created_at: new Date().toISOString(),
    type: "template_styles_save_undone",
    metadata: { entity_id: after.id, name: after.name, proposal_id: id },
  };
  check(
    await (template.starter_key
      ? repo.replaceStarter(storedStudioEntity(template), after, audit)
      : repo.saveStudioEntity(
          "templates",
          storedStudioEntity(template),
          after,
          audit,
        )),
    "409: The template changed. Reload before trying again.",
    409,
  );
  return { revision: studioRevision(after) };
}
