import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
export interface Storage {
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array>;
}
export class LocalStorage implements Storage {
  constructor(private root: string) {}
  private path(path: string) {
    if (!/^[\w/-]+\.(pdf|png)$/.test(path) || path.includes(".."))
      throw new Error("Invalid storage path");
    return join(this.root, path);
  }
  async put(path: string, bytes: Uint8Array) {
    const file = this.path(path);
    await mkdir(dirname(file), { recursive: true });
    try {
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  async get(path: string) {
    return readFile(this.path(path));
  }
}
export class SupabaseStorage implements Storage {
  constructor(
    private db: SupabaseClient,
    private bucket = process.env.STORAGE_BUCKET ?? "proposal-files",
  ) {}
  async put(path: string, bytes: Uint8Array) {
    const { error } = await this.db.storage
      .from(this.bucket)
      .upload(path, bytes, {
        contentType: path.endsWith(".png") ? "image/png" : "application/pdf",
        upsert: false,
      });
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  }
  async get(path: string) {
    const { data, error } = await this.db.storage
      .from(this.bucket)
      .download(path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
}
