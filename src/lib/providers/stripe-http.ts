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
  ) {
    requireTestStripeKey(key);
  }
  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    return this.request<T>(path + "?" + new URLSearchParams(params), "GET");
  }
  async post<T>(
    path: string,
    params: Record<string, unknown>,
    key: string,
  ): Promise<T> {
    const id = sha256(this.repo.workspaceId + ":" + key)
      .slice(0, 32)
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    const fingerprint = sha256(canonical({ path, params }));
    const old = (
      await this.repo.entities<{
        id: string;
        fingerprint: string;
        response: T;
      }>("provider_actions")
    ).find((a) => a.id === id);
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
    requireTestStripeKey(this.key);
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
        ...(key ? { "Idempotency-Key": key } : {}),
        ...(params
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(params ? { body } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    check(
      response.ok,
      `Stripe request failed (${response.status}; ${data.error?.code ?? "provider_error"})`,
      502,
    );
    check(data.livemode !== true, "Live Stripe response refused", 503);
    return data as T;
  }
}
