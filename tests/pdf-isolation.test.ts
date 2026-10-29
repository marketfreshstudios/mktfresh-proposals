import { expect, it, vi } from "vitest";

vi.mock("../src/lib/pdf", () => {
  throw new Error("Simulated missing renderer package");
});
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("playwright-core", () => {
  throw new Error("Browser package loaded eagerly");
});
vi.mock("playwright", () => {
  throw new Error("Full Playwright package loaded eagerly");
});
vi.mock("@sparticuz/chromium", () => {
  throw new Error("Chromium package loaded eagerly");
});
// This fails for direct OR transitive static renderer/browser imports in the route.
it("API route loads and answers auth requests with an unavailable PDF renderer", async () => {
  const { GET } = await import("../src/app/api/[...path]/route");
  const response = await GET(new Request("http://localhost/api/auth/session"), {
    params: Promise.resolve({ path: ["auth", "session"] }),
  });
  expect(response.status).toBe(401);
});

it("renderer import failure cannot break auth or email; PDF failure is recorded and billing continues", async () => {
  const { handle } = await import("../src/lib/http");
  const { Worker, MockMailer } = await import("../src/lib/jobs");
  const { MockBillingProvider } = await import("../src/lib/billing");
  const { setup, staff, clientActor, signature } = await import("./helpers");
  const response = await handle(
    new Request("http://localhost/api/auth/session"),
    ["auth", "session"],
  );
  expect(response.status).toBe(401); // An auth response, not a module-loading crash.
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  const mailer = new MockMailer();
  const worker = new Worker(
    repo,
    { put: async () => {}, get: async () => new Uint8Array() },
    mailer,
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
  );
  await worker.drain(p.id);
  expect(mailer.sent.size).toBeGreaterThan(0);
  p = (await repo.get(p.id))!;
  await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const results = await worker.drain(p.id);
  expect(results.some((r) => r.status === "failed")).toBe(true);
  const updated = (await repo.get(p.id))!;
  expect(updated.jobs.find((j) => j.kind === "pdf")).toMatchObject({
    status: "pending",
    attempts: 1,
  });
  expect(updated.events.some((e) => e.type === "sync_failed")).toBe(true);
  expect(updated.billing_links.every((l) => l.status === "succeeded")).toBe(
    true,
  );
  expect(updated.billing_links).toHaveLength(2);
});
