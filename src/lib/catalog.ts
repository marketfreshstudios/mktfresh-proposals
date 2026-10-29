import { sha256 } from "./content";
import { randomUUID } from "node:crypto";
import { ItemSchema, check, type Item } from "./model";
import type { Repository } from "./repository";
export type StripePage<T> = { data: T[]; has_more: boolean };
export interface StripeTransport {
  get<T>(path: string, params: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    params: Record<string, unknown>,
    key: string,
  ): Promise<T>;
}
export type StripeProduct = {
  id: string;
  name: string;
  active: boolean;
  metadata: Record<string, string>;
};
type Price = {
  id: string;
  lookup_key: string | null;
  unit_amount: number | null;
  currency?: string;
  nickname: string | null;
  recurring: { interval: string } | null;
  product: StripeProduct;
  metadata: Record<string, string>;
};
export async function syncStripeCatalog(
  repo: Repository,
  api: StripeTransport,
) {
  const existing = await repo.entities<Item>("pricing_items");
  let cursor = "",
    imported = 0;
  do {
    const page = await api.get<StripePage<Price>>("/v1/prices", {
      active: "true",
      limit: "100",
      "expand[]": "data.product",
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const price of page.data) {
      if (
        !price.lookup_key ||
        price.unit_amount === null ||
        !["month", "year"].includes(price.recurring?.interval ?? "")
      )
        continue;
      const old = existing.find(
        (i) => i.stripe_lookup_key === price.lookup_key,
      );
      const legacy = price.metadata.legacy === "true";
      const item = ItemSchema.parse({
        ...old,
        id: old?.id ?? randomUUID(),
        sku: price.lookup_key,
        name: price.product.name,
        description: price.nickname ?? "",
        amount: price.unit_amount,
        interval: price.recurring!.interval,
        stripe_lookup_key: price.lookup_key,
        legacy,
        active: !legacy && price.product.active,
        plan_terms: Object.keys(price.metadata).length ? price.metadata : null,
      });
      await repo.put("pricing_items", item);
      imported++;
    }
    if (!page.has_more) break;
    check(page.data.length, "Stripe returned empty paginated page");
    cursor = page.data.at(-1)!.id;
  } while (true);
  return { imported, synced_at: new Date().toISOString() };
}
export async function resolveLookup(api: StripeTransport, key: string) {
  const page = await api.get<StripePage<Price>>("/v1/prices", {
    "lookup_keys[]": key,
    active: "true",
    limit: "2",
    "expand[]": "data.product",
  });
  check(page.data.length === 1, `Lookup key ${key} does not resolve uniquely`);
  const price = page.data[0];
  check(price.metadata.legacy !== "true", `Legacy lookup key ${key}`);
  check(price.product.active, "Catalogue product is inactive");
  return price;
}
export async function createCustomFamily(
  repo: Repository,
  api: StripeTransport,
  name: string,
  key: string,
) {
  check(
    name.trim().length > 2 && name.length <= 100,
    "Service family name required",
  );
  const clients = await repo.entities<{ id: string; company: string }>(
    "clients",
  );
  check(
    !clients.some((c) => name.toLowerCase().includes(c.company.toLowerCase())),
    "Family names describe services, not clients",
  );
  let cursor = "";
  let recovered: StripeProduct | undefined;
  do {
    const page = await api.get<StripePage<StripeProduct>>("/v1/products", {
      active: "true",
      limit: "100",
      ...(cursor ? { starting_after: cursor } : {}),
    });
    const duplicate = page.data.find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (duplicate) {
      check(
        duplicate.metadata?.request_key === sha256(key) &&
          duplicate.metadata?.workspace_id === repo.workspaceId,
        "An active product with this name already exists",
      );
      recovered = duplicate;
    }
    if (!page.has_more) break;
    check(page.data.length, "Stripe returned empty paginated page");
    cursor = page.data.at(-1)!.id;
  } while (true);
  const product =
    recovered ??
    (await api.post<StripeProduct>(
      "/v1/products",
      {
        name: name.trim(),
        metadata: {
          custom_family: "true",
          request_key: sha256(key),
          workspace_id: repo.workspaceId,
        },
      },
      key,
    ));
  const family = {
    id: sha256(repo.workspaceId + product.id)
      .slice(0, 32)
      .replace(/^(.{12}).(.{3})./, "$14$28")
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
    name: product.name,
    stripe_product_id: product.id,
    active: true,
  };
  await repo.put("custom_families", family);
  return family;
}
