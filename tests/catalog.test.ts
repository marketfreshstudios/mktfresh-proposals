import { expect, it, vi } from "vitest";
import {
  syncStripeCatalog,
  resolveLookup,
  createCustomFamily,
  type StripeTransport,
} from "../src/lib/catalog";
import { MemoryRepository } from "../src/lib/repository";
import type { Item } from "../src/lib/model";
import { decodePlaybook } from "../src/lib/playbook";
import { setup } from "./helpers";
it("paginates catalogue reads, flags legacy, and resolves with lookup_keys filter", async () => {
  const repo = new MemoryRepository();
  const price = (id: string, legacy = false) => ({
    id,
    lookup_key: id,
    unit_amount: 30000,
    nickname: "Annual care",
    recurring: { interval: "year" },
    product: { id: "prod", name: "Care", active: true },
    metadata: { legacy: String(legacy) },
  });
  const get = vi
    .fn()
    .mockResolvedValueOnce({ data: [price("first")], has_more: true })
    .mockResolvedValueOnce({ data: [price("legacy", true)], has_more: false })
    .mockResolvedValueOnce({ data: [price("first")], has_more: false });
  const api = { get, post: vi.fn() } as unknown as StripeTransport;
  expect((await syncStripeCatalog(repo, api)).imported).toBe(2);
  const items = await repo.entities<Item>("pricing_items");
  expect(items.find((i) => i.legacy)?.active).toBe(false);
  expect(items.every((i) => !("stripe_price_id" in i))).toBe(true);
  expect(get.mock.calls[1][1].starting_after).toBe("first");
  await resolveLookup(api, "first");
  expect(get.mock.calls[2][1]["lookup_keys[]"]).toBe("first");
  expect(api.post).not.toHaveBeenCalled();
});
it("refuses duplicate family names before writing Stripe", async () => {
  const post = vi.fn();
  const api = {
    get: vi.fn().mockResolvedValue({
      data: [{ id: "prod", name: "Custom Retainer", active: true }],
      has_more: false,
    }),
    post,
  } as unknown as StripeTransport;
  await expect(
    createCustomFamily(new MemoryRepository(), api, "custom retainer", "key"),
  ).rejects.toThrow("already exists");
  expect(post).not.toHaveBeenCalled();
});
it("round-trips playbook entered lines without calculating prices", async () => {
  const { draft } = await setup();
  const payload = {
    source: "playbook",
    source_version: "v1.17 · 15 October 2026",
    title: "From discovery",
    lines: draft.quote,
    notes: "Client requirements",
  };
  expect(
    decodePlaybook(Buffer.from(JSON.stringify(payload)).toString("base64url")),
  ).toEqual(payload);
});
