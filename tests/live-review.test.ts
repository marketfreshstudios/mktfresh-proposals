import { expect, it } from "vitest";
import {
  workspaceSetup,
  productMappings,
  connectionStatus,
} from "../src/lib/workspace-setup";
import { ItemSchema } from "../src/lib/model";
import {
  curatedFonts,
  fontChoice,
  fontFamily,
  curatedFontFaces,
} from "../src/lib/proposal-fonts";
import {
  legacyStaffRedirect,
  staffRoute,
  studioRoutes,
} from "../src/lib/staff-routes";
import { setup, staff, signature, clientActor } from "./helpers";
import { clientBilling } from "../src/lib/client-billing";
import { versionHash } from "../src/lib/content";
import { toolDefinitions } from "../src/lib/ai-tools";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const item = (patch: Record<string, unknown> = {}) =>
  ItemSchema.parse({
    id: randomUUID(),
    sku: "sample",
    name: "Sample",
    amount: 10000,
    interval: "month",
    stripe_lookup_key: "sample-monthly",
    ...patch,
  });
it.each([
  ["month", "key", null, false, "Stripe", false],
  ["year", "key", null, true, "Stripe", false],
  ["one_time", null, "qbo_1", true, "QuickBooks", false],
  ["one_time", null, "qbo_1", false, "QuickBooks", false],
  ["one_time", null, null, false, "Invoice manually", false],
  ["one_time", null, null, true, "Needs QuickBooks item", true],
  ["month", null, null, false, "Needs Stripe price", true],
  ["one_time", null, null, null, "Check QuickBooks connection", true],
])(
  "maps %s with Stripe=%s and QBO=%s to the actual billing path",
  (interval, lookup, qbo, connected, label, warning) => {
    const result = productMappings(
      item({ interval, stripe_lookup_key: lookup, qbo_item_ref: qbo }),
      connected as boolean | null,
    );
    expect(result).toMatchObject([{ label, warning }]);
    expect(result[0].detail.length).toBeGreaterThan(40);
  },
);
it("explains each interval independently for a product with several sub-lines", () => {
  const value = item({
    sublines: [
      {
        id: randomUUID(),
        label: "Monthly",
        qty: 1,
        amount: 10000,
        interval: "month",
        stripe_lookup_key: "monthly",
      },
      {
        id: randomUUID(),
        label: "Setup",
        qty: 1,
        amount: 20000,
        interval: "one_time",
      },
    ],
  });
  expect(productMappings(value, false).map((s) => s.label)).toEqual([
    "Stripe",
    "Invoice manually",
  ]);
});
it("Home uses real setup status and treats the disconnected QuickBooks/manual path as optional", async () => {
  const { repo } = await setup();
  const templates = await repo.entities<any>("templates");
  const base = {
    connections: { stripe: false, qbo: false, email: false, mock: true },
    catalog: [],
    templates: [],
    assistants: [],
  };
  const incomplete = workspaceSetup(base);
  expect(incomplete.complete).toBe(false);
  expect(incomplete.rows.find((r) => r.id === "stripe")?.detail).toBe(
    "Not connected",
  );
  expect(incomplete.rows.find((r) => r.id === "qbo")?.detail).toContain(
    "invoice manually",
  );
  const complete = workspaceSetup({
    ...base,
    connections: { ...base.connections, stripe: true },
    catalog: [item()],
    templates,
    assistants: [{ revoked: false }],
  });
  expect(complete.complete).toBe(true);
  expect(complete.rows.filter((r) => r.required).every((r) => r.complete)).toBe(
    true,
  );
  expect(complete.rows.find((r) => r.id === "qbo")?.complete).toBe(false);
  expect(
    workspaceSetup({
      ...base,
      catalog: [
        item({ legacy: true }),
        item({ active: false }),
        item({
          interval: "one_time",
          stripe_lookup_key: null,
          qbo_item_ref: "manual",
        }),
      ],
    }).rows.find((r) => r.id === "products")?.detail,
  ).toBe("0");
  expect(workspaceSetup({ ...base, connections: null }).rows[0].detail).toBe(
    "Status unavailable",
  );
  expect(connectionStatus({ stripe: true })).toBeNull();
  expect(connectionStatus([])).toBeNull();
  expect(connectionStatus(base.connections)).toEqual(base.connections);
});
it("Products is canonical and existing catalog URLs redirect; MCP names stay compatible", () => {
  expect(studioRoutes).toContainEqual(["/studio/products", "Products"]);
  expect(legacyStaffRedirect(["studio", "catalog"])).toBe("/studio/products");
  expect(legacyStaffRedirect(["studio", "catalog", "item"])).toBe(
    "/studio/products/item",
  );
  expect(legacyStaffRedirect(["catalogue"])).toBe("/studio/products");
  expect(staffRoute(["studio", "products"]).section).toBe("catalogue");
  const tool = toolDefinitions.find((t) => t.name === "list_catalog")!;
  expect(tool.description).toContain("products");
  expect(tool.name).toBe("list_catalog");
});
it("a linked customer uses a direct lookup and returns only that card, never searching unrelated candidates", async () => {
  const { repo, draft } = await setup();
  const calls: string[] = [];
  const result = await clientBilling(
    repo,
    { ...draft.client, stripe_customer_id: "cus_linked" },
    {
      get: async <T>(path: string) => {
        calls.push(path);
        if (path === "/v1/customers/cus_linked")
          return {
            livemode: false,
            name: "Linked",
            email: draft.client.email,
            created: 1700000000,
            invoice_settings: {
              default_payment_method: {
                card: { brand: "visa", last4: "4242" },
              },
            },
          } as T;
        return { data: [], has_more: false } as T;
      },
      post: async () => {
        throw new Error("No writes");
      },
    },
  );
  expect(calls).not.toContain("/v1/customers");
  expect(result.candidates).toMatchObject([
    {
      id: "cus_linked",
      name: "Linked",
      card: "visa ending 4242",
      created: "2023-11-14T22:13:20.000Z",
    },
  ]);
});
it("all requested curated fonts accept both heading/body selections and retain the existing default IDs", async () => {
  expect(curatedFonts).toHaveLength(12);
  expect(fontFamily()).toContain("Source Serif 4");
  for (const f of curatedFonts) {
    expect(fontChoice.parse(f.id)).toBe(f.id);
    expect(curatedFontFaces([f])).toContain(f.faces[0].file);
  }
  const { repo, service, draft, settings } = await setup();
  settings.proposal_fonts = { heading: "fraunces", body: "inter" };
  await repo.put("workspace_settings", settings);
  const sent = await service.send(draft.id, staff),
    signed = await service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
  const frozen = structuredClone(signed.versions.at(-1)!),
    hash = versionHash(frozen);
  settings.proposal_fonts = { heading: "playfair-display", body: "montserrat" };
  await repo.put("workspace_settings", settings);
  expect(
    (await repo.get(signed.id))!.workspace_settings!.proposal_fonts,
  ).toEqual({ heading: "fraunces", body: "inter" });
  expect(versionHash((await repo.get(signed.id))!.versions.at(-1)!)).toBe(hash);
  expect((await repo.get(signed.id))!.versions.at(-1)).toEqual(frozen);
});
it("font assets are self-hosted, licensed, fingerprinted and use real variable ranges/static styles", async () => {
  const provenance = JSON.parse(
    await readFile("public/fonts/GOOGLE-FONTS-SOURCES.json", "utf8"),
  );
  expect(provenance.commit).toMatch(/^[a-f0-9]{40}$/);
  for (const asset of provenance.assets) {
    const bytes = await readFile(`public/fonts/${asset.asset}`);
    expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    expect(await readFile(`public/fonts/${asset.license}`, "utf8")).toContain(
      "SIL OPEN FONT LICENSE",
    );
  }
  const poppins = curatedFonts.find((f) => f.id === "poppins")!;
  expect(poppins.faces).toHaveLength(6);
  expect(poppins.faces.map((f) => f.weight)).toContain("600");
  expect(
    curatedFonts
      .find((f) => f.id === "inter")!
      .faces.some((f) => f.style === "italic" && f.weight.includes(" ")),
  ).toBe(true);
  expect(await readFile("public/fonts/curated.css", "utf8")).not.toMatch(
    /https?:|googleapis|gstatic/,
  );
});
