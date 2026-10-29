/** Read-only Stripe acceptance gate. Reads only the explicitly selected repo .env.local. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { parseEnv } from "node:util";
import {
  StripeHttp,
  requireTestStripeKey,
  STRIPE_VERSION,
} from "../src/lib/providers/stripe-http";
import { LocalRepository } from "../src/lib/repository";
import { syncStripeCatalog, resolveLookup } from "../src/lib/catalog";
import type { Item } from "../src/lib/model";
const envPath = resolve(process.argv[2] ?? ".env.local");
if (basename(envPath) !== ".env.local")
  throw new Error("Use only the repository .env.local file");
const config = parseEnv(await readFile(envPath, "utf8"));
const key = config.STRIPE_SECRET_KEY ?? "";
requireTestStripeKey(key); // Never fall back to any shell or CLI credentials.
process.env.BILLING_MODE = "test";
const required = ["hosted-standard-100", "oiot-monthly-175", "storage-30gb-60"];
const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  key_check: "Passed: test-mode prefix (value withheld)",
  billing_mode: "test",
  api_version: STRIPE_VERSION,
  required_lookup_keys: required,
  requests: [],
  writes_to_stripe: 0,
};
const errors: unknown[] = [];
const repo = new LocalRepository(".data/stripe-review");
const api = new StripeHttp(key, repo, async (input, init) => {
  requireTestStripeKey(key);
  if (init?.method !== "GET")
    throw new Error("Catalogue gate refuses all Stripe writes");
  const response = await fetch(input, init);
  const body = await response.clone().json();
  (report.requests as unknown[]).push({
    path: new URL(String(input)).pathname,
    status: response.status,
  });
  if (
    body.livemode === true ||
    body.data?.some((v: { livemode?: boolean }) => v.livemode === true)
  )
    throw new Error("Live response refused");
  if (!response.ok) {
    const message = String(body.error?.message ?? "").replace(
      /(?:sk|rk)_(?:test|live)_[A-Za-z0-9*]+/g,
      "[REDACTED KEY]",
    );
    errors.push({
      status: response.status,
      code: body.error?.code,
      type: body.error?.type,
      message,
    });
  }
  return response;
});
try {
  report.sync = await syncStripeCatalog(repo, api);
  const items = await repo.entities<Item>("pricing_items");
  report.catalogue = items.map((i) => ({
    name: i.name,
    lookup_key: i.stripe_lookup_key,
    amount: i.amount,
    interval: i.interval,
    legacy: i.legacy,
    active: i.active,
  }));
  const missing = required.filter(
    (key) =>
      !items.some((i) => i.stripe_lookup_key === key && i.active && !i.legacy),
  );
  report.missing_lookup_keys = missing;
  report.legacy_inactive = items
    .filter((i) => i.legacy)
    .every((i) => !i.active);
  if (missing.length) {
    report.result =
      "STOP: required lookup keys missing or inactive; no customers, subscriptions or catalogue prices created";
    process.exitCode = 2;
  } else {
    for (const lookup of required) await resolveLookup(api, lookup);
    report.result =
      "Catalogue gate passed; subsequent provider scenarios may proceed";
  }
} catch (e) {
  report.result =
    "Catalogue gate failed; subsequent provider scenarios not run";
  report.failure = e instanceof Error ? e.message : "Unknown failure";
  process.exitCode = 1;
}
report.permission_errors = errors;
await mkdir(".data/stripe-review", { recursive: true });
await writeFile(
  ".data/stripe-review/catalogue-check.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));
