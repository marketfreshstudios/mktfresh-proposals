import { stripeTestDashboard } from "../stripe-connect-status";
import { check } from "../model";
import type { StripeTransport } from "../catalog";
import { canonical, sha256 } from "../content";
import type { Repository } from "../repository";
export const STRIPE_VERSION = "2024-06-20";
export function requireTestStripeKey(key: string) {
  check(
    /^(sk_test_|rk_test_)[A-Za-z0-9]+$/.test(key),
    "Stripe test-mode key required; live keys are refused",
    503,
  );
}
/** The key must match the mode: live keys only in live mode, and the
 * other way round, so test and live can never be mixed. */
export function requireStripeKey(key: string, live: boolean) {
  if (!live) return requireTestStripeKey(key);
  check(
    /^(sk_live_|rk_live_)[A-Za-z0-9]+$/.test(key),
    "Stripe live-mode key required while billing is live",
    503,
  );
}
function form(value: unknown, path: string, result: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value))
    value.forEach((v, i) => form(v, `${path}[${i}]`, result));
  else if (typeof value === "object")
    Object.entries(value).forEach(([k, v]) =>
      form(v, path ? `${path}[${k}]` : k, result),
    );
  else result.append(path, String(value));
}
export class StripeHttp implements StripeTransport {
  constructor(
    private key: string,
    private repo: Repository,
    private fetcher: typeof fetch = fetch,
    private account?: string,
    private assertConnected?: () => Promise<void>,
    /** The platform workspace's own account only, when BILLING_MODE is live. */
    readonly livemode = false,
  ) {
    requireStripeKey(key, livemode);
    check(
      !account || /^acct_[a-zA-Z0-9]+$/.test(account),
      "Invalid Stripe account.",
    );
  }
  get accountId() {
    return this.account;
  }
  get dashboardUrl() {
    if (this.livemode) return "https://dashboard.stripe.com";
    return this.account
      ? `https://dashboard.stripe.com/${this.account}/test`
      : stripeTestDashboard;
  }
  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    return this.request<T>(path + "?" + new URLSearchParams(params), "GET");
  }
  async post<T>(
    path: string,
    params: Record<string, unknown>,
    key: string,
  ): Promise<T> {
    await this.assertConnected?.();
    // Live actions never reuse a test-mode response under the same key.
    const id = sha256(
      (this.livemode ? "live:" : "") +
        this.repo.workspaceId +
        ":" +
        (this.account ? this.account + ":" : "") +
        key,
    )
      .slice(0, 32)
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    const fingerprint = sha256(canonical({ path, params }));
    const old = await this.repo.providerAction<{
      id: string;
      fingerprint: string;
      response: T;
    }>(id);
    if (old) {
      check(
        old.fingerprint === fingerprint,
        "Provider action changed under the same idempotency key",
      );
      return old.response;
    }
    const response = await this.request<T>(path, "POST", params, key);
    await this.repo.put("provider_actions", { id, fingerprint, response });
    return response;
  }
  private async request<T>(
    path: string,
    method: string,
    params?: Record<string, unknown>,
    key?: string,
  ): Promise<T> {
    requireStripeKey(this.key, this.livemode);
    await this.assertConnected?.();
    check(
      /^\/v1\/[a-z_]+(?:\/[A-Za-z0-9_]+)*(?:\?.*)?$/.test(path),
      "Invalid Stripe path",
    );
    const body = new URLSearchParams();
    if (params) form(params, "", body);
    const response = await this.fetcher("https://api.stripe.com" + path, {
      method,
      headers: {
        Authorization: "Bearer " + this.key,
        "Stripe-Version": STRIPE_VERSION,
        ...(this.account ? { "Stripe-Account": this.account } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
        ...(params
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(params ? { body } : {}),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const data = await response.json();
    check(
      response.ok,
      `Stripe request failed (${response.status}; ${data.error?.code ?? "provider_error"})`,
      502,
    );
    check(
      data.livemode === undefined || data.livemode === this.livemode,
      this.livemode
        ? "Test-mode Stripe response refused while billing is live"
        : "Live Stripe response refused",
      503,
    );
    return data as T;
  }
}
