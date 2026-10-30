import { catalogQuoteItem } from "../src/lib/quote-model";
import { expect, it, vi } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import { previewResult } from "../src/lib/preview";
import { ItemSchema, type Item } from "../src/lib/model";
import {
  itemDisplayName,
  sellableCatalogue,
} from "../src/lib/catalogue-display";
import { syncStripeCatalog, type StripeTransport } from "../src/lib/catalog";
import { bill, UnconfiguredBillingProvider } from "../src/lib/billing";
it("draft preview renders branding and content without changing state, tokens, events, jobs or signatures", async () => {
  const { repo, draft, settings } = await setup();
  const before = JSON.stringify(await repo.get(draft.id));
  const result = previewResult(draft, {
    ...settings,
    company_name: "Preview Studio",
  });
  expect(result.company.name).toBe("Preview Studio");
  expect(result.variables["client.company"]).toBe(draft.client.company);
  expect(result.quote).toHaveLength(draft.quote.length);
  expect(result.status).toBe("sent");
  expect(result.signers).toEqual([]);
  expect(result.billing).toEqual([]);
  expect(JSON.stringify(await repo.get(draft.id))).toBe(before);
  expect(draft.token).toBeNull();
});
it("alphabetizes sellable items by display name and snapshots display names into new quote lines", async () => {
  const { repo } = await setup();
  const [base] = await repo.entities<Item>("pricing_items");
  const items = [
    { ...base, id: "a", name: "Zulu", display_name: "Alpha" },
    { ...base, id: "b", name: "Beta" },
    { ...base, id: "c", name: "Hidden", active: false },
    { ...base, id: "d", name: "Legacy", active: true, legacy: true },
  ];
  expect(sellableCatalogue(items).map(itemDisplayName)).toEqual([
    "Alpha",
    "Beta",
  ]);
  const renamed = ItemSchema.parse({ ...base, display_name: "App name" });
  expect(catalogQuoteItem(renamed, 0, renamed.id, [renamed.id]).name).toBe(
    "App name",
  );
  expect(catalogQuoteItem(base, 0, base.id, [base.id]).name).toBe(base.name);
});
it("Stripe sync refreshes the synced name while preserving app-only display name", async () => {
  const { repo } = await setup();
  const [base] = await repo.entities<Item>("pricing_items");
  await repo.put("pricing_items", {
    ...base,
    stripe_lookup_key: "display-test",
    display_name: "App name",
  });
  const api = {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: "price",
          lookup_key: "display-test",
          unit_amount: 1000,
          nickname: null,
          recurring: { interval: "month" },
          product: { id: "prod", name: "Updated Stripe name", active: true },
          metadata: {},
        },
      ],
      has_more: false,
    }),
    post: vi.fn(),
  } as unknown as StripeTransport;
  await syncStripeCatalog(repo, api);
  expect(
    (await repo.entities<Item>("pricing_items")).find((i) => i.id === base.id),
  ).toMatchObject({ name: "Updated Stripe name", display_name: "App name" });
});
it("unmapped one-time lines can send and become Invoice manually needs-review items after signing without calling QuickBooks", async () => {
  const { repo, service, draft } = await setup();
  draft.workspace_settings!.qbo_custom_item_ref = null;
  // Send takes current workspace settings; remove the fallback there as well.
  const settings = (await repo.entities<any>("workspace_settings"))[0];
  await repo.put("workspace_settings", {
    ...settings,
    qbo_custom_item_ref: null,
  });
  draft.quote = draft.quote.map((l) => ({ ...l, qbo_item_ref: null }));
  await repo.save(draft, draft.revision);
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const adapter = new UnconfiguredBillingProvider("QuickBooks");
  const spy = vi.spyOn(adapter, "findCustomers");
  const result = await bill(signed, "qbo", adapter);
  expect(result).toMatchObject({
    status: "needs_review",
    last_error: "Invoice manually",
    metadata: { action: "Invoice manually" },
  });
  expect(spy).not.toHaveBeenCalled();
});

it("preview data requires staff authentication", async () => {
  const { handle } = await import("../src/lib/http");
  const response = await handle(
    new Request(
      "http://localhost/api/proposals/00000000-0000-4000-8000-000000000001/preview",
    ),
    ["proposals", "00000000-0000-4000-8000-000000000001", "preview"],
  );
  expect(response.status).toBe(401);
});
