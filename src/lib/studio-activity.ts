import type { Audit } from "./model";
import type { TeamAudit } from "./team-model";
export type ActivityRow = Audit & { proposal_id?: string; detail: string };
export const activityGroups = [
  "All",
  "Proposals",
  "Signatures",
  "Billing",
  "Emails",
  "Studio changes",
  "Team",
] as const;
export function activityGroup(e: Pick<ActivityRow, "type" | "proposal_id">) {
  if (e.type.startsWith("team_")) return "Team";
  if (/signed|signature|consent|counter/.test(e.type)) return "Signatures";
  if (/billing|invoice|subscription|checkout|stripe|qbo/.test(e.type))
    return "Billing";
  if (/email|reminder|sent_manually|sent$/.test(e.type)) return "Emails";
  return e.proposal_id ? "Proposals" : "Studio changes";
}
export function teamActivity(event: TeamAudit): ActivityRow {
  return {
    id: `team-${event.id}`,
    type: `team_${event.action}`,
    actor: event.actor,
    ip: "",
    user_agent: "",
    created_at: event.created_at,
    metadata: {
      actor_name: event.actor_name,
      target_name: event.target_name,
      ...event.after,
    },
    detail: `${event.target_name} · ${event.action.replaceAll("_", " ")}`,
  };
}
export function activityCsv(rows: ActivityRow[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return (
      '"' +
      (/^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? "'" : "") +
      text.replaceAll('"', '""') +
      '"'
    );
  };
  return [
    ["When", "Who", "Event", "Detail", "IP"],
    ...rows.map((e) => [e.created_at, e.actor, e.type, e.detail, e.ip]),
  ]
    .map((r) => r.map(cell).join(","))
    .join("\r\n");
}
