import { stripeAccountHash } from "./providers/stripe-connect";
import { supabase } from "./repository";
import { resolveStripeAccount, runtime } from "./runtime";

// Resolve the current connection for each request, including on other instances.
export async function workspaceRuntime(workspaceId?: string) {
  const base = runtime(workspaceId);
  return base.stripeConnect ? resolveStripeAccount(base) : base;
}

export async function stripeWebhookWorkspace(account: string) {
  if (process.env.APP_MODE === "local") return undefined;
  const { data, error } = await supabase()
    .from("provider_credentials")
    .select("workspace_id")
    .eq("data->>kind", "stripe_connect")
    .eq("data->>account_hash", stripeAccountHash(account))
    .maybeSingle();
  if (error) throw new Error("Stripe account routing is unavailable.");
  return data?.workspace_id as string | undefined;
}
