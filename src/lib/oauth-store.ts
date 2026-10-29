import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
export type OAuthRecord = {
  id: string;
  workspace_id: string;
  kind: "client" | "code" | "grant" | "token";
  hash: string;
  data: Record<string, any>;
};
export interface OAuthStore {
  find(hash: string, refresh?: boolean): Promise<OAuthRecord | null>;
  get(id: string): Promise<OAuthRecord | null>;
  put(record: OAuthRecord): Promise<void>;
  consume(id: string): Promise<boolean>;
  list(workspace: string): Promise<OAuthRecord[]>;
  touch(id: string, time: string): Promise<void>;
}
export class MemoryOAuthStore implements OAuthStore {
  records = new Map<string, OAuthRecord>();
  async find(hash: string, refresh = false) {
    return structuredClone(
      [...this.records.values()].find(
        (r) => (refresh ? r.data.refresh_hash : r.hash) === hash,
      ) ?? null,
    );
  }
  async get(id: string) {
    return structuredClone(this.records.get(id) ?? null);
  }
  async put(record: OAuthRecord) {
    this.records.set(record.id, structuredClone(record));
  }
  async consume(id: string) {
    const r = this.records.get(id);
    if (!r || r.data.used) return false;
    r.data.used = true;
    return true;
  }
  async touch(id: string, time: string) {
    const r = this.records.get(id);
    if (r) r.data.last_used = time;
  }
  async list(workspace: string) {
    return structuredClone(
      [...this.records.values()].filter((r) => r.workspace_id === workspace),
    );
  }
}
export class LocalOAuthStore extends MemoryOAuthStore {
  private ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {
    super();
    this.ready = this.load();
  }
  private async load() {
    try {
      this.records = new Map(
        JSON.parse(await readFile(join(this.directory, "oauth.json"), "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  private async persist() {
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      join(this.directory, "oauth.tmp"),
      JSON.stringify([...this.records]),
      { mode: 0o600 },
    );
    await rename(
      join(this.directory, "oauth.tmp"),
      join(this.directory, "oauth.json"),
    );
  }
  override async find(h: string, r = false) {
    await this.ready;
    return super.find(h, r);
  }
  override async get(id: string) {
    await this.ready;
    return super.get(id);
  }
  override async list(w: string) {
    await this.ready;
    return super.list(w);
  }
  override async put(r: OAuthRecord) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.put(r);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    await run;
  }
  override async touch(id: string, time: string) {
    await this.ready;
    const run = this.tail.then(async () => {
      await super.touch(id, time);
      await this.persist();
    });
    this.tail = run.catch(() => {});
    await run;
  }
  override async consume(id: string) {
    await this.ready;
    const run = this.tail.then(async () => {
      const used = await super.consume(id);
      await this.persist();
      return used;
    });
    this.tail = run.catch(() => {});
    return run;
  }
}
export class SupabaseOAuthStore implements OAuthStore {
  constructor(private db: SupabaseClient) {}
  async find(hash: string, refresh = false) {
    const { data, error } = await this.db
      .from("oauth_records")
      .select("*")
      .eq(refresh ? "data->>refresh_hash" : "hash", hash)
      .maybeSingle();
    if (error) throw error;
    return data as OAuthRecord | null;
  }
  async get(id: string) {
    const { data, error } = await this.db
      .from("oauth_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as OAuthRecord | null;
  }
  async put(record: OAuthRecord) {
    const { error } = await this.db.from("oauth_records").upsert(record);
    if (error) throw error;
  }
  async consume(id: string) {
    const { data, error } = await this.db.rpc("consume_oauth_record", {
      record_id: id,
    });
    if (error) throw error;
    return data === true;
  }
  async touch(id: string, time: string) {
    const { error } = await this.db.rpc("touch_oauth_grant", {
      record_id: id,
      used_at: time,
    });
    if (error) throw error;
  }
  async list(workspace: string) {
    const { data, error } = await this.db
      .from("oauth_records")
      .select("*")
      .eq("workspace_id", workspace)
      .eq("kind", "grant");
    if (error) throw error;
    return data as OAuthRecord[];
  }
}
