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
  | "provider_actions";
export interface Repository {
  readonly workspaceId: string;
  saveEmailTemplate<T extends { id: string }>(
    template: T,
    audit: Audit,
  ): Promise<void>;
  emailLog<T>(proposalId: string): Promise<T[]>;
  saveClientContact(client: Client): Promise<Client>;
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
  constructor(
    public db: SupabaseClient,
    public readonly workspaceId = LOCAL_WORKSPACE_ID,
  ) {}
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
