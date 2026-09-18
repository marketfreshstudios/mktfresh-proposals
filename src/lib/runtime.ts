import { join } from "node:path";
import { LocalRepository, SupabaseRepository, supabase } from "./repository";
import { LocalStorage, SupabaseStorage } from "./storage";
import { ProposalService } from "./service";
import { MockMailer, ResendMailer, Worker } from "./jobs";
import { MockBillingProvider, UnconfiguredBillingProvider } from "./billing";
function createRuntime() {
  const local = process.env.APP_MODE === "local";
  if (local && (process.env.NODE_ENV === "production" || process.env.VERCEL))
    throw new Error("Local mode is disabled in production");
  const dir = process.env.DATA_DIR ?? ".data";
  const db = local ? null : supabase();
  const repo = db ? new SupabaseRepository(db) : new LocalRepository(dir),
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
      local && !process.env.RESEND_API_KEY
        ? new MockMailer()
        : new ResendMailer(),
      providers,
    ),
  };
}
type Runtime = ReturnType<typeof createRuntime>;
const shared = globalThis as typeof globalThis & { proposalRuntime?: Runtime };
export function runtime() {
  return (shared.proposalRuntime ??= createRuntime());
}
