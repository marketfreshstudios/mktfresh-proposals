import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
import { MemoryRepository } from "../src/lib/repository";
import { StripeHttp, requireStripeKey } from "../src/lib/providers/stripe-http";
import { verifyStripeWebhook } from "../src/lib/providers/webhook";
import { QboConnection } from "../src/lib/providers/qbo-connection";
import { liveMode } from "../src/lib/catalog";

it("Stripe keys must match the billing mode: never test in live or live in test", () => {
  expect(() => requireStripeKey("sk_test_abc", false)).not.toThrow();
  expect(() => requireStripeKey("sk_live_abc", false)).toThrow();
  expect(() => requireStripeKey("rk_live_abc", true)).not.toThrow();
  expect(() => requireStripeKey("sk_test_abc", true)).toThrow(
    "Stripe live-mode key required",
  );
  expect(
    () =>
      new StripeHttp(
        "sk_test_abc",
        new MemoryRepository(),
        fetch,
        undefined,
        undefined,
        true,
      ),
  ).toThrow();
});

it("a live transport refuses test objects and keeps live idempotency apart from test", async () => {
  const repo = new MemoryRepository();
  const reply = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  const testObject = reply({ id: "cus_1", livemode: false });
  const live = new StripeHttp(
    "rk_live_abc",
    repo,
    testObject as never,
    undefined,
    undefined,
    true,
  );
  expect(liveMode(live)).toBe(true);
  expect(live.dashboardUrl).toBe("https://dashboard.stripe.com");
  await expect(live.get("/v1/customers/cus_1")).rejects.toThrow(
    "Test-mode Stripe response refused while billing is live",
  );
  const liveObject = reply({ id: "cus_1", livemode: true });
  const ok = new StripeHttp(
    "rk_live_abc",
    repo,
    liveObject as never,
    undefined,
    undefined,
    true,
  );
  await expect(ok.get("/v1/customers/cus_1")).resolves.toMatchObject({
    id: "cus_1",
  });
  // A test-mode response cached under a key is never replayed in live mode.
  const testPost = reply({ id: "cus_t", livemode: false });
  await new StripeHttp("sk_test_abc", repo, testPost as never).post(
    "/v1/customers",
    {},
    "same-key",
  );
  const livePost = reply({ id: "cus_l", livemode: true });
  const created = await new StripeHttp(
    "rk_live_abc",
    repo,
    livePost as never,
    undefined,
    undefined,
    true,
  ).post<{ id: string }>("/v1/customers", {}, "same-key");
  expect(created.id).toBe("cus_l");
  expect(livePost).toHaveBeenCalledTimes(1);
});

it("webhooks are accepted only in the matching mode", () => {
  const secret = "whsec_test";
  const sign = (livemode: boolean) => {
    const raw = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      livemode,
      data: { object: { id: "cs_1" } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
    return [raw, `t=${t},v1=${v1}`] as const;
  };
  expect(() => verifyStripeWebhook(...sign(false), secret)).not.toThrow();
  expect(() => verifyStripeWebhook(...sign(true), secret)).toThrow(
    "Live webhook refused",
  );
  expect(() =>
    verifyStripeWebhook(...sign(true), secret, Date.now(), true),
  ).not.toThrow();
  expect(() =>
    verifyStripeWebhook(...sign(false), secret, Date.now(), true),
  ).toThrow("Test webhook refused while billing is live");
});

it("a QuickBooks sandbox connection never counts as connected in production", async () => {
  const repo = new MemoryRepository();
  await repo.put("provider_credentials", {
    id: repo.workspaceId,
    realm: "123",
    company: "Sandbox Co",
    status: "connected",
  });
  const config = {
    clientId: "id",
    clientSecret: "s",
    encryptionKey: Buffer.alloc(32).toString("base64"),
  };
  const sandbox = new QboConnection(
    repo,
    { ...config, environment: "sandbox" },
    fetch,
  );
  expect((await sandbox.status()).state).toBe("connected");
  const production = new QboConnection(
    repo,
    { ...config, environment: "production" },
    fetch,
  );
  const status = await production.status();
  expect(status.state).toBe("not_connected");
  expect(status.environment).toBe("production");
  expect(
    () => new QboConnection(repo, { ...config, environment: "staging" }, fetch),
  ).toThrow();
});

it("switching to production replaces a leftover sandbox connection instead of waiting on it", async () => {
  const repo = new MemoryRepository();
  await repo.put("provider_credentials", {
    id: repo.workspaceId,
    realm: "123",
    company: "Sandbox Co",
    status: "connected",
  });
  const production = new QboConnection(
    repo,
    {
      clientId: "id",
      clientSecret: "s",
      encryptionKey: Buffer.alloc(32).toString("base64"),
      environment: "production",
    },
    fetch,
  );
  const started = Date.now();
  // No production tokens to revoke: the lock is taken over the sandbox row
  // and the slot is cleared, ready for the production connection.
  await production.disconnect();
  expect(Date.now() - started).toBeLessThan(2000);
  expect(await repo.providerCredential(repo.workspaceId)).toBeNull();
  expect((await production.status()).state).toBe("not_connected");
});
