import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface PurgeDatabase {
  query(sql: string, parameters?: any[]): Promise<{ rows: any[] }>;
}
export interface PurgeStorage {
  list(
    prefix: string,
    offset: number,
  ): Promise<{ name: string; id: string | null }[]>;
  remove(paths: string[]): Promise<void>;
}
const children = [
  "proposal_versions",
  "jobs",
  "billing_links",
  "files",
  "signers",
  "events",
] as const;
const guards = [
  ["proposal_versions", "frozen_versions"],
  ["events", "immutable_events"],
  ["files", "immutable_files"],
  ["signers", "immutable_signers"],
] as const;
export function validatePurgeProject(apiUrl: string, databaseUrl: string) {
  const api = new URL(apiUrl),
    db = new URL(databaseUrl),
    local = ["127.0.0.1", "localhost", "[::1]"];
  if (local.includes(api.hostname) && local.includes(db.hostname)) return;
  const ref = api.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  const pooler =
    db.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(db.username) === `postgres.${ref}`;
  if (
    api.protocol !== "https:" ||
    !ref ||
    (db.hostname !== `db.${ref}.supabase.co` && !pooler)
  )
    throw new Error(
      "SUPABASE_DB_URL must target the same project as SUPABASE_URL",
    );
  if (!["postgres:", "postgresql:"].includes(db.protocol))
    throw new Error("PostgreSQL connection URL required");
}
export async function purgeTestProposals(
  db: PurgeDatabase,
  storage: PurgeStorage,
  workspace: string,
  confirm = false,
) {
  z.uuid().parse(workspace);
  await db.query("begin");
  try {
    if (confirm) {
      // Locks exclude concurrent writers while evidence guards are temporarily
      // disabled in this transaction. Rollback restores guards on every failure.
      await db.query(
        "lock table public.proposals,public.proposal_versions,public.jobs,public.billing_links,public.files,public.signers,public.events in share row exclusive mode",
      );
    }
    const ids = (
      await db.query(
        "select id from public.proposals where workspace_id=$1 and source='native' order by id",
        [workspace],
      )
    ).rows.map((r) => r.id as string);
    const counts: Record<string, number> = { proposals: ids.length };
    for (const table of children)
      counts[table] = Number(
        (
          await db.query(
            `select count(*)::integer as n from public.${table} where workspace_id=$1 and proposal_id=any($2::uuid[])`,
            [workspace, ids],
          )
        ).rows[0].n,
      );
    const paths = new Set<string>();
    for (const { storage_path } of (
      await db.query(
        "select storage_path from public.files where workspace_id=$1 and proposal_id=any($2::uuid[])",
        [workspace, ids],
      )
    ).rows) {
      if (
        !ids.some(
          (id) =>
            storage_path.startsWith(id + "/") ||
            storage_path.startsWith(workspace + "/" + id + "/"),
        )
      )
        throw new Error(
          "Unexpected stored file path; refusing to remove files outside the test proposals",
        );
      paths.add(storage_path);
    }
    async function collect(prefix: string, depth = 0) {
      if (depth > 12) throw new Error("Unexpected storage folder depth");
      for (let offset = 0; ; offset += 1000) {
        const entries = await storage.list(prefix, offset);
        for (const entry of entries) {
          if (
            !entry.name ||
            /[\\/]/.test(entry.name) ||
            [".", ".."].includes(entry.name)
          )
            throw new Error("Invalid storage object name");
          const path = prefix + "/" + entry.name;
          if (entry.id) paths.add(path);
          else await collect(path, depth + 1);
        }
        if (entries.length < 1000) break;
      }
    }
    for (const id of ids) {
      await collect(id);
      await collect(workspace + "/" + id);
    }
    const files = [...paths].sort();
    counts.stored_files = files.length;
    if (
      files.length &&
      (
        await db.query(
          "select storage_path from public.files where storage_path=any($1::text[]) and not(workspace_id=$2 and proposal_id=any($3::uuid[]))",
          [files, workspace, ids],
        )
      ).rows.length
    )
      throw new Error(
        "A file is referenced by a preserved proposal; purge refused",
      );
    if (!confirm) {
      await db.query("rollback");
      return { dry_run: true, workspace_id: workspace, counts };
    }
    for (const [table, trigger] of guards)
      await db.query(`alter table public.${table} disable trigger ${trigger}`);
    // Storage deletion is idempotent. Keep the rows until all object batches
    // succeed, so a failed run can be retried without losing the object manifest.
    for (let n = 0; n < files.length; n += 100)
      await storage.remove(files.slice(n, n + 100));
    for (const table of children)
      await db.query(
        `delete from public.${table} where workspace_id=$1 and proposal_id=any($2::uuid[])`,
        [workspace, ids],
      );
    await db.query(
      "delete from public.proposals where workspace_id=$1 and source='native' and id=any($2::uuid[])",
      [workspace, ids],
    );
    for (const [table, trigger] of guards)
      await db.query(`alter table public.${table} enable trigger ${trigger}`);
    await db.query(
      "insert into public.workspace_events(id,workspace_id,data) values($1,$2,$3::jsonb)",
      [
        randomUUID(),
        workspace,
        JSON.stringify({
          type: "test_proposals_purged",
          actor: "system:purge-test-proposals",
          created_at: new Date().toISOString(),
          counts,
          excluded_source: "proposify_import",
        }),
      ],
    );
    await db.query("commit");
    return { dry_run: false, workspace_id: workspace, counts };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    console.log(
      "Usage: node --env-file=.env.local --import tsx scripts/purge-test-proposals.ts --workspace <uuid> [--confirm]\nDefault: read-only dry-run counts. Imported Proposify records are excluded. Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL (database-owner connection to the same project). Stop app workers before a confirmed purge.",
    );
    return;
  }
  const index = args.indexOf("--workspace"),
    workspace = index >= 0 ? args[index + 1] : undefined;
  if (!workspace) throw new Error("Explicit --workspace <uuid> required");
  z.uuid().parse(workspace);
  const remaining = args.filter((_, n) => n !== index && n !== index + 1);
  if (remaining.some((a) => a !== "--confirm"))
    throw new Error("Unknown argument");
  const apiUrl = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl = process.env.SUPABASE_DB_URL;
  if (!apiUrl || !key || !databaseUrl)
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL required",
    );
  validatePurgeProject(apiUrl, databaseUrl);
  const db = new Client({ connectionString: databaseUrl }),
    bucket = createClient(apiUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).storage.from(process.env.STORAGE_BUCKET ?? "proposal-files");
  await db.connect();
  try {
    console.log(
      JSON.stringify(
        await purgeTestProposals(
          db,
          {
            async list(prefix, offset) {
              const { data, error } = await bucket.list(prefix, {
                limit: 1000,
                offset,
                sortBy: { column: "name", order: "asc" },
              });
              if (error) throw error;
              return data.map((f) => ({ name: f.name, id: f.id }));
            },
            async remove(paths) {
              const { error } = await bucket.remove(paths);
              if (error) throw error;
            },
          },
          workspace,
          args.includes("--confirm"),
        ),
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Purge failed");
    process.exitCode = 1;
  });
