import { afterEach, expect, it, vi } from "vitest";
import { MemoryRepository } from "../src/lib/repository";
import { QboConnection } from "../src/lib/providers/qbo-connection";

const config = {
  clientId: "id",
  clientSecret: "s",
  encryptionKey: Buffer.alloc(32).toString("base64"),
  environment: "sandbox" as const,
};
const auth = { realm: "123", accessToken: "token-secret" };

function respond(status: number, body: unknown, tid = "1-abc-tid") {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", intuit_tid: tid },
    })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

it("a rejected QuickBooks request names the error and Intuit's reference", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const qbo = new QboConnection(
    new MemoryRepository(),
    config,
    respond(400, {
      Fault: {
        Error: [
          {
            code: "6240",
            Message: "Duplicate Name Exists Error",
            Detail: "The name supplied already exists. : Jane Client",
          },
        ],
      },
    }),
  );
  const error = await qbo
    .request(auth, "customer", { DisplayName: "Jane Client" })
    .catch((e: Error) => e);
  expect((error as Error).message).toBe(
    "QuickBooks rejected the request (6240 Duplicate Name Exists Error: The name supplied already exists. : Jane Client). Check the customer, items, and invoice settings. QuickBooks reference: 1-abc-tid.",
  );
  expect(log).toHaveBeenCalledTimes(1);
  const line = JSON.parse(log.mock.calls[0][0] as string);
  expect(line).toEqual({
    event: "qbo_error",
    operation: "customer",
    status: 400,
    intuit_tid: "1-abc-tid",
    codes: ["6240"],
    messages: ["Duplicate Name Exists Error"],
  });
  // The server log never carries tokens, request bodies or record details.
  const raw = log.mock.calls[0][0] as string;
  expect(raw).not.toContain("token-secret");
  expect(raw).not.toContain("Jane Client");
});

it("an outage keeps Intuit's reference for support", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const qbo = new QboConnection(
    new MemoryRepository(),
    config,
    respond(503, {}, "1-outage"),
  );
  await expect(
    qbo.request(auth, "query?query=select%20*%20from%20Item"),
  ).rejects.toThrow(
    "QuickBooks is unavailable. Try billing again shortly. QuickBooks reference: 1-outage.",
  );
});

it("a successful request logs nothing", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const qbo = new QboConnection(
    new MemoryRepository(),
    config,
    respond(200, { Customer: { Id: "1" } }),
  );
  await qbo.request(auth, "customer/1");
  expect(log).not.toHaveBeenCalled();
});
