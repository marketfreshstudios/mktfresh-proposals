import { isDeepStrictEqual } from "node:util";
import { publishedExpiry } from "./editor-publication";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, check, type Proposal } from "./model";
import type { Repository } from "./repository";
import {
  emptyEngagement,
  engagementTargets,
  publicEngagement,
  type EngagementSession,
  type EngagementSnapshot,
  type EngagementAggregate,
  EngagementStartSchema,
} from "./engagement";

export function engagementBot(headers: Headers) {
  return (
    /bot\b|spider|crawler|scanner|facebookexternalhit|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|microsoftpreview|google-?inspection|proofpoint|barracuda|mimecast|safelinks|urlscan/i.test(
      headers.get("user-agent") ?? "",
    ) ||
    /prefetch|prerender|preview/i.test(
      `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`,
    )
  );
}
function secret() {
  const key =
    process.env.INTEGRATION_ENCRYPTION_KEY ??
    (process.env.APP_MODE === "local" && !process.env.VERCEL
      ? "local-development-only-engagement-key"
      : "");
  check(key.length >= 32, "Engagement signing key unavailable", 503);
  return key;
}
function mac(value: string) {
  return createHmac("sha256", secret())
    .update(`engagement\0${value}`)
    .digest("base64url");
}
const TicketSchema = z
  .object({
    proposal: z.string().uuid(),
    session: z.string().uuid(),
    workspace: z.string().uuid(),
    token: z.string(),
    expires: z.number(),
  })
  .strict();
export function engagementTicket(
  repo: Repository,
  p: Proposal,
  session: EngagementSession,
  now: number,
) {
  const raw = Buffer.from(
    JSON.stringify({
      proposal: p.id,
      session: session.id,
      workspace: repo.workspaceId,
      token: mac(p.token!),
      expires: now + 4 * 3600000,
    }),
  ).toString("base64url");
  return `${raw}.${mac(raw)}`;
}
export function readEngagementTicket(
  ticket: string,
  repo: Repository,
  p: Proposal,
  now: number,
) {
  const [raw, sig, extra] = ticket.split(".");
  const expected = mac(raw ?? "");
  check(
    !extra &&
      !!sig &&
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
    "Invalid engagement session",
    403,
  );
  let value;
  try {
    value = TicketSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString()),
    );
  } catch {
    throw new AppError(403, "Invalid engagement session");
  }
  check(
    value.workspace === repo.workspaceId &&
      value.proposal === p.id &&
      value.token === mac(p.token!) &&
      value.expires > now,
    "Engagement session expired",
    403,
  );
  return value.session;
}
function eligible(p: Proposal, read: boolean, now: number) {
  return (
    p.source === "native" &&
    !!p.token &&
    !p.archived_at &&
    !!p.sent_at &&
    (read
      ? ["sent", "viewed"].includes(p.status) && !p.signers.length
      : ["sent", "viewed", "signed_by_client", "completed"].includes(
          p.status,
        )) &&
    (!publishedExpiry(p) ||
      !["sent", "viewed"].includes(p.status) ||
      Date.parse(publishedExpiry(p)!) > now)
  );
}
function addViewer(list: string[], viewer: string) {
  if (!list.includes(viewer)) list.push(viewer);
}
function aggregate(
  previous: EngagementAggregate,
  before: EngagementSession | null,
  next: EngagementSession,
) {
  const a = structuredClone(previous);
  a.revision++;
  if (!before && next.count_view) {
    a.views++;
    addViewer(a.viewers, next.viewer);
    a.last_viewed_at =
      !a.last_viewed_at || a.last_viewed_at < next.started_at
        ? next.started_at
        : a.last_viewed_at;
  }
  if (
    next.count_view &&
    next.active_ms > (before?.active_ms ?? 0) &&
    (!a.last_viewed_at || a.last_viewed_at < next.last_at)
  )
    a.last_viewed_at = next.last_at;
  a.total_ms += next.active_ms - (before?.active_ms ?? 0);
  for (const [key, ms] of Object.entries(next.targets)) {
    const meta = next.labels[key];
    const target = (a.targets[key] ??= { ...meta, ms: 0, viewers: [] });
    target.label = meta.label;
    target.ms += ms - (before?.targets[key] ?? 0);
    addViewer(target.viewers, next.viewer);
  }
  const ids = new Set(before?.actions.map((a) => a.id));
  for (const action of next.actions)
    if (!ids.has(action.id)) {
      if (action.kind === "download") a.downloads++;
      else a.choices++;
    }
  return a;
}
async function commit(
  repo: Repository,
  p: Proposal,
  session: EngagementSession,
) {
  for (let n = 0; n < 12; n++) {
    const previous =
      (await repo.engagementSummary(p.id)) ?? emptyEngagement(p.id);
    const before = await repo.engagementSession(p.id, session.id);
    if (before && before.seq >= session.seq) {
      const result = await repo.saveEngagement(previous.revision, before, {
        ...previous,
        revision: previous.revision + 1,
      });
      if (result === "limited")
        throw new AppError(
          429,
          "Too many engagement updates. Try again later.",
        );
      return before;
    }
    check(
      !before ||
        (!before.ended &&
          session.active_ms >= before.active_ms &&
          Object.entries(before.targets).every(
            ([key, ms]) => (session.targets[key] ?? -1) >= ms,
          ) &&
          before.actions.every((a) =>
            session.actions.some((b) => isDeepStrictEqual(a, b)),
          )),
      "Invalid cumulative session",
      400,
    );
    const next = aggregate(previous, before, session);
    const result = await repo.saveEngagement(previous.revision, session, next);
    if (result === "saved") return session;
    if (result === "limited")
      throw new AppError(429, "Too many engagement updates. Try again later.");
    const latest = await repo.get(p.id);
    check(
      latest && eligible(latest, session.count_view && !before, Date.now()),
      "Engagement closed",
      410,
    );
  }
  throw new AppError(409, "Engagement changed; retry the batch");
}
export async function startEngagement(
  repo: Repository,
  p: Proposal,
  input: z.infer<typeof EngagementStartSchema>,
  now = Date.now(),
) {
  check(eligible(p, input.intent === "read", now), "Engagement closed", 410);
  const existing = await repo.engagementSession(p.id, input.session_id);
  const viewer = mac(`${p.id}\0${input.browser_id}`);
  if (existing) {
    check(
      existing.viewer === viewer &&
        existing.count_view === (input.intent === "read"),
      "Invalid engagement session",
      403,
    );
    await commit(repo, p, existing);
    return {
      session: existing,
      ticket: engagementTicket(repo, p, existing, now),
    };
  }
  const session: EngagementSession = {
    id: input.session_id,
    proposal_id: p.id,
    viewer,
    recipient: p.client.email
      ? `${p.client.first_name} ${p.client.last_name}`.trim() ||
        p.client.company
      : null,
    device: input.device,
    started_at: new Date(now).toISOString(),
    last_at: new Date(now).toISOString(),
    ended_at: null,
    seq: 1,
    active_ms: 0,
    targets: {},
    actions: [],
    ended: false,
    count_view: input.intent === "read",
    version_hash: p.versions.at(-1)!.content_hash,
    version_id: p.versions.at(-1)!.id,
    labels: Object.fromEntries(
      engagementTargets(p).map((t) => [
        t.key,
        { label: t.label, kind: t.kind },
      ]),
    ),
  };
  await commit(repo, p, session);
  return { session, ticket: engagementTicket(repo, p, session, now) };
}
export async function recordEngagement(
  repo: Repository,
  p: Proposal,
  ticket: string,
  snapshot: EngagementSnapshot,
  now = Date.now(),
) {
  check(eligible(p, false, now), "Engagement closed", 410);
  const id = readEngagementTicket(ticket, repo, p, now);
  const before = await repo.engagementSession(p.id, id);
  check(before, "Engagement session expired", 410);
  if (snapshot.seq <= before.seq) {
    await commit(repo, p, before);
    return;
  }
  check(!before.ended, "Engagement session ended", 410);
  // Choices change the version hash, but not this publication's identity.
  const version = p.versions.find((v) => v.id === before.version_id);
  check(version, "Engagement version unavailable", 410);
  const end = p.client_signed_at
    ? Math.min(now, Date.parse(p.client_signed_at))
    : now;
  const maximum = Math.max(0, end - Date.parse(before.started_at));
  check(
    snapshot.active_ms >= before.active_ms &&
      snapshot.active_ms <= maximum + 1000,
    "Invalid active time",
    400,
  );
  check(
    before.count_view || snapshot.active_ms === 0,
    "Download sessions do not track reading",
    400,
  );
  for (const [key, ms] of Object.entries(snapshot.targets))
    check(
      Object.hasOwn(before.labels, key) &&
        ms >= (before.targets[key] ?? 0) &&
        ms <= snapshot.active_ms,
      "Invalid section time",
      400,
    );
  for (const key of Object.keys(before.targets))
    check(key in snapshot.targets, "Missing cumulative section", 400);
  for (const kind of ["section", "page"])
    check(
      Object.entries(snapshot.targets)
        .filter(([k]) => before.labels[k].kind === kind)
        .reduce((sum, [, ms]) => sum + ms, 0) <= snapshot.active_ms,
      "Overlapping section time",
      400,
    );
  const ids = new Set(snapshot.actions.map((a) => a.id));
  check(
    ids.size === snapshot.actions.length &&
      before.actions.every((a) =>
        snapshot.actions.some((b) => isDeepStrictEqual(a, b)),
      ),
    "Invalid cumulative actions",
    400,
  );
  for (const a of snapshot.actions) {
    if (a.kind === "choice")
      check(
        before.count_view &&
          version.quote.some(
            (i) => i.id === a.item_id && (i.optional || i.choice_group_id),
          ),
        "Invalid choice item",
        400,
      );
    else
      check(
        p.files.some((f) => f.id === a.file_id && f.kind === "sealed"),
        "Invalid PDF download",
        400,
      );
  }
  const session = {
    ...before,
    ...snapshot,
    last_at:
      snapshot.active_ms > before.active_ms ||
      snapshot.actions.length > before.actions.length ||
      snapshot.ended
        ? new Date(now).toISOString()
        : before.last_at,
    ended_at: snapshot.ended ? new Date(now).toISOString() : null,
  };
  await commit(repo, p, session);
}
export async function engagementReport(repo: Repository, p: Proposal) {
  const a = (await repo.engagementSummary(p.id)) ?? emptyEngagement(p.id);
  const current = engagementTargets(p);
  for (const target of current)
    a.targets[target.key] ??= {
      label: target.label,
      kind: target.kind,
      ms: 0,
      viewers: [],
    };
  const keys = new Set(current.map((t) => t.key));
  const ordered = {
    ...a,
    targets: Object.fromEntries([
      ...current.map(
        (t) => [t.key, { ...a.targets[t.key], label: t.label }] as const,
      ),
      ...Object.entries(a.targets).filter(([key]) => !keys.has(key)),
    ]),
  };
  return {
    ...publicEngagement(ordered),
    first_viewed_at: p.first_viewed_at,
    sessions: (await repo.engagementSessions(p.id))
      .filter((s) => s.count_view)
      .map((s) => ({
        id: s.id,
        recipient: s.recipient,
        device: s.device,
        started_at: s.started_at,
        last_at: s.last_at,
        ended_at: s.ended_at,
        active_ms: s.active_ms,
        actions: s.actions.map((a) => ({
          ...a,
          ...(a.kind === "choice"
            ? {
                name:
                  p.versions
                    .find((v) => v.id === s.version_id)
                    ?.quote.find((i) => i.id === a.item_id)?.name ?? "Item",
              }
            : {}),
        })),
      })),
  };
}
