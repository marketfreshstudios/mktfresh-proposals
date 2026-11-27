import { validClientToken } from "./client-code";
import { pdfPreview } from "./pdf-preview";
import { StripeHttp } from "./providers/stripe-http";
import { StripeConnect, stripeConnectConfig } from "./providers/stripe-connect";
import { StripeProvider } from "./providers/stripe";
import { QboProvider } from "./providers/qbo";
import { LOCAL_WORKSPACE_ID } from "./workspace";
import { publicHostAllows } from "./workspace-host";
import { check } from "./model";
import { join } from "node:path";
import { LocalRepository, SupabaseRepository, supabase } from "./repository";
import { LocalStorage, SupabaseStorage } from "./storage";
import { ProposalService } from "./service";
import { MockMailer, ResendMailer, Worker } from "./jobs";
import { MockBillingProvider, UnconfiguredBillingProvider } from "./billing";
function createRuntime(
  workspaceId: string,
  account?: { id: string; mode: "test" | "live" },
) {
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
  const test = process.env.BILLING_MODE === "test";
  // The platform workspace bills on its own Stripe account; agencies bill on
  // their own accounts through Stripe Connect, in the same mode.
  const live = billingLive() && workspaceId === LOCAL_WORKSPACE_ID;
  // Every workspace connects its own QuickBooks company through the one
  // Intuit app: sandbox in test mode, production once billing is live.
  const qboConfigured =
    ((test && process.env.QBO_ENVIRONMENT === "sandbox") ||
      (billingLive() && process.env.QBO_ENVIRONMENT === "production")) &&
    process.env.QBO_CLIENT_ID &&
    process.env.QBO_CLIENT_SECRET &&
    Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY ?? "", "base64")
      .length === 32;
  const connectConfig =
    workspaceId !== LOCAL_WORKSPACE_ID ? stripeConnectConfig() : undefined;
  const stripeConnect = connectConfig
    ? new StripeConnect(repo, connectConfig)
    : undefined;
  const providers = {
    qbo: qboConfigured
      ? new QboProvider(repo, {
          clientId: process.env.QBO_CLIENT_ID!,
          clientSecret: process.env.QBO_CLIENT_SECRET ?? "",
          ...(local && workspaceId === LOCAL_WORKSPACE_ID
            ? {
                refreshToken: process.env.QBO_REFRESH_TOKEN,
                realm: process.env.QBO_REALM_ID,
              }
            : {}),
          redirectUri: process.env.QBO_REDIRECT_URI,
          environment: process.env.QBO_ENVIRONMENT ?? "",
          encryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
        })
      : local
        ? new MockBillingProvider("qbo")
        : new UnconfiguredBillingProvider("QuickBooks"),
    stripe:
      (test || live) &&
      workspaceId === LOCAL_WORKSPACE_ID &&
      process.env.STRIPE_SECRET_KEY
        ? new StripeProvider(
            new StripeHttp(
              process.env.STRIPE_SECRET_KEY,
              repo,
              fetch,
              undefined,
              undefined,
              live,
            ),
            repo,
            browserKey(process.env.STRIPE_PUBLISHABLE_KEY, undefined, live),
          )
        : account && stripeConnect
          ? new StripeProvider(
              stripeConnect.transport(account),
              repo,
              browserKey(
                process.env.STRIPE_CONNECT_PUBLISHABLE_KEY,
                account.id,
                account.mode === "live",
              ),
            )
          : local
            ? new MockBillingProvider("stripe")
            : new UnconfiguredBillingProvider("Stripe"),
  };
  const mailer = local ? new MockMailer() : new ResendMailer();
  return {
    mailer,
    repo,
    storage,
    stripeConnect,
    service: new ProposalService(
      repo,
      undefined,
      undefined,
      providers.stripe instanceof StripeProvider
        ? providers.stripe.api
        : undefined,
      async (p) =>
        (await pdfPreview(repo, storage, p, p.workspace_settings!)).layout,
    ),
    worker: new Worker(repo, storage, mailer, providers),
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
export async function resolveStripeAccount(base: Runtime): Promise<Runtime> {
  const account = await base.stripeConnect?.activeAccount();
  return account ? createRuntime(base.repo.workspaceId, account) : base;
}
// Token lookup returns only the tenant selector; all subsequent operations are scoped.
export async function publicRuntime(token: string, host?: string | null) {
  check(validClientToken(token), "Not found", 404);
  if (process.env.APP_MODE === "local") {
    const rt = runtime();
    check(await rt.repo.byToken(token), "Not found", 404);
    return rt;
  }
  const { data, error } = await supabase()
    .from("proposals")
    .select("workspace_id")
    .eq("token", token)
    .maybeSingle();
  check(!error && data, "Not found", 404);
  check(await publicHostAllows(host, data.workspace_id), "Not found", 404);
  return resolveStripeAccount(runtime(data.workspace_id));
}
export async function allRuntimes() {
  if (process.env.APP_MODE === "local") return [runtime()];
  const { data, error } = await supabase().from("workspaces").select("id");
  if (error) throw error;
  const results = await Promise.allSettled(
    data.map((w) => resolveStripeAccount(runtime(w.id))),
  );
  return results.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    console.error("Could not load a workspace billing connection.");
    return [];
  });
}

/** BILLING_MODE=live: the platform workspace bills for real. */
export const billingLive = () => process.env.BILLING_MODE === "live";

/** Stripe's publishable key for card fields on the proposal. It must match
 * the mode like the secret key; anything else hides the card form. */
function browserKey(key: string | undefined, account?: string, live = false) {
  return key &&
    (live ? /^pk_live_[A-Za-z0-9]+$/ : /^pk_test_[A-Za-z0-9]+$/).test(key)
    ? { publishableKey: key, ...(account ? { account } : {}) }
    : undefined;
}
