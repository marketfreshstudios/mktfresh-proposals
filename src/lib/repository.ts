import type { EngagementAggregate, EngagementSession } from "./engagement";
import { isDeepStrictEqual } from "node:util";
import { sameClientContact, unsignedClientProposal } from "./clients";
import { LOCAL_WORKSPACE_ID } from "./workspace";
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
export type EntityTable =
  | "email_templates"
  | "email_log"
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
  engagementSummary(id: string): Promise<EngagementAggregate | null>;
  engagementSession(
    proposal: string,
    id: string,
  ): Promise<EngagementSession | null>;
  engagementSessions(proposal: string): Promise<EngagementSession[]>;
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
  put<T extends { id: string }>(table: EntityTable, entity: T): Promise<void>;
}
export class MemoryRepository implements Repository {
  constructor(public readonly workspaceId = LOCAL_WORKSPACE_ID) {}
  rows = new Map<string, Proposal>();
  catalog = new Map<EntityTable, Map<string, unknown>>();
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
    return (await this.entities<EngagementSession>("proposal_engagement"))
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
    if (count)
      throw new AppError(
        409,
        `Has ${count} proposals — archive them or keep the client`,
      );
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
      if (count)
        throw new AppError(
          409,
          `Has ${count} proposals — archive them or keep the client`,
        );
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
export class SupabaseRepository implements Repository {
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
    const result: EngagementSession[] = [];
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
      result.push(...data.map((r) => r.data as EngagementSession));
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
        error.message,
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
