import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import type { Storage } from "./storage";
import { check, type Actor, type Audit } from "./model";
import { FontSchema, type ProposalFont } from "./proposal-fonts";
import { sha256 } from "./content";
export async function workspaceEvent(
  repo: Repository,
  actor: Actor,
  type: string,
  metadata: Record<string, unknown>,
) {
  await repo.put("workspace_events", {
    id: randomUUID(),
    type,
    actor: actor.actor,
    ip: actor.ip,
    user_agent: actor.user_agent,
    created_at: new Date().toISOString(),
    metadata,
  });
}
export async function uploadFont(
  repo: Repository,
  storage: Storage,
  actor: Actor,
  input: { name: string; data: string; licensed: boolean },
) {
  check(
    input.licensed === true,
    "Confirm that this font is licensed for PDF embedding",
  );
  check(
    typeof input.data === "string" && input.data.length < 1400000,
    "Choose a WOFF2 or TTF font under 1 MB",
  );
  check(
    /^data:[\w/+.-]*;base64,[A-Za-z0-9+/=]+$/.test(input.data),
    "Font data is invalid",
  );
  const bytes = Buffer.from(input.data.split(",")[1], "base64");
  const format =
    bytes.subarray(0, 4).toString() === "wOF2"
      ? "woff2"
      : bytes.subarray(0, 4).toString("hex") === "00010000"
        ? "ttf"
        : null;
  check(
    bytes.length > 48 && bytes.length <= 1000000 && format,
    "Choose a valid WOFF2 or TrueType font under 1 MB",
  );
  const id = randomUUID();
  const font = FontSchema.parse({
    id,
    name: input.name,
    path: `${repo.workspaceId}/fonts/${id}.${format}`,
    format,
    hash: sha256(bytes),
  });
  await storage.put(font.path, bytes);
  await workspaceEvent(repo, actor, "font_uploaded", {
    font,
    licensed_for_pdf_embedding: true,
  });
  return font;
}
/** Verify the immutable asset against its send-time descriptor before serving or embedding. */
export async function readFont(
  storage: Storage,
  font: ProposalFont,
  workspaceId: string,
) {
  check(
    font.path.startsWith(workspaceId + "/fonts/"),
    "Font must belong to this workspace",
  );
  const bytes = await storage.get(font.path);
  check(
    sha256(bytes) === font.hash,
    "Font does not match its saved fingerprint",
  );
  return bytes;
}
export async function uploadedFonts(repo: Repository) {
  return (
    await repo.entities<{ type: string; metadata?: { font?: ProposalFont } }>(
      "workspace_events",
    )
  )
    .filter((e) => e.type === "font_uploaded" && e.metadata?.font)
    .map((e) => FontSchema.parse(e.metadata!.font));
}
export async function validateFonts(
  repo: Repository,
  fonts?: { heading: unknown; body: unknown },
) {
  if (!fonts) return;
  const saved = await uploadedFonts(repo);
  for (const font of [fonts.heading, fonts.body]) {
    if (typeof font === "string") continue;
    const parsed = FontSchema.parse(font);
    check(
      saved.some((f) => JSON.stringify(f) === JSON.stringify(parsed)),
      "Select a font uploaded to this workspace",
    );
  }
}
export type Activity = Audit & { proposal_id?: string; detail: string };
export async function activity(repo: Repository): Promise<Activity[]> {
  const workspace = (
    await repo.entities<
      Partial<Audit> & {
        id: string;
        type: string;
        created_at: string;
        document_id?: string;
        version?: string;
      }
    >("workspace_events")
  ).map((e) => ({
    id: e.id,
    type: e.type,
    created_at: e.created_at,
    actor: e.actor ?? "system",
    ip: e.ip ?? "",
    user_agent: e.user_agent ?? "",
    metadata: e.metadata ?? {},
    detail:
      e.type === "document_version"
        ? `Pricing reference · ${e.version ?? ""}`
        : String(e.metadata?.name ?? e.metadata?.company ?? "Workspace"),
  }));
  const proposal = (await repo.list()).flatMap((p) =>
    p.events.map((e) => ({
      ...e,
      proposal_id: p.id,
      detail: `${p.client.company} · ${p.title}${e.metadata.application_statement ? ` · ${e.metadata.application_statement}` : ""}`,
    })),
  );
  return [...workspace, ...proposal].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}
export function activityCsv(rows: Activity[]) {
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
