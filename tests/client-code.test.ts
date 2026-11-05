import { expect, it, vi, afterEach } from "vitest";
import * as codes from "../src/lib/client-code";
import { setup, staff, clientActor } from "./helpers";
import { mutate } from "../src/lib/repository";
afterEach(() => vi.restoreAllMocks());
it("uses exactly twelve case-sensitive unambiguous random symbols and still accepts old links", () => {
  const values = new Set(
    Array.from({ length: 1000 }, () => codes.newClientCode()),
  );
  expect(values.size).toBe(1000);
  for (const code of values) {
    expect(code).toHaveLength(12);
    expect(code).not.toMatch(/[0O1lI]/);
    expect(codes.validClientToken(code)).toBe(true);
  }
  expect(codes.validClientToken("A".repeat(43))).toBe(true);
  expect(codes.validClientToken("0".repeat(12))).toBe(false);
});
it("retries collisions and never rotates published links on rename or a later send", async () => {
  const { repo, service, draft } = await setup();
  const other = structuredClone(draft);
  other.id = crypto.randomUUID();
  other.token = "7Kp9QmR2vTdX";
  await repo.save(other, -1);
  vi.spyOn(codes, "newClientCode")
    .mockReturnValueOnce(other.token)
    .mockReturnValueOnce("8Kp9QmR2vTdX");
  let sent = await service.send(draft.id, staff);
  expect(sent.token).toBe("8Kp9QmR2vTdX");
  await mutate(repo, sent.id, (p) => {
    p.title = "Renamed";
    p.client.company = "Renamed company";
  });
  sent = await service.send(sent.id, staff);
  expect(sent.token).toBe("8Kp9QmR2vTdX");
  expect((await service.view(sent.token!, "", clientActor)).id).toBe(sent.id);
  await expect(service.byToken("8kp9QmR2vTdX")).rejects.toMatchObject({
    status: 404,
  });
  await mutate(repo, sent.id, (p) => {
    p.token = "A".repeat(43);
  });
  expect((await service.byToken("A".repeat(43))).id).toBe(sent.id);
});
