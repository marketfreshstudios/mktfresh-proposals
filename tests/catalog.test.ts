import { flatQuote, quoteItems } from "../src/lib/quote-model";
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
    lines: flatQuote(draft.quote),
    notes: "Client requirements",
  };
  expect(
    decodePlaybook(Buffer.from(JSON.stringify(payload)).toString("base64url")),
  ).toEqual(payload);
});
it("new family identifiers are valid UUIDs usable by quote lines", async () => {
  const api = {
    get: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    post: vi.fn().mockResolvedValue({
      id: "prod_family",
      name: "Custom Retainer",
      active: true,
    }),
  } as unknown as StripeTransport;
  const result = await createCustomFamily(
    new MemoryRepository(),
    api,
    "Custom Retainer",
    "unique-request",
  );
  expect(result.id).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
  );
});

it.each(["yes", "YES", "YeS", "true", "TRUE", "1", " yes "])(
  "resync marks legacy=%s inactive and lookup refuses it",
  async (legacy) => {
    const repo = new MemoryRepository();
    const price = {
      id: "price_retired",
      lookup_key: "retired-plan",
      unit_amount: 7000,
      nickname: null,
      recurring: { interval: "month" },
      product: { id: "prod", name: "Retired plan", active: true },
      metadata: { legacy: "false" },
    };
    const api = {
      get: vi
        .fn()
        .mockImplementation(async () => ({ data: [price], has_more: false })),
      post: vi.fn(),
    } as unknown as StripeTransport;
    await syncStripeCatalog(repo, api);
    const [before] = await repo.entities<Item>("pricing_items");
    expect(before.active).toBe(true);
    price.metadata.legacy = legacy;
    await syncStripeCatalog(repo, api);
    const items = await repo.entities<Item>("pricing_items");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: before.id,
      legacy: true,
      active: false,
    });
    await expect(resolveLookup(api, "retired-plan")).rejects.toThrow(
      "Legacy lookup key",
    );
    expect(api.post).not.toHaveBeenCalled();
  },
);
it.each([undefined, "", "false", "FALSE", "0", "no", "yesterday"])(
  "keeps nonlegacy metadata %s sellable",
  async (legacy) => {
    const repo = new MemoryRepository();
    const api = {
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: "price_current",
            lookup_key: "current-plan",
            unit_amount: 10000,
            nickname: null,
            recurring: { interval: "month" },
            product: { id: "prod", name: "Current plan", active: true },
            metadata: legacy === undefined ? {} : { legacy },
          },
        ],
        has_more: false,
      }),
      post: vi.fn(),
    } as unknown as StripeTransport;
    await syncStripeCatalog(repo, api);
    expect((await repo.entities<Item>("pricing_items"))[0]).toMatchObject({
      legacy: false,
      active: true,
    });
    await expect(resolveLookup(api, "current-plan")).resolves.toBeDefined();
  },
);
