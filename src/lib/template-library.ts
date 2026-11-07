import { isDeepStrictEqual } from "node:util";
import { reviewBlocks } from "./ai-review";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workspaceStarterTemplates } from "../../seed/starter-templates";
import { sameStarterState } from "./starter-template-state";
import {
  AppError,
  check,
  QuoteSchema,
  type Actor,
  type Audit,
  type Item,
  type Template,
} from "./model";
import type { Repository } from "./repository";
import { CoverSchema, loadedCover, contentAfterCover } from "./cover";
import { TemplateBandsSchema, defaultTemplateBands } from "./page-bands";
import { StyleOverridesSchema } from "./proposal-styles";
import { PagePlanSchema } from "./page-plan";
import { validateStyles, workspaceEvent } from "./studio";
import type { WorkspaceSettings } from "./workspace";
export const TemplateInputSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  starter_key: z.string().max(100).optional(),
  starter_order: z.number().int().min(0).max(5).optional(),
  source_starter_key: z.string().max(100).optional(),
  connector_created: z.boolean().optional(),
  content: z.array(z.record(z.string(), z.unknown())).max(300),
  default_items: QuoteSchema.optional(),
  default_quote: z
    .array(
      z.object({
        pricing_item_id: z.uuid(),
        qty: z.number().int().min(1).max(10000),
        optional: z.boolean(),
        selected: z.boolean(),
      }),
    )
    .max(100),
  active: z.boolean(),
  signature_heading_defaulted: z.boolean().optional(),
  header_footer: TemplateBandsSchema.default(defaultTemplateBands),
  cover: CoverSchema.optional(),
  style_overrides: StyleOverridesSchema.optional(),
  pagination: PagePlanSchema.optional(),
});
export async function libraryTemplates(repo: Repository, rows: Template[]) {
  const seeds = workspaceStarterTemplates(
    repo.workspaceId,
    await repo.entities<Item>("pricing_items"),
  );
  return rows.map((t) => ({
    ...t,
    ...(t.starter_key
      ? {
          starter_edited: !seeds.some(
            (s) => s.starter_key === t.starter_key && sameStarterState(t, s),
          ),
        }
      : {}),
    ...(t.source_starter_key
      ? {
          source_starter_name:
            rows.find((s) => s.starter_key === t.source_starter_key)?.name ??
            seeds.find((s) => s.starter_key === t.source_starter_key)?.name ??
            t.source_starter_key,
        }
      : {}),
  }));
}
export async function libraryStarterAction(
  repo: Repository,
  actor: Actor,
  id: string,
  action: string,
  input: unknown,
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 401);
  const before = (await repo.entities<Template>("templates")).find(
    (t) => t.id === id,
  );
  check(before?.starter_key, "Starter not found", 404);
  if (action === "copy") {
    const data = z
      .object({
        name: z.string().trim().min(1).max(200),
        attempt: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input);
    const copyId = randomUUID();
    const prepare = async (authored: Record<string, unknown>) => {
      const value = TemplateInputSchema.parse({
        ...authored,
        id: copyId,
        name: data.name,
        active: true,
      });
      delete value.starter_key;
      delete value.starter_order;
      delete value.pagination;
      value.source_starter_key = before.starter_key;
      value.content = reviewBlocks(
        contentAfterCover(value.content as Template["content"]),
        false,
      );
      value.cover = loadedCover(value.cover);
      await validateStyles(
        repo,
        (await repo.entities<WorkspaceSettings>("workspace_settings"))[0],
        value.style_overrides,
      );
      return value;
    };
    let value,
      attemptApplied = true;
    try {
      value = await prepare({ ...before, ...data.attempt });
    } catch (error) {
      if (!data.attempt) throw error;
      // Incomplete numeric/style input is not safe template data. Copy the original
      // and explicitly report that no tentative change was applied.
      value = await prepare(before);
      attemptApplied = false;
    }
    await repo.put("templates", value);
    await workspaceEvent(repo, actor, "starter_copied", {
      entity_id: value.id,
      name: value.name,
      source_starter_key: before.starter_key,
    });
    return {
      ...(await libraryTemplates(repo, [value as Template]))[0],
      attempt_applied: attemptApplied,
    };
  }
  check(
    actor.staff_role === "owner",
    "Only a super admin can reset or hide a starter",
    403,
  );
  let after: Template;
  if (action === "reset") {
    z.object({}).strict().parse(input);
    const seed = workspaceStarterTemplates(
      repo.workspaceId,
      await repo.entities<Item>("pricing_items"),
    ).find((s) => s.starter_key === before.starter_key);
    check(seed, "This starter is not available in this release", 409);
    after = {
      ...seed,
      id: before.id,
      name: before.name,
      active: before.active,
    };
  } else if (action === "availability") {
    const { active } = z.object({ active: z.boolean() }).strict().parse(input);
    after = { ...before, active };
  } else if (action === "undo-reset") {
    const { event_id } = z.object({ event_id: z.uuid() }).strict().parse(input);
    const event = (await repo.entities<Audit>("workspace_events")).find(
      (e) =>
        e.id === event_id &&
        e.type === "starter_reset" &&
        e.metadata.entity_id === id,
    );
    check(event, "Reset not found", 404);
    check(
      isDeepStrictEqual(
        JSON.parse(JSON.stringify(before)),
        JSON.parse(JSON.stringify(event.metadata.after)),
      ),
      "The starter changed since Reset. Reload before trying again.",
      409,
    );
    after = event.metadata.before as Template;
  } else throw new AppError(405, "Starter action unavailable");
  const event: Audit = {
    id: randomUUID(),
    type:
      action === "reset"
        ? "starter_reset"
        : action === "undo-reset"
          ? "starter_reset_undone"
          : "starter_availability_changed",
    actor: actor.actor,
    ip: actor.ip,
    user_agent: actor.user_agent,
    created_at: new Date().toISOString(),
    metadata: { entity_id: id, name: before.name, before, after },
  };
  check(
    await repo.replaceStarter(before, after, event),
    "The starter changed. Reload before trying again.",
    409,
  );
  return {
    template: (await libraryTemplates(repo, [after]))[0],
    event_id: event.id,
  };
}
