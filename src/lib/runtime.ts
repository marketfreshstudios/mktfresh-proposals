import { LOCAL_WORKSPACE_ID } from "./workspace";
import { check } from "./model";
import { join } from "node:path";
import { LocalRepository, SupabaseRepository, supabase } from "./repository";
import { LocalStorage, SupabaseStorage } from "./storage";
import { ProposalService } from "./service";
import { MockMailer, ResendMailer, Worker } from "./jobs";
import { MockBillingProvider, UnconfiguredBillingProvider } from "./billing";
function createRuntime(workspaceId: string) {
  const local = process.env.APP_MODE === "local";
  if (local && (process.env.NODE_ENV === "production" || process.env.VERCEL))
    throw new Error("Local mode is disabled in production");
  const dir = process.env.DATA_DIR ?? ".data";
  const db = local ? null : supabase();
  const repo = db
      ? new SupabaseRepository(db, workspaceId)
      : new LocalRepository(
          workspaceId === LOCAL_WORKSPACE_ID
            ? dir
            : join(dir, "workspaces", workspaceId),
          workspaceId,
        ),
    storage = db
      ? new SupabaseStorage(db)
      : new LocalStorage(join(dir, "files"));
  const providers = {
    qbo: local
      ? new MockBillingProvider("qbo")
      : new UnconfiguredBillingProvider("QuickBooks"),
    stripe: local
      ? new MockBillingProvider("stripe")
      : new UnconfiguredBillingProvider("Stripe"),
  };
  return {
    repo,
    storage,
    service: new ProposalService(repo),
    worker: new Worker(
      repo,
      storage,
      local ? new MockMailer() : new ResendMailer(),
      providers,
    ),
  };
}
type Runtime = ReturnType<typeof createRuntime>;
const shared = globalThis as typeof globalThis & {
  workspaceRuntimes?: Map<string, Runtime>;
};
export function runtime(workspaceId = LOCAL_WORKSPACE_ID): Runtime {
  check(/^[0-9a-f-]{36}$/i.test(workspaceId), "Invalid workspace");
  const cache = (shared.workspaceRuntimes ??= new Map<string, Runtime>());
  if (!cache.has(workspaceId))
    cache.set(workspaceId, createRuntime(workspaceId));
  return cache.get(workspaceId)!;
}
// Token lookup returns only the tenant selector; all subsequent operations are scoped.
export async function publicRuntime(token: string) {
  check(/^[A-Za-z0-9_-]{43}$/.test(token), "Not found", 404);
  if (process.env.APP_MODE === "local") return runtime();
  const { data, error } = await supabase()
    .from("proposals")
    .select("workspace_id")
    .eq("token", token)
    .maybeSingle();
  check(!error && data, "Not found", 404);
  return runtime(data.workspace_id);
}
export async function allRuntimes() {
  if (process.env.APP_MODE === "local") return [runtime()];
  const { data, error } = await supabase().from("workspaces").select("id");
  if (error) throw error;
  return data.map((w) => runtime(w.id));
}
