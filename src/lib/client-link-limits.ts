import { createHmac } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { supabase } from "./repository";
export type LimitKind = "lookup" | "password";
export interface LinkLimitStore {
  check(kind: LimitKind, hash: string, charge: boolean): Promise<number>;
}
export function linkLimitHash(kind: LimitKind, value: string, salt: string) {
  return createHmac("sha256", salt)
    .update(`client-link:${kind}\0${value}`)
    .digest("hex");
}
/** File-backed local/test equivalent. Production always uses atomic Postgres counters. */
export class LocalLinkLimitStore implements LinkLimitStore {
  constructor(
    private dir: string,
    private clock = () => Date.now(),
  ) {}
  async check(kind: LimitKind, hash: string, charge: boolean) {
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, "client-link-limits.json"),
      lock = file + ".lock";
    let handle;
    for (let n = 0; n < 200; n++) {
      try {
        handle = await open(lock, "wx");
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const age = Date.now() - (await stat(lock).catch(() => null))?.mtimeMs!;
        if (age > 30000) await rm(lock, { force: true });
        await new Promise((r) => setTimeout(r, 10));
      }
    }
    if (!handle) throw new Error("Limit store busy");
    try {
      const now = this.clock(),
        seconds = kind === "lookup" ? 600 : 900,
        cap = kind === "lookup" ? 30 : 10,
        start = Math.floor(now / (seconds * 1000)) * seconds * 1000;
      const rows: Record<string, { n: number; end: number }> = JSON.parse(
        await readFile(file, "utf8").catch((e) => {
          if (e.code === "ENOENT") return "{}";
          throw e;
        }),
      );
      const key = `${kind}:${hash}:${start}`;
      if (charge) {
        rows[key] = {
          n: Math.min((rows[key]?.n ?? 0) + 1, cap + 1),
          end: start + seconds * 1000,
        };
        for (const [k, row] of Object.entries(rows))
          if (row.end < now - 86400000) delete rows[k];
        const temp = file + ".tmp";
        await writeFile(temp, JSON.stringify(rows));
        await rename(temp, file);
      }
      return (rows[key]?.n ?? 0) >= (charge ? cap + 1 : cap)
        ? Math.max(1, Math.ceil((start + seconds * 1000 - now) / 1000))
        : 0;
    } finally {
      await handle.close();
      await rm(lock, { force: true });
    }
  }
}
export class SupabaseLinkLimitStore implements LinkLimitStore {
  async check(kind: LimitKind, hash: string, charge: boolean) {
    const { data, error } = await supabase().rpc("client_link_limit", {
      bucket_kind: kind,
      bucket_hash: hash,
      charge,
    });
    if (error) throw error;
    return Number(data);
  }
}
export async function limitClientLink(
  req: Request,
  token: string,
  run: () => Promise<Response>,
  resolved: () => boolean,
  options?: { store: LinkLimitStore; salt: string; ip: string },
) {
  try {
    const local =
      process.env.APP_MODE === "local" &&
      process.env.NODE_ENV !== "production" &&
      !process.env.VERCEL;
    const salt =
      options?.salt ??
      (local
        ? "local-development-only-link-limits-salt"
        : process.env.INTEGRATION_ENCRYPTION_KEY);
    if (!salt || salt.length < 32)
      throw new Error(
        "Link protection requires the integration encryption key",
      );
    const store =
      options?.store ??
      (local
        ? new LocalLinkLimitStore(process.env.DATA_DIR ?? ".data")
        : new SupabaseLinkLimitStore());
    // Vercel overwrites this header. Never trust the caller-supplied X-Forwarded-For.
    const ip =
      options?.ip ??
      (process.env.VERCEL
        ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
        : local
          ? (req.headers.get("x-forwarded-for") ?? "local")
          : "unknown") ??
      "unknown";
    const lookup = linkLimitHash("lookup", ip, salt),
      password = linkLimitHash("password", token, salt);
    const reject = (retry: number) =>
      Response.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retry),
          },
        },
      );
    let retry = await store.check("lookup", lookup, false);
    if (retry) return reject(retry);
    const attempted = !!req.headers.get("x-proposal-password");
    if (attempted) {
      retry = await store.check("password", password, false);
      if (retry) return reject(retry);
    }
    const response = await run();
    if (response.status === 404 && !resolved()) {
      retry = await store.check("lookup", lookup, true);
      if (retry) return reject(retry);
    }
    if (response.status === 401 && resolved() && attempted) {
      retry = await store.check("password", password, true);
      if (retry) return reject(retry);
    }
    return response;
  } catch {
    return Response.json(
      { error: "Link protection is unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
