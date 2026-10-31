import { it, expect, vi, afterEach } from "vitest";
import { hashPassword } from "../src/lib/content";
import { staff } from "./helpers";
import { billingFixture } from "./billing-confirmation-fixture";
const mocked = vi.hoisted(() => ({ runtime: vi.fn(), after: vi.fn() }));
vi.mock("next/server", () => ({ after: mocked.after }));
vi.mock("../src/lib/runtime", () => ({
  runtime: mocked.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { POST } from "../src/app/api/[...path]/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("only verified, associated Stripe receipts schedule immediate proposal jobs after the response; ignored/forged events do not", async () => {
  const f = await billingFixture();
  mocked.runtime.mockReturnValue({ ...f, worker: f.worker });
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
  const request = (type?: string, forged = false) => {
    const r = f.signedRequest(undefined, type);
    return POST(
      new Request(
        `https://proposals.example.test/api/webhooks/stripe/${f.repo.workspaceId}`,
        {
          method: "POST",
          headers: { "stripe-signature": forged ? "invalid" : r.header },
          body: r.raw,
        },
      ),
      {
        params: Promise.resolve({
          path: ["webhooks", "stripe", f.repo.workspaceId],
        }),
      },
    );
  };
  expect((await request(undefined, true)).status).toBe(400);
  expect(mocked.after).not.toHaveBeenCalled();
  expect((await request("payment_intent.succeeded")).status).toBe(200);
  expect(mocked.after).not.toHaveBeenCalled();
  expect((await request()).status).toBe(200);
  expect(mocked.after).toHaveBeenCalledTimes(1);
  expect(
    (await f.repo.get(f.p.id))!.events.some(
      (e) => e.type === "billing_setup_completed",
    ),
  ).toBe(false);
  await mocked.after.mock.calls[0][0]();
  const p = (await f.repo.get(f.p.id))!;
  expect(p.events.some((e) => e.type === "billing_setup_completed")).toBe(true);
  expect(p.jobs.every((j) => j.status === "done")).toBe(true);
  expect(f.mailer.sent.size).toBe(2);
});
it("public state polling checks token/password access without recording a view or changing signed versions", async () => {
  const f = await billingFixture();
  const rt = { ...f, worker: f.worker };
  const { publicRuntime } = await import("../src/lib/runtime");
  vi.mocked(publicRuntime).mockResolvedValue(rt as any);
  const before = await f.repo.get(f.p.id);
  const { handle } = await import("../src/lib/http");
  for (let i = 0; i < 3; i++) {
    const r = await handle(
      new Request(
        `https://proposals.example.test/api/public/${f.p.token}/state`,
      ),
      ["public", f.p.token!, "state"],
    );
    expect(r.status).toBe(200);
    expect((await r.json()).billing[0].requires_checkout).toBe(true);
  }
  expect(await f.repo.get(f.p.id)).toEqual(before);
  const unsignedDraft = await f.service.create(
    {
      client_id: f.p.client.id,
      template_id: f.p.template_id!,
      title: "Unsigned proposal",
    },
    staff,
  );
  const unsigned = await f.service.send(unsignedDraft.id, staff);
  const unsignedState = await handle(
    new Request(
      `https://proposals.example.test/api/public/${unsigned.token}/state`,
    ),
    ["public", unsigned.token!, "state"],
  );
  expect(unsignedState.status).toBe(409);
  expect((await f.repo.get(unsigned.id))!.first_viewed_at).toBeNull();
  await f.repo.save(
    { ...before!, password_hash: hashPassword("a test password") },
    before!.revision,
  );
  const denied = await handle(
    new Request(`https://proposals.example.test/api/public/${f.p.token}/state`),
    ["public", f.p.token!, "state"],
  );
  expect(denied.status).toBe(401);
});
