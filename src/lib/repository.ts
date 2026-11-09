import { withCount } from "./count-label";
import {
  questionsReadable,
  questionsWritable,
  summarizeQuestions,
  type QuestionDelivery,
  type QuestionSummary,
  type QuestionThread,
  type QuestionWrite,
  type QuestionWriteResult,
} from "./proposal-questions";
import type {
  EngagementActivity,
  EngagementAggregate,
  EngagementSession,
} from "./engagement";
import { isDeepStrictEqual } from "node:util";
import { sameClientContact, unsignedClientProposal } from "./clients";
import { LOCAL_WORKSPACE_ID } from "./workspace";
import {
  projectReportProposal,
  type ReportEngagement,
  type ReportFacts,
  type ReportProposal,
  type ReportQuestion,
  type ReportVersion,
} from "./report-metrics";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  type Proposal,
  type Actor,
  type Client,
  type Audit,
  type Template,
  type SavedBlock,
} from "./model";
const clientDeleteBlockedMessage = (count: number) =>
  `Has ${withCount(count, "proposal")} — archive ${count === 1 ? "the proposal" : "them"} or keep the client`;

export type EntityTable =
  | "email_templates"
  | "email_log"
  | "proposal_questions"
  | "proposal_question_mail"
  | "clients"
  | "pricing_items"
  | "templates"
  | "content_library"
  | "workspace_events"
  | "workspace_settings"
  | "workspace_documents"
  | "custom_families"
  | "provider_credentials"
  | "webhook_events"
  | "provider_actions"
  | "proposal_engagement"
  | "proposal_engagement_totals"
  | "engagement_local_limits";
export type StudioEntityTable = "templates" | "content_library";
export type LinkedBlockCommit = {
  before: SavedBlock | null;
  after: SavedBlock | null;
  templates: { before: Template; after: Template }[];
  proposals: { before: Proposal; after: Proposal }[];
  events: Audit[];
};
export interface Repository {
  reportNames(): Promise<{
    templates: Map<string, string>;
    clients: Map<string, string>;
  }>;
  reportProposals(): Promise<ReportProposal[]>;
  reportFacts(request: ReportFactRequest): Promise<ReportFacts>;
  reportPage(ids: string[]): Promise<Proposal[]>;
  questionThreads(id: string): Promise<QuestionThread[]>;
  questionCounts(
    ids: string[],
    user: string,
  ): Promise<Record<string, QuestionSummary>>;
  writeQuestion(change: QuestionWrite): Promise<QuestionWriteResult>;
  claimQuestionMail(proposal?: string): Promise<QuestionDelivery | null>;
  finishQuestionMail(
    mail: QuestionDelivery,
    next: string | null,
  ): Promise<void>;
  engagementSummary(id: string): Promise<EngagementAggregate | null>;
  engagementSession(
    proposal: string,
    id: string,
  ): Promise<EngagementSession | null>;
  engagementSessions(proposal: string): Promise<EngagementActivity[]>;
  saveEngagement(
    expected: number,
    session: EngagementSession,
    summary: EngagementAggregate,
  ): Promise<"saved" | "stale" | "limited">;
  pruneEngagement(before: string): Promise<void>;
  commitLinkedBlock(change: LinkedBlockCommit, audit: Audit): Promise<boolean>;
  saveStudioEntity(
    table: StudioEntityTable,
    expected: { id: string } | null,
    replacement: { id: string },
    audit: Audit,
  ): Promise<boolean>;
  readonly workspaceId: string;
  replaceStarter(
    expected: Template,
    replacement: Template,
    audit: Audit,
  ): Promise<boolean>;
  removeSavedBlock(id: string): Promise<boolean>;
  saveReassignments(documents: Proposal[], actor: Actor): Promise<void>;
  saveEmailTemplate<T extends { id: string }>(
    template: T,
    audit: Audit,
  ): Promise<void>;
  emailLog<T>(proposalId: string): Promise<T[]>;
  saveClientContact(client: Client): Promise<Client>;
  saveClientAndProposals(
    client: Client,
    documents: Proposal[],
  ): Promise<Client>;
  deleteClient(id: string, actor: Actor): Promise<void>;
  linkClientStripe(
    id: string,
    expected: string | null,
    email: string,
    customer: string | null,
    actor: Actor,
  ): Promise<void>;
  finishDocumentRefresh<T extends { id: string }>(
    document: T,
    attempt: string,
  ): Promise<boolean>;
  get(id: string): Promise<Proposal | null>;
  byToken(token: string): Promise<Proposal | null>;
  list(search?: string): Promise<Proposal[]>;
  save(p: Proposal, expected: number): Promise<void>;
  entities<T>(table: EntityTable): Promise<T[]>;
  providerAction<T>(id: string): Promise<T | null>;
  providerCredential<T>(id: string): Promise<T | null>;
  replaceProviderCredential<T extends { id: string }>(
    id: string,
    expected: T | null,
    replacement: T | null,
  ): Promise<boolean>;
  put<T extends { id: string }>(table: EntityTable, entity: T): Promise<void>;
}
type ReportFactRequest = Partial<
  Record<"sections" | "questions" | "values" | "billing", string[]>
>;

export class MemoryRepository implements Repository {
  constructor(public readonly workspaceId = LOCAL_WORKSPACE_ID) {}
  rows = new Map<string, Proposal>();
  catalog = new Map<EntityTable, Map<string, unknown>>();
  async reportNames() {
    return {
      templates: new Map(
        (await this.entities<Template>("templates")).map((t) => [t.id, t.name]),
      ),
      clients: new Map(
        (await this.entities<Client>("clients")).map((c) => [c.id, c.company]),
      ),
    };
  }
  async reportProposals() {
    return [...this.rows.values()]
      .filter(
        (p) =>
          (p.workspace_id ?? LOCAL_WORKSPACE_ID) === this.workspaceId &&
          p.source === "native",
      )
      .map(projectReportProposal);
  }
  async reportFacts({
    sections,
    questions,
    values,
    billing,
  }: ReportFactRequest) {
    const sectionIds = new Set(sections),
      questionIds = new Set(questions);
    const valueIds = new Set(values),
      billingIds = new Set(billing);
    return {
      engagement: (
        await this.entities<EngagementAggregate>("proposal_engagement_totals")
      )
        .filter((row) => sectionIds.has(row.id))
        .map(({ id, targets }) => ({ id, targets })),
      questions: (await this.entities<QuestionThread>("proposal_questions"))
        .filter((row) => questionIds.has(row.proposal_id))
        .map(({ proposal_id, status, replies, created_at }) => ({
          proposal_id,
          status,
          answered: replies.length > 0,
          asked_at: created_at,
          first_reply_at: replies[0]?.created_at,
        })),
      versions: [...valueIds].flatMap((id) => {
        const p = this.rows.get(id);
        if (!p || (p.workspace_id ?? LOCAL_WORKSPACE_ID) !== this.workspaceId)
          return [];
        return p.versions
          .filter((v) => v.frozen)
          .map((v) => ({
            proposal_id: id,
            version_no: v.version_no,
            variables: v.variables_resolved,
          }));
      }),
      pendingBilling: [...billingIds].filter((id) => {
        const p = this.rows.get(id);
        return (
          p &&
          (p.workspace_id ?? LOCAL_WORKSPACE_ID) === this.workspaceId &&
          p.jobs.some((j) => j.kind === "billing" && j.status !== "done")
        );
      }),
    };
  }
  async reportPage(ids: string[]) {
    return (await Promise.all(ids.map((id) => this.get(id)))).filter(
      (p): p is Proposal => !!p,
    );
  }
  async questionThreads(id: string) {
    return (await this.entities<QuestionThread>("proposal_questions"))
      .filter((row) => row.proposal_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async questionCounts(ids: string[], user: string) {
    const wanted = new Set(ids);
    return summarizeQuestions(
      (await this.entities<QuestionThread>("proposal_questions")).filter(
        (row) => row.status === "open" && wanted.has(row.proposal_id),
      ),
      user,
    );
  }
  async writeQuestion({
    thread,
    previous,
    proposalRevision,
    mail,
  }: QuestionWrite): Promise<QuestionWriteResult> {
    const p = this.rows.get(thread.proposal_id);
    if (!p) return "closed";
    const rows = this.entityMap("proposal_questions");
    const prior = rows.get(thread.id) as QuestionThread | undefined;
    if (proposalRevision !== undefined && p.revision !== proposalRevision)
      return "stale";
    if (previous === null) {
      if (prior) return "stale";
      if (!questionsWritable(p)) return "closed";
      const since = Date.now() - 3600000;
      const recent = [...rows.values()].filter((value) => {
        const row = value as QuestionThread;
        return row.proposal_id === p.id && Date.parse(row.created_at) > since;
      });
      if (recent.length >= 10) return "limited";
      const event = crypto.randomUUID();
      this.entityMap("proposal_engagement").set(event, {
        id: event,
        kind: "question",
        proposal_id: p.id,
        question_id: thread.id,
        started_at: thread.created_at,
        count_view: false,
        seq: 100001,
      });
    } else if (prior?.proposal_id !== p.id || prior.revision !== previous) {
      return "stale";
    } else if (proposalRevision !== undefined && !questionsReadable(p)) {
      return "closed";
    }
    rows.set(thread.id, structuredClone(thread));
    const outbox = this.entityMap("proposal_question_mail");
    for (const entry of mail)
      outbox.set(entry.id, {
        ...structuredClone(entry),
        attempt: 0,
        available_at: new Date().toISOString(),
      });
    return "saved";
  }
  async claimQuestionMail(proposal?: string) {
    const now = Date.now();
    const rows = this.entityMap("proposal_question_mail");
    const mail = ([...rows.values()] as QuestionDelivery[])
      .filter(
        (row) =>
          (!proposal || row.proposal_id === proposal) &&
          !!row.available_at &&
          Date.parse(row.available_at) <= now,
      )
      .sort((a, b) => a.available_at!.localeCompare(b.available_at!))[0];
    if (!mail) return null;
    const claimed = {
      ...mail,
      attempt: mail.attempt + 1,
      available_at: new Date(now + 180000).toISOString(),
    };
    rows.set(mail.id, claimed);
    return structuredClone(claimed);
  }
  async finishQuestionMail(mail: QuestionDelivery, next: string | null) {
    const rows = this.entityMap("proposal_question_mail");
    const current = rows.get(mail.id) as QuestionDelivery | undefined;
    if (current?.attempt === mail.attempt)
      rows.set(mail.id, { ...current, available_at: next });
  }
  private entityMap(table: EntityTable) {
    let rows = this.catalog.get(table);
    if (!rows) {
      rows = new Map();
      this.catalog.set(table, rows);
    }
    return rows;
  }
  async engagementSummary(id: string) {
    return structuredClone(
      (this.catalog
        .get("proposal_engagement_totals")
        ?.get(id) as EngagementAggregate) ?? null,
    );
  }
  async engagementSession(proposal: string, id: string) {
    const row = this.catalog.get("proposal_engagement")?.get(id) as
      EngagementSession | undefined;
    return structuredClone(row?.proposal_id === proposal ? row : null);
  }
  async engagementSessions(proposal: string) {
    return (await this.entities<EngagementActivity>("proposal_engagement"))
      .filter((s) => s.proposal_id === proposal)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }
  async saveEngagement(
    expected: number,
    session: EngagementSession,
    summary: EngagementAggregate,
  ): Promise<"saved" | "stale" | "limited"> {
    const p = this.rows.get(summary.id);
    if (
      !p ||
      p.archived_at ||
      !p.token ||
      !["sent", "viewed", "signed_by_client", "completed"].includes(p.status)
    )
      return "stale";
    const bucket = Math.floor(Date.now() / 600000);
    const rates = this.catalog.get("engagement_local_limits") ?? new Map();
    const previous = rates.get(p.id) as
      { bucket: number; count: number } | undefined;
    const count = previous?.bucket === bucket ? previous.count + 1 : 1;
    rates.set(p.id, { bucket, count });
    this.catalog.set("engagement_local_limits", rates);
    if (count > 600) return "limited";
    const current = this.catalog
      .get("proposal_engagement_totals")
      ?.get(p.id) as EngagementAggregate | undefined;
    if ((current?.revision ?? 0) !== expected) return "stale";
    const prior = this.catalog.get("proposal_engagement")?.get(session.id) as
      EngagementSession | undefined;
    if (!prior && session.count_view && !["sent", "viewed"].includes(p.status))
      return "stale";
    if (prior && (prior.proposal_id !== p.id || prior.seq >= session.seq))
      return "stale";
    for (const name of [
      "proposal_engagement",
      "proposal_engagement_totals",
    ] as const)
      if (!this.catalog.has(name)) this.catalog.set(name, new Map());
    this.catalog
      .get("proposal_engagement")!
      .set(session.id, structuredClone(session));
    this.catalog
      .get("proposal_engagement_totals")!
      .set(p.id, structuredClone(summary));
    return "saved";
  }
  async pruneEngagement(before: string) {
    const rows = this.catalog.get("proposal_engagement");
    for (const [id, s] of rows ?? [])
      if ((s as EngagementSession).started_at < before) rows!.delete(id);
  }
  async commitLinkedBlock(change: LinkedBlockCommit, audit: Audit) {
    const clean = (x: unknown) => JSON.parse(JSON.stringify(x ?? null));
    const id = (change.before ?? change.after)!.id;
    const omit = (value: object, keys: string[]) =>
      clean(
        Object.fromEntries(
          Object.entries(value).filter(([k]) => !keys.includes(k)),
        ),
      );
    if (change.after && change.after.id !== id)
      throw new AppError(400, "Saved block identity changed");
    const current = this.catalog.get("content_library")?.get(id) ?? null;
    if (!isDeepStrictEqual(clean(current), clean(change.before))) return false;
    for (const pair of change.templates) {
      if (
        pair.before.starter_key ||
        !isDeepStrictEqual(
          clean(this.catalog.get("templates")?.get(pair.before.id)),
          clean(pair.before),
        )
      )
        return false;
      if (
        !isDeepStrictEqual(
          omit(pair.before, ["content", "pagination"]),
          omit(pair.after, ["content", "pagination"]),
        )
      )
        throw new AppError(400, "Linked update only changes template content");
    }
    for (const pair of change.proposals) {
      const p = this.rows.get(pair.before.id);
      if (
        !p ||
        p.status !== "draft" ||
        p.signers.length ||
        p.token ||
        p.source !== "native" ||
        p.archived_at ||
        (p.workspace_id ?? this.workspaceId) !== this.workspaceId ||
        p.versions.some((v) => v.frozen) ||
        !isDeepStrictEqual(clean(p), clean(pair.before))
      )
        return false;
      if (
        !isDeepStrictEqual(
          omit(pair.before, [
            "content",
            "pagination",
            "revision",
            "updated_at",
            "events",
          ]),
          omit(pair.after, [
            "content",
            "pagination",
            "revision",
            "updated_at",
            "events",
          ]),
        )
      )
        throw new AppError(
          400,
          "Linked update cannot change signing, versions or billing",
        );
      if (
        pair.after.revision !== p.revision + 1 ||
        pair.after.events.length !== p.events.length + 1 ||
        !isDeepStrictEqual(
          clean(pair.after.events.slice(0, -1)),
          clean(p.events),
        )
      )
        throw new AppError(400, "Append-only history required");
    }
    const events = this.catalog.get("workspace_events") ?? new Map();
    for (const e of [...change.events, audit])
      if (events.has(e.id)) throw new AppError(409, "Append-only history");
    if (!this.catalog.has("content_library"))
      this.catalog.set("content_library", new Map());
    if (change.after)
      this.catalog
        .get("content_library")!
        .set(id, structuredClone(change.after));
    else this.catalog.get("content_library")!.delete(id);
    for (const { after } of change.templates)
      this.catalog.get("templates")!.set(after.id, structuredClone(after));
    for (const { after } of change.proposals)
      this.rows.set(after.id, structuredClone(after));
    for (const e of [...change.events, audit])
      events.set(e.id, structuredClone(e));
    this.catalog.set("workspace_events", events);
    return true;
  }
  async saveStudioEntity(
    table: StudioEntityTable,
    expected: { id: string } | null,
    replacement: { id: string },
    audit: Audit,
  ) {
    const current = this.catalog.get(table)?.get(replacement.id);
    if (
      expected
        ? !current ||
          !isDeepStrictEqual(
            JSON.parse(JSON.stringify(current)),
            JSON.parse(JSON.stringify(expected)),
          )
        : !!current
    )
      return false;
    if (
      table === "templates" &&
      ((current as any)?.starter_key || (replacement as any).starter_key)
    )
      throw new AppError(403, "Duplicate the starter first");
    if (this.catalog.get("workspace_events")?.has(audit.id))
      throw new AppError(409, "Append-only history");
    if (!this.catalog.has(table)) this.catalog.set(table, new Map());
    if (!this.catalog.has("workspace_events"))
      this.catalog.set("workspace_events", new Map());
    this.catalog.get(table)!.set(replacement.id, structuredClone(replacement));
    this.catalog.get("workspace_events")!.set(audit.id, structuredClone(audit));
    return true;
  }
  async replaceStarter(
    expected: Template,
    replacement: Template,
    audit: Audit,
  ) {
    const current = this.catalog.get("templates")?.get(expected.id) as
      Template | undefined;
    if (
      !current?.starter_key ||
      current.starter_key !== replacement.starter_key ||
      replacement.id !== expected.id ||
      !isDeepStrictEqual(
        JSON.parse(JSON.stringify(current)),
        JSON.parse(JSON.stringify(expected)),
      )
    )
      return false;
    if (this.catalog.get("workspace_events")?.has(audit.id))
      throw new AppError(409, "Append-only history");
    this.catalog
      .get("templates")!
      .set(expected.id, structuredClone(replacement));
    if (!this.catalog.has("workspace_events"))
      this.catalog.set("workspace_events", new Map());
    this.catalog.get("workspace_events")!.set(audit.id, structuredClone(audit));
    return true;
  }
  async removeSavedBlock(id: string) {
    const row = this.catalog.get("content_library")?.get(id) as
      { workspace_id?: string } | undefined;
    if (!row || (row.workspace_id && row.workspace_id !== this.workspaceId))
      return false;
    return this.catalog.get("content_library")!.delete(id);
  }
  async saveReassignments(documents: Proposal[], actor: Actor) {
    for (const p of documents) {
      const current = this.rows.get(p.id);
      if (!current || current.revision !== p.revision - 1)
        throw new AppError(409, "Proposal changed; reload and try again");
      if ((current.workspace_id ?? this.workspaceId) !== this.workspaceId)
        throw new AppError(403, "Workspace mismatch");
    }
    // No awaits between validation and commit: all-or-nothing like the SQL transaction.
    for (const p of documents) {
      this.rows.set(p.id, structuredClone(p));
      const audit = p.events.at(-1)!;
      const events = this.catalog.get("workspace_events") ?? new Map();
      events.set(
        audit.id,
        structuredClone({
          ...audit,
          metadata: { ...audit.metadata, proposal_id: p.id, title: p.title },
        }),
      );
      this.catalog.set("workspace_events", events);
    }
  }
  async saveEmailTemplate<T extends { id: string }>(template: T, audit: Audit) {
    const templates = this.catalog.get("email_templates") ?? new Map();
    const events = this.catalog.get("workspace_events") ?? new Map();
    if (events.has(audit.id)) throw new AppError(409, "Append-only history");
    templates.set(
      template.id,
      structuredClone({ ...template, workspace_id: this.workspaceId }),
    );
    events.set(
      audit.id,
      structuredClone({ ...audit, workspace_id: this.workspaceId }),
    );
    this.catalog.set("email_templates", templates);
    this.catalog.set("workspace_events", events);
  }
  async emailLog<T>(proposalId: string) {
    return (
      await this.entities<T & { proposal_id: string }>("email_log")
    ).filter((e) => e.proposal_id === proposalId);
  }
  async saveClientContact(client: Client) {
    const existing = this.catalog.get("clients")?.get(client.id) as
      Client | undefined;
    const saved = {
      ...client,
      stripe_customer_id: existing?.stripe_customer_id ?? null,
    };
    // The memory repository commits synchronously, like the database row update.
    const clients = this.catalog.get("clients") ?? new Map();
    clients.set(client.id, structuredClone(saved));
    this.catalog.set("clients", clients);
    return saved;
  }
  async saveClientAndProposals(client: Client, documents: Proposal[]) {
    const existing = this.catalog.get("clients")?.get(client.id) as
      Client | undefined;
    const saved = {
      ...client,
      stripe_customer_id: existing?.stripe_customer_id ?? null,
    };
    const updates = new Map(documents.map((p) => [p.id, p]));
    if (updates.size !== documents.length)
      throw new AppError(409, "Duplicate proposal updates");
    for (const current of this.rows.values()) {
      if ((current.workspace_id ?? LOCAL_WORKSPACE_ID) !== this.workspaceId)
        continue;
      if (
        !unsignedClientProposal(current, client.id) ||
        sameClientContact(current.client, saved)
      )
        continue;
      const next = updates.get(current.id);
      if (
        !next ||
        next.revision !== current.revision + 1 ||
        next.client.id !== client.id ||
        (next.workspace_id ?? LOCAL_WORKSPACE_ID) !== this.workspaceId
      )
        throw new AppError(
          409,
          "Client proposals changed; retry saving the client",
        );
      updates.delete(current.id);
    }
    if (updates.size)
      throw new AppError(
        409,
        "Proposal signed or changed; retry saving the client",
      );
    // Validate everything before either write; no awaits in this transaction.
    const clients = this.catalog.get("clients") ?? new Map();
    clients.set(client.id, structuredClone(saved));
    this.catalog.set("clients", clients);
    for (const p of documents)
      this.rows.set(p.id, structuredClone({ ...p, client: saved }));
    return saved;
  }
  async linkClientStripe(
    id: string,
    expected: string | null,
    email: string,
    customer: string | null,
    actor: Actor,
  ) {
    if (!actor.actor.startsWith("staff:"))
      throw new AppError(403, "Staff authorization required");
    const client = this.catalog.get("clients")?.get(id) as Client | undefined;
    if (!client) throw new AppError(404, "Client not found");
    if (
      client.stripe_customer_id !== expected ||
      client.email.toLowerCase() !== email.toLowerCase()
    )
      throw new AppError(
        409,
        "Customer link or email changed; reload and try again",
      );
    this.catalog
      .get("clients")!
      .set(id, structuredClone({ ...client, stripe_customer_id: customer }));
    const events = this.catalog.get("workspace_events") ?? new Map();
    const idEvent = crypto.randomUUID();
    events.set(idEvent, {
      id: idEvent,
      ...actor,
      type: customer ? "client_stripe_linked" : "client_stripe_unlinked",
      created_at: new Date().toISOString(),
      metadata: {
        client_id: id,
        name: client.company,
        previous_customer_id: expected,
        customer_id: customer,
      },
    });
    this.catalog.set("workspace_events", events);
  }
  async deleteClient(id: string, actor: Actor) {
    if (!actor.actor.startsWith("staff:"))
      throw new AppError(403, "Staff authorization required");
    const client = (await this.entities<Client>("clients")).find(
      (c) => c.id === id,
    );
    if (!client) throw new AppError(404, "Client not found");
    const count = (await this.list()).filter((p) => p.client.id === id).length;
    if (count) throw new AppError(409, clientDeleteBlockedMessage(count));
    this.catalog.get("clients")!.delete(id);
    await this.put("workspace_events", {
      id: crypto.randomUUID(),
      type: "client_deleted",
      ...actor,
      created_at: new Date().toISOString(),
      metadata: { client_id: id, company: client.company },
    });
  }
  async get(id: string) {
    const p = this.rows.get(id);
    return structuredClone(
      p && (p.workspace_id ?? LOCAL_WORKSPACE_ID) === this.workspaceId
        ? p
        : null,
    );
  }
  async byToken(token: string) {
    return structuredClone(
      [...this.rows.values()].find(
        (p) =>
          p.token === token &&
          (p.workspace_id ?? LOCAL_WORKSPACE_ID) === this.workspaceId,
      ) ?? null,
    );
  }
  async list(search?: string) {
    const terms = (search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return structuredClone(
      [...this.rows.values()].filter(
        (p) =>
          (p.workspace_id ?? LOCAL_WORKSPACE_ID) === this.workspaceId &&
          terms.every((t) =>
            `${p.title} ${p.client.company} ${p.client.email} ${p.search_text}`
              .toLowerCase()
              .includes(t),
          ),
      ),
    );
  }
  async save(p: Proposal, expected: number) {
    if ((this.rows.get(p.id)?.revision ?? -1) !== expected)
      throw new AppError(409, "Proposal changed; reload and try again");
    if (p.workspace_id && p.workspace_id !== this.workspaceId)
      throw new AppError(403, "Workspace mismatch");
    if (
      p.token &&
      [...this.rows.values()].some(
        (row) => row.id !== p.id && row.token === p.token,
      )
    )
      throw new AppError(409, "Client link collision; retry");
    this.rows.set(
      p.id,
      structuredClone({ ...p, workspace_id: this.workspaceId }),
    );
  }
  async entities<T>(table: EntityTable) {
    return structuredClone([
      ...(this.catalog.get(table)?.values() ?? []),
    ]) as T[];
  }
  async providerAction<T>(id: string) {
    return structuredClone(
      this.catalog.get("provider_actions")?.get(id) ?? null,
    ) as T | null;
  }
  async providerCredential<T>(id: string) {
    return structuredClone(
      this.catalog.get("provider_credentials")?.get(id) ?? null,
    ) as T | null;
  }
  async replaceProviderCredential<T extends { id: string }>(
    id: string,
    expected: T | null,
    replacement: T | null,
  ) {
    const table = this.catalog.get("provider_credentials") ?? new Map();
    if (!isDeepStrictEqual(table.get(id) ?? null, expected)) return false;
    if (replacement) table.set(id, structuredClone(replacement));
    else table.delete(id);
    this.catalog.set("provider_credentials", table);
    return true;
  }
  async finishDocumentRefresh<T extends { id: string }>(
    document: T,
    attempt: string,
  ) {
    const current = this.catalog
      .get("workspace_documents")
      ?.get(document.id) as { refresh_id?: string } | undefined;
    if (current?.refresh_id !== attempt) return false;
    this.catalog
      .get("workspace_documents")!
      .set(document.id, structuredClone(document));
    return true;
  }
  async put<T extends { id: string }>(table: EntityTable, entity: T) {
    if (table === "email_log" && this.catalog.get(table)?.has(entity.id))
      throw new AppError(409, "Append-only email log");
    if (!this.catalog.has(table)) this.catalog.set(table, new Map());
    this.catalog.get(table)!.set(entity.id, structuredClone(entity));
  }
}
// Local development only, single Node process. Production always uses database CAS.
export class LocalRepository extends MemoryRepository {
  override async reportProposals() {
    await this.ready;
    return super.reportProposals();
  }
  private async questionTransaction<T>(operation: () => Promise<T>) {
    await this.ready;
    const run = this.tail.then(async () => {
      const result = await operation();
      await this.persist();
      return result;
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async writeQuestion(change: QuestionWrite) {
    return this.questionTransaction(() => super.writeQuestion(change));
  }
  override async claimQuestionMail(proposal?: string) {
    return this.questionTransaction(() => super.claimQuestionMail(proposal));
  }
  override async finishQuestionMail(
    mail: QuestionDelivery,
    next: string | null,
  ) {
    return this.questionTransaction(() => super.finishQuestionMail(mail, next));
  }
  override async engagementSummary(id: string) {
    await this.ready;
    return super.engagementSummary(id);
  }
  override async engagementSession(p: string, id: string) {
    await this.ready;
    return super.engagementSession(p, id);
  }
  override async engagementSessions(p: string) {
    await this.ready;
    return super.engagementSessions(p);
  }
  override async saveEngagement(
    expected: number,
    session: EngagementSession,
    summary: EngagementAggregate,
  ) {
    await this.ready;
    const run = this.tail.then(async () => {
      const result = await super.saveEngagement(expected, session, summary);
      await this.persist();
      return result;
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async pruneEngagement(before: string) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.pruneEngagement(before);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async commitLinkedBlock(change: LinkedBlockCommit, audit: Audit) {
    await this.ready;
    const operation = this.tail.then(async () => {
      const saved = await super.commitLinkedBlock(change, audit);
      if (saved) await this.persist();
      return saved;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  private ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private dir: string,
    workspaceId = LOCAL_WORKSPACE_ID,
  ) {
    super(workspaceId);
    this.ready = this.load();
  }
  private async load() {
    try {
      const d = JSON.parse(await readFile(join(this.dir, "db.json"), "utf8"));
      this.rows = new Map(d.rows);
      this.catalog = new Map(
        d.catalog.map(([k, v]: [EntityTable, [string, unknown][]]) => [
          k,
          new Map(v),
        ]),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  private async persist() {
    await mkdir(this.dir, { recursive: true });
    await writeFile(
      join(this.dir, "db.tmp"),
      JSON.stringify({
        rows: [...this.rows],
        catalog: [...this.catalog].map(([k, v]) => [k, [...v]]),
      }),
      { mode: 0o600 },
    );
    await rename(join(this.dir, "db.tmp"), join(this.dir, "db.json"));
  }
  override async saveReassignments(documents: Proposal[], actor: Actor) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.saveReassignments(documents, actor);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async saveEmailTemplate<T extends { id: string }>(
    template: T,
    audit: Audit,
  ) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.saveEmailTemplate(template, audit);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async saveClientContact(client: Client) {
    await this.ready;
    const run = this.tail.then(async () => {
      const saved = await super.saveClientContact(client);
      await this.persist();
      return saved;
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async saveClientAndProposals(client: Client, documents: Proposal[]) {
    await this.ready;
    const run = this.tail.then(async () => {
      const saved = await super.saveClientAndProposals(client, documents);
      await this.persist();
      return saved;
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async linkClientStripe(
    id: string,
    expected: string | null,
    email: string,
    customer: string | null,
    actor: Actor,
  ) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.linkClientStripe(id, expected, email, customer, actor);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async deleteClient(id: string, actor: Actor) {
    await this.ready;
    const run = this.tail.then(async () => {
      // Avoid the queued put override while this transaction owns the queue.
      const client = (await super.entities<Client>("clients")).find(
        (c) => c.id === id,
      );
      if (!actor.actor.startsWith("staff:"))
        throw new AppError(403, "Staff authorization required");
      if (!client) throw new AppError(404, "Client not found");
      const count = (await super.list()).filter(
        (p) => p.client.id === id,
      ).length;
      if (count) throw new AppError(409, clientDeleteBlockedMessage(count));
      this.catalog.get("clients")!.delete(id);
      await super.put("workspace_events", {
        id: crypto.randomUUID(),
        type: "client_deleted",
        ...actor,
        created_at: new Date().toISOString(),
        metadata: { client_id: id, company: client.company },
      });
      await this.persist();
    });
    this.tail = run.catch(() => {});
    await run;
  }
  override async get(id: string) {
    await this.ready;
    return super.get(id);
  }
  override async byToken(token: string) {
    await this.ready;
    return super.byToken(token);
  }
  override async list(search?: string) {
    await this.ready;
    return super.list(search);
  }
  override async entities<T>(t: EntityTable) {
    await this.ready;
    return super.entities<T>(t);
  }
  override async providerAction<T>(id: string) {
    await this.ready;
    return super.providerAction<T>(id);
  }
  override async providerCredential<T>(id: string) {
    await this.ready;
    return super.providerCredential<T>(id);
  }
  override async replaceProviderCredential<T extends { id: string }>(
    id: string,
    expected: T | null,
    replacement: T | null,
  ) {
    return this.questionTransaction(() =>
      super.replaceProviderCredential(id, expected, replacement),
    );
  }
  override async save(p: Proposal, e: number) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.save(p, e);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    await run;
  }
  override async finishDocumentRefresh<T extends { id: string }>(
    document: T,
    attempt: string,
  ) {
    await this.ready;
    const run = this.tail.then(async () => {
      const saved = await super.finishDocumentRefresh(document, attempt);
      if (saved) await this.persist();
      return saved;
    });
    this.tail = run.catch(() => {});
    return run;
  }
  override async saveStudioEntity(
    table: StudioEntityTable,
    expected: { id: string } | null,
    replacement: { id: string },
    audit: Audit,
  ) {
    await this.ready;
    const operation = this.tail.then(async () => {
      const saved = await super.saveStudioEntity(
        table,
        expected,
        replacement,
        audit,
      );
      if (saved) await this.persist();
      return saved;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  override async replaceStarter(
    expected: Template,
    replacement: Template,
    audit: Audit,
  ) {
    await this.ready;
    const operation = this.tail.then(async () => {
      const changed = await super.replaceStarter(expected, replacement, audit);
      if (changed) await this.persist();
      return changed;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  override async removeSavedBlock(id: string) {
    await this.ready;
    const operation = this.tail.then(async () => {
      const removed = await super.removeSavedBlock(id);
      if (removed) await this.persist();
      return removed;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  override async put<T extends { id: string }>(t: EntityTable, e: T) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.put(t, e);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    await run;
  }
}
type ReportPageResult = { data: unknown[] | null; error: unknown };
async function readReportPages<T>(
  read: (from: number) => PromiseLike<ReportPageResult>,
) {
  const all: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from);
    if (error) throw error;
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < 500) return all;
  }
}
async function readReportBatches<T>(
  ids: string[] = [],
  read: (ids: string[], from: number) => PromiseLike<ReportPageResult>,
) {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 120) batches.push(ids.slice(i, i + 120));
  const all: T[] = [];
  for (let i = 0; i < batches.length; i += 3)
    for (const batch of await Promise.all(
      batches
        .slice(i, i + 3)
        .map((ids) => readReportPages<T>((from) => read(ids, from))),
    ))
      all.push(...batch);
  return all;
}
type HostedReportProposal = Omit<
  ReportProposal,
  "owner_id" | "owner_name" | "archived" | "expiry"
> & {
  sender: Proposal["sender"];
  owner: Proposal["owner"];
  created_by: string;
  archived_at: string | null;
  published_title: string | null;
  published_expiry: string | null;
  expiry: string | null;
};
export class SupabaseRepository implements Repository {
  async providerAction<T>(id: string) {
    const { data, error } = await this.db
      .from("provider_actions")
      .select("data")
      .eq("workspace_id", this.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new AppError(503, "QuickBooks billing storage is unavailable.");
    return (data?.data ?? null) as T | null;
  }
  async providerCredential<T>(id: string) {
    const { data, error } = await this.db
      .from("provider_credentials")
      .select("data")
      .eq("workspace_id", this.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new AppError(503, "Connection storage is unavailable");
    return (data?.data ?? null) as T | null;
  }
  async replaceProviderCredential<T extends { id: string }>(
    id: string,
    expected: T | null,
    replacement: T | null,
  ) {
    const { data, error } = await this.db.rpc("replace_provider_credential", {
      target_workspace: this.workspaceId,
      target_id: id,
      expected_data: expected,
      replacement_data: replacement,
    });
    if (
      error?.code === "23505" &&
      (replacement as { kind?: string } | null)?.kind === "stripe_connect"
    )
      throw new AppError(
        409,
        "This Stripe account is already linked to another workspace.",
      );
    if (error) throw new AppError(503, "Connection storage is unavailable");
    return data === true;
  }
  async reportNames() {
    const names = (table: "templates" | "clients", key: "name" | "company") =>
      readReportPages<{ id: string; name: string }>((from) =>
        this.db
          .from(table)
          .select("id,name:data->>" + key)
          .eq("workspace_id", this.workspaceId)
          .order("id")
          .range(from, from + 499),
      ).then((rows) => new Map(rows.map(({ id, name }) => [id, name])));
    const [templates, clients] = await Promise.all([
      names("templates", "name"),
      names("clients", "company"),
    ]);
    return { templates, clients };
  }
  async reportProposals() {
    const rows = await readReportPages<HostedReportProposal>((from) =>
      this.db
        .from("proposals")
        .select(
          [
            "id",
            "status",
            "created_at",
            "updated_at",
            "client_id",
            "client_name:state->client->>company",
            "template_id:state->>template_id",
            "currency:state->>currency",
            "sender:state->sender",
            "owner:state->owner",
            "created_by:state->>created_by",
            "archived_at:state->>archived_at",
            "sent_at:state->>sent_at",
            "first_viewed_at:state->>first_viewed_at",
            "client_signed_at:state->>client_signed_at",
            "completed_at:state->>completed_at",
            "expiry:state->>valid_until",
            "published_title:state->published_state->>title",
            "published_expiry:state->published_state->>valid_until",
            "billing_links:state->billing_links",
          ].join(","),
        )
        .eq("workspace_id", this.workspaceId)
        .eq("source", "native")
        .order("id")
        .range(from, from + 499),
    );
    return rows.map(
      ({
        sender,
        owner,
        created_by,
        archived_at,
        published_title,
        published_expiry,
        ...p
      }): ReportProposal => {
        const person = sender ?? owner;
        return {
          ...p,
          owner_id:
            person?.user_id ??
            (created_by?.startsWith("staff:") ? created_by.slice(6) : null),
          owner_name: person?.display_name ?? null,
          archived: !!archived_at || p.status === "archived",
          expiry: published_title !== null ? published_expiry : p.expiry,
          billing_links: p.billing_links ?? [],
        };
      },
    );
  }
  async reportFacts({
    sections,
    questions,
    values,
    billing,
  }: ReportFactRequest) {
    const [engagement, threadRows, versions, billingRows] = await Promise.all([
      readReportBatches<ReportEngagement>(sections, (ids, from) =>
        this.db
          .from("proposal_engagement_totals")
          .select("id,targets:data->targets")
          .eq("workspace_id", this.workspaceId)
          .in("id", ids)
          .order("id")
          .range(from, from + 499),
      ),
      readReportBatches<
        Omit<ReportQuestion, "answered"> & { first_reply: string | null }
      >(questions, (ids, from) =>
        this.db
          .from("proposal_questions")
          .select(
            "proposal_id,status,first_reply:data->replies->0->>id,asked_at:created_at,first_reply_at:data->replies->0->>created_at",
          )
          .eq("workspace_id", this.workspaceId)
          .in("proposal_id", ids)
          .order("id")
          .range(from, from + 499),
      ),
      readReportBatches<ReportVersion>(values, (ids, from) =>
        this.db
          .from("proposal_versions")
          .select("proposal_id,version_no,variables:data->variables_resolved")
          .eq("workspace_id", this.workspaceId)
          .eq("data->>frozen", "true")
          .in("proposal_id", ids)
          .order("id")
          .range(from, from + 499),
      ),
      readReportBatches<{ proposal_id: string }>(billing, (ids, from) =>
        this.db
          .from("jobs")
          .select("proposal_id")
          .eq("workspace_id", this.workspaceId)
          .in("proposal_id", ids)
          .eq("data->>kind", "billing")
          .neq("status", "done")
          .order("id")
          .range(from, from + 499),
      ),
    ]);
    return {
      engagement,
      versions,
      pendingBilling: billingRows.map((r) => r.proposal_id),
      questions: threadRows.map(({ first_reply, ...thread }) => ({
        ...thread,
        answered: !!first_reply,
      })),
    };
  }
  async reportPage(ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from("proposals")
      .select("state")
      .eq("workspace_id", this.workspaceId)
      .in("id", ids);
    if (error) throw error;
    const rows = new Map(
      data.map(({ state }) => [(state as Proposal).id, state as Proposal]),
    );
    return ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []));
  }
  private async questionRows(filters: { proposal?: string; open?: string[] }) {
    const rows: QuestionThread[] = [];
    for (let from = 0; ; from += 500) {
      let query = this.db
        .from("proposal_questions")
        .select("data")
        .eq("workspace_id", this.workspaceId);
      if (filters.proposal) query = query.eq("proposal_id", filters.proposal);
      if (filters.open)
        query = query.in("proposal_id", filters.open).eq("status", "open");
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      rows.push(...data.map((row) => row.data as QuestionThread));
      if (data.length < 500) return rows;
    }
  }
  questionThreads(id: string) {
    return this.questionRows({ proposal: id });
  }
  async questionCounts(ids: string[], user: string) {
    if (!ids.length) return {};
    return summarizeQuestions(await this.questionRows({ open: ids }), user);
  }
  async writeQuestion({
    thread,
    previous,
    proposalRevision,
    mail,
  }: QuestionWrite): Promise<QuestionWriteResult> {
    const { data, error } = await this.db.rpc("write_proposal_question", {
      p_workspace: this.workspaceId,
      p_previous: previous,
      p_proposal_revision: proposalRevision ?? null,
      p_thread: thread,
      p_mail: mail,
    });
    if (error?.code === "23505") return "stale";
    if (error) throw error;
    return data as QuestionWriteResult;
  }
  async claimQuestionMail(proposal?: string) {
    const { data, error } = await this.db
      .rpc("claim_proposal_question_mail", {
        p_workspace: this.workspaceId,
        p_proposal: proposal ?? null,
      })
      .maybeSingle();
    if (error) throw error;
    return data as QuestionDelivery | null;
  }
  async finishQuestionMail(mail: QuestionDelivery, next: string | null) {
    const { error } = await this.db
      .from("proposal_question_mail")
      .update({ available_at: next })
      .eq("workspace_id", this.workspaceId)
      .eq("id", mail.id)
      .eq("attempt", mail.attempt);
    if (error) throw error;
  }
  async engagementSummary(id: string) {
    const { data, error } = await this.db
      .from("proposal_engagement_totals")
      .select("data")
      .eq("workspace_id", this.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data?.data as EngagementAggregate) ?? null;
  }
  async engagementSession(proposal: string, id: string) {
    const { data, error } = await this.db
      .from("proposal_engagement")
      .select("data")
      .eq("workspace_id", this.workspaceId)
      .eq("proposal_id", proposal)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data?.data as EngagementSession) ?? null;
  }
  async engagementSessions(proposal: string) {
    const result: EngagementActivity[] = [];
    for (let n = 0; ; n += 500) {
      const { data, error } = await this.db
        .from("proposal_engagement")
        .select("data")
        .eq("workspace_id", this.workspaceId)
        .eq("proposal_id", proposal)
        .order("started_at", { ascending: false })
        .order("id")
        .range(n, n + 499);
      if (error) throw error;
      result.push(...data.map((r) => r.data as EngagementActivity));
      if (data.length < 500) return result;
    }
  }
  async saveEngagement(
    expected: number,
    session: EngagementSession,
    summary: EngagementAggregate,
  ): Promise<"saved" | "stale" | "limited"> {
    const { data, error } = await this.db.rpc("record_proposal_engagement", {
      p_workspace: this.workspaceId,
      p_expected: expected,
      p_session: session,
      p_summary: summary,
    });
    if (error) throw error;
    return data;
  }
  async pruneEngagement(before: string) {
    const { error } = await this.db
      .from("proposal_engagement")
      .delete()
      .eq("workspace_id", this.workspaceId)
      .lt("started_at", before);
    if (error) throw error;
  }
  async commitLinkedBlock(change: LinkedBlockCommit, audit: Audit) {
    const { data, error } = await this.db.rpc("save_linked_block", {
      p_workspace: this.workspaceId,
      p_change: change,
      p_event: audit,
    });
    if (error)
      throw new AppError(error.code === "40001" ? 409 : 400, error.message);
    return data === true;
  }
  constructor(
    public db: SupabaseClient,
    public readonly workspaceId = LOCAL_WORKSPACE_ID,
  ) {}
  async saveReassignments(documents: Proposal[], actor: Actor) {
    const { error } = await this.db.rpc("reassign_proposals", {
      target_workspace: this.workspaceId,
      actor_id: actor.actor.slice(6),
      documents,
    });
    if (error)
      throw new AppError(
        error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409,
        error.message,
      );
  }
  async saveEmailTemplate<T extends { id: string }>(template: T, audit: Audit) {
    const { error } = await this.db.rpc("save_email_template", {
      target_workspace: this.workspaceId,
      template,
      audit_event: audit,
    });
    if (error) throw error;
  }
  async emailLog<T>(proposalId: string) {
    const rows: T[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await this.db
        .from("email_log")
        .select("data")
        .eq("workspace_id", this.workspaceId)
        .eq("data->>proposal_id", proposalId)
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      rows.push(...data.map((row) => row.data as T));
      if (data.length < 500) return rows;
    }
  }
  async saveClientContact(client: Client) {
    const { data, error } = await this.db.rpc("save_client_contact", {
      target_workspace: this.workspaceId,
      contact: client,
    });
    if (error) throw error;
    return data as Client;
  }
  async saveClientAndProposals(client: Client, documents: Proposal[]) {
    const { data, error } = await this.db.rpc("save_client_and_proposals", {
      target_workspace: this.workspaceId,
      contact: client,
      documents: documents.map((p) => ({
        ...p,
        workspace_id: this.workspaceId,
      })),
    });
    if (error) {
      if (error.code === "40001")
        throw new AppError(
          409,
          "Client proposals changed; retry saving the client",
        );
      throw error;
    }
    return data as Client;
  }
  async linkClientStripe(
    id: string,
    expected: string | null,
    email: string,
    customer: string | null,
    actor: Actor,
  ) {
    if (!actor.actor.startsWith("staff:"))
      throw new AppError(403, "Staff authorization required");
    const { error } = await this.db.rpc("link_client_stripe", {
      target_workspace: this.workspaceId,
      target_client: id,
      expected_customer: expected,
      expected_email: email,
      customer,
      audit_event: {
        id: crypto.randomUUID(),
        ...actor,
        type: customer ? "client_stripe_linked" : "client_stripe_unlinked",
        created_at: new Date().toISOString(),
      },
    });
    if (error)
      throw new AppError(
        error.code === "40001" ? 409 : error.code === "P0002" ? 404 : 400,
        error.message,
      );
  }
  async deleteClient(id: string, actor: Actor) {
    if (!actor.actor.startsWith("staff:"))
      throw new AppError(403, "Staff authorization required");
    const { error } = await this.db.rpc("delete_unused_client", {
      target_workspace: this.workspaceId,
      target_client: id,
      audit_event: {
        id: crypto.randomUUID(),
        type: "client_deleted",
        ...actor,
        created_at: new Date().toISOString(),
      },
    });
    if (error)
      throw new AppError(
        error.code === "23503" ? 409 : error.code === "P0002" ? 404 : 400,
        error.code === "23503" &&
          error.message === "Has 1 proposals — archive them or keep the client"
          ? clientDeleteBlockedMessage(1)
          : error.message,
      );
  }
  async get(id: string) {
    const { data, error } = await this.db
      .from("proposals")
      .select("state")
      .eq("workspace_id", this.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data?.state as Proposal) ?? null;
  }
  async byToken(token: string) {
    const { data, error } = await this.db
      .from("proposals")
      .select("state")
      .eq("workspace_id", this.workspaceId)
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    return (data?.state as Proposal) ?? null;
  }
  async list(search?: string) {
    const all: Proposal[] = [];
    for (let from = 0; ; from += 500) {
      let query = this.db
        .from("proposals")
        .select("state")
        .eq("workspace_id", this.workspaceId)
        .order("id")
        .range(from, from + 499);
      if (search)
        query = query.textSearch("search_document", search, {
          type: "websearch",
          config: "english",
        });
      const { data, error } = await query;
      if (error) throw error;
      all.push(...data.map((x) => x.state as Proposal));
      if (data.length < 500) return all;
    }
  }
  async save(p: Proposal, expected: number) {
    const { error } = await this.db.rpc("save_proposal", {
      document: { ...p, workspace_id: this.workspaceId },
      expected_revision: expected,
    });
    if (error) {
      if (error.code === "40001" || error.code === "23505")
        throw new AppError(409, "Proposal changed; reload and try again");
      throw error;
    }
  }
  async entities<T>(table: EntityTable) {
    const all: T[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await this.db
        .from(table)
        .select("data")
        .eq("workspace_id", this.workspaceId)
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      all.push(...data.map((x) => x.data as T));
      if (data.length < 500) return all;
    }
  }
  async finishDocumentRefresh<T extends { id: string }>(
    document: T,
    attempt: string,
  ) {
    const { data, error } = await this.db
      .from("workspace_documents")
      .update({ data: document })
      .eq("workspace_id", this.workspaceId)
      .eq("id", document.id)
      .eq("data->>refresh_id", attempt)
      .select("id");
    if (error) throw error;
    return !!data?.length;
  }
  async saveStudioEntity(
    table: StudioEntityTable,
    expected: { id: string } | null,
    replacement: { id: string },
    audit: Audit,
  ) {
    const { data, error } = await this.db.rpc("save_studio_entity", {
      p_workspace: this.workspaceId,
      p_table: table,
      p_id: replacement.id,
      p_expected: expected,
      p_replacement: replacement,
      p_event: audit,
    });
    if (error) throw error;
    return data === true;
  }
  async replaceStarter(
    expected: Template,
    replacement: Template,
    audit: Audit,
  ) {
    const { data, error } = await this.db.rpc("replace_library_starter", {
      p_workspace: this.workspaceId,
      p_id: expected.id,
      p_expected: expected,
      p_replacement: replacement,
      p_event: audit,
    });
    if (error) throw error;
    return data === true;
  }
  async removeSavedBlock(id: string) {
    const { data, error } = await this.db
      .from("content_library")
      .delete()
      .eq("workspace_id", this.workspaceId)
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return !!data?.length;
  }
  async put<T extends { id: string }>(table: EntityTable, entity: T) {
    const { error } = await this.db
      .from(table)
      .upsert({ id: entity.id, workspace_id: this.workspaceId, data: entity });
    if (error) throw error;
  }
}
export function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Supabase credentials required");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function mutate(
  repo: Repository,
  id: string,
  fn: (p: Proposal) => void,
) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const p = await repo.get(id);
    if (!p) throw new AppError(404, "Proposal not found");
    const revision = p.revision;
    const before = JSON.stringify(p);
    fn(p);
    if (JSON.stringify(p) === before) return p;
    p.revision = revision + 1;
    p.updated_at = new Date().toISOString();
    try {
      await repo.save(p, revision);
      return p;
    } catch (e) {
      if (!(e instanceof AppError) || e.status !== 409 || attempt === 5)
        throw e;
    }
  }
  throw new Error("Unreachable");
}
