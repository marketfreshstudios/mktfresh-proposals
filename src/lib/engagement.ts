import { z } from "zod";
import type { Proposal } from "./model";
import { blockText } from "./editor-document";
import { resolve } from "./presentation";

export const engagementId = z.string().uuid();
export const EngagementStartSchema = z
  .object({
    session_id: engagementId,
    browser_id: engagementId,
    device: z.enum(["desktop", "phone"]),
    intent: z.enum(["read", "download"]),
    activity: z.enum(["pointer", "keyboard", "scroll"]),
  })
  .strict();
const ActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: engagementId,
      kind: z.literal("choice"),
      item_id: engagementId,
      selected: z.boolean(),
    })
    .strict(),
  z
    .object({
      id: engagementId,
      kind: z.literal("download"),
      file_id: engagementId,
    })
    .strict(),
]);
export const EngagementSnapshotSchema = z
  .object({
    seq: z.number().int().min(1).max(100000),
    active_ms: z
      .number()
      .int()
      .min(0)
      .max(4 * 3600000),
    targets: z
      .record(
        z.string().min(1).max(210),
        z
          .number()
          .int()
          .min(1)
          .max(4 * 3600000),
      )
      .refine((v) => Object.keys(v).length <= 512),
    actions: z.array(ActionSchema).max(128),
    ended: z.boolean(),
  })
  .strict();
export type EngagementSnapshot = z.infer<typeof EngagementSnapshotSchema>;
export type EngagementAction = EngagementSnapshot["actions"][number];
export type EngagementTarget = {
  key: string;
  label: string;
  kind: "section" | "page";
  blocks: string[];
};
export type EngagementSession = EngagementSnapshot & {
  id: string;
  proposal_id: string;
  viewer: string;
  recipient: string | null;
  device: "desktop" | "phone";
  started_at: string;
  last_at: string;
  ended_at: string | null;
  count_view: boolean;
  version_hash: string;
  version_id: string;
  labels: Record<string, { label: string; kind: "section" | "page" }>;
};
export type EngagementAggregate = {
  id: string;
  revision: number;
  views: number;
  viewers: string[];
  last_viewed_at: string | null;
  total_ms: number;
  downloads: number;
  choices: number;
  targets: Record<
    string,
    { label: string; kind: "section" | "page"; ms: number; viewers: string[] }
  >;
};
export function emptyEngagement(id: string): EngagementAggregate {
  return {
    id,
    revision: 0,
    views: 0,
    viewers: [],
    last_viewed_at: null,
    total_ms: 0,
    downloads: 0,
    choices: 0,
    targets: {},
  };
}
export function engagementTargets(
  p: Pick<Proposal, "versions">,
): EngagementTarget[] {
  const v = p.versions.at(-1);
  if (!v) return [];
  const targets: EngagementTarget[] = [];
  let section: EngagementTarget = {
    key: "section:cover",
    label: "Cover",
    kind: "section",
    blocks: ["cover"],
  };
  targets.push(section);
  for (const [index, b] of v.content.entries()) {
    const id = b.id ?? String(index);
    if (b.type === "heading" && (b.level ?? 1) === 1) {
      section = {
        key: `section:${id}`,
        label:
          resolve(blockText(b), v.variables_resolved).slice(0, 200) ||
          "Untitled section",
        kind: "section",
        blocks: [],
      };
      targets.push(section);
    }
    if (b.type !== "page_break") section.blocks.push(id);
  }
  for (let n = 1; n <= (v.pagination?.pages ?? 0); n++)
    targets.push({
      key: `page:${n}`,
      label: `Page ${n}`,
      kind: "page",
      blocks: [],
    });
  return targets;
}
export function publicEngagement(a: EngagementAggregate) {
  return {
    views: a.views,
    unique_viewers: a.viewers.length,
    last_viewed_at: a.last_viewed_at,
    total_ms: a.total_ms,
    downloads: a.downloads,
    choices: a.choices,
    targets: Object.entries(a.targets).map(([key, t]) => ({
      key,
      label: t.label,
      kind: t.kind,
      ms: t.ms,
      reached: t.viewers.length,
      percent: a.viewers.length
        ? Math.round((t.viewers.length / a.viewers.length) * 100)
        : 0,
    })),
  };
}
export type EngagementSummary = ReturnType<typeof publicEngagement>;
export function engagementDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function engagementAgo(value: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  return seconds < 60
    ? "just now"
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
}
