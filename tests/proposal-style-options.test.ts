import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  resolveStyles,
  documentStyleCss,
  StyleOverridesSchema,
  marginPresets,
  harborQuoteNeutrals,
} from "../src/lib/proposal-styles";
import { documentQuote } from "../src/lib/document-quote";
import { setup, staff } from "./helpers";
import { publicResult } from "../src/lib/service";
import { versionHash } from "../src/lib/content";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
it("preserves the old frozen style map and Cards HTML while new default drafts use Harbor", () => {
  const current = resolveStyles();
  expect(current.layout?.quote_neutrals).toEqual(harborQuoteNeutrals);
  const styles = structuredClone(current);
  delete styles.layout!.quote_neutrals; // Older published and frozen versions omitted the palette.
  expect(styles.body.size).toBe(16);
  expect(styles.layout!.margins).toEqual({
    top: 0.75,
    right: 0.75,
    bottom: 0.75,
    left: 0.75,
  });
  expect(styles.layout).not.toHaveProperty("quote_layout");
  expect(hash(JSON.stringify(styles))).toBe(
    "d8a514d296c5966d383ba9e09e3423b24856abc91b23073c2e74092b0df674b8",
  );
  expect(hash(documentStyleCss(styles))).toBe(
    "a26892ad20506af9a242fadcc65769dbc1dfbf46f8953b025d0a1420ad81b7f5",
  );
  expect(hash(documentQuote([], "USD"))).toBe(
    "b0d71e645450d3b2971fba163a76d4b86ac99fdb69d11264c229323f7b9864ac",
  );
  expect(StyleOverridesSchema.parse({})).toEqual({});
});
it("resolves opt-in layout and existing per-level heading/body settings by workspace/template/proposal precedence", () => {
  expect(marginPresets).toEqual({ narrow: 0.6, normal: 0.9, wide: 1.1 });
  const s = resolveStyles(
    {
      proposal_styles: {
        quote_layout: "table",
        body: { size: 14 },
        heading1: { colour: "accent" },
      },
    },
    { body: { size: 18 }, margins: { left: 1.1 } },
    { quote_layout: "cards", heading1: { colour: "#123456" } },
  );
  expect(s.layout!.quote_layout).toBe("cards");
  expect(s.layout!.margins.left).toBe(1.1);
  expect(s.body.size).toBe(18);
  expect(s.heading1.colour).toBe("#123456");
  expect(() => StyleOverridesSchema.parse({ quote_layout: "grid" })).toThrow();
});
it("sent versions retain resolved layout, margins, body size and heading colors after workspace changes", async () => {
  const f = await setup();
  await f.repo.put("workspace_settings", {
    ...f.settings,
    proposal_styles: {
      quote_layout: "table",
      body: { size: 18 },
      heading1: { colour: "#123456" },
      margins: { top: 1.1, right: 1.1, bottom: 1.1, left: 1.1 },
    },
  });
  const sent = await f.service.send(f.draft.id, staff);
  const v = structuredClone(sent.versions[0]);
  await f.repo.put("workspace_settings", {
    ...f.settings,
    proposal_styles: {
      quote_layout: "cards",
      body: { size: 14 },
      margins: { top: 0.6 },
    },
  });
  const p = publicResult((await f.repo.get(sent.id))!);
  expect(p.resolved_styles).toEqual(v.resolved_styles);
  expect(p.resolved_styles!.layout!.quote_layout).toBe("table");
  expect((await f.repo.get(sent.id))!.versions[0]).toEqual(v);
  expect(versionHash(v)).toBe(v.content_hash);
});

it("Table stacks each given sub-line without combining unlike billing intervals", async () => {
  const { quoteTableGroups, quoteTableHtml } =
    await import("../src/lib/quote-table");
  const f = await setup();
  const item = structuredClone(f.draft.quote[0]);
  item.name = "Design & support";
  item.description = "Agreed <scope>";
  item.sublines = [
    {
      ...item.sublines[0],
      id: crypto.randomUUID(),
      label: "Project",
      amount: 250000,
      qty: 2,
      interval: "one_time",
    },
    {
      ...item.sublines[0],
      id: crypto.randomUUID(),
      label: "Care",
      amount: 2500,
      qty: 1,
      interval: "month",
    },
  ];
  const rows = quoteTableGroups([item], "USD")[0].rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].entries).toEqual([
    { label: "Project", qty: "2", price: "$2,500", total: "$5,000" },
    { label: "Care", qty: "1", price: "$25/mo", total: "$25/mo" },
  ]);
  const html = quoteTableHtml([item], "USD");
  expect(html).toContain('<table class="quote-table"');
  expect(html.match(/data-print-unit=/g)).toHaveLength(1);
  expect(html).toContain("Design &amp; support");
  expect(html).toContain("Agreed &lt;scope&gt;");
  expect(html).not.toContain("$5,025");
  expect(documentQuote([item], "USD", "auto", "table")).toContain(
    "document-totals",
  );
});
it("Table typography explicitly follows resolved body styles, with no inherited UI font", () => {
  const styles = resolveStyles(undefined, undefined, {
    body: { size: 18 },
    quote_layout: "table",
  });
  const css = documentStyleCss(styles);
  expect(css).toContain(".quote-table{font:400 18px/");
  expect(css).toContain("table-layout:fixed");
  expect(documentStyleCss(resolveStyles())).not.toContain("quote-table");
});

it("resolves one four/five-column geometry for the entire quote and keeps metadata when Description is absent", async () => {
  const { quoteTableColumns, quoteTableHtml } =
    await import("../src/lib/quote-table");
  const f = await setup();
  const quote = f.draft.quote.map((i) => ({ ...i, description: "" }));
  expect(quoteTableColumns(quote)).toEqual([
    { key: "item", label: "Item", width: 53 },
    { key: "qty", label: "Qty", width: 7 },
    { key: "price", label: "Price", width: 20 },
    { key: "total", label: "Total", width: 20 },
  ]);
  quote[0].description = "  ";
  expect(quoteTableColumns(quote).map((c) => c.key)).not.toContain(
    "description",
  );
  quote[1].description = "An actual service description";
  expect(quoteTableColumns(quote).map((c) => [c.key, c.width])).toEqual([
    ["item", 24],
    ["description", 29],
    ["qty", 7],
    ["price", 20],
    ["total", 20],
  ]);
  quote[0].description = "";
  quote[1].description = "";
  quote[0].min_term_months = 12;
  quote[0].sublines.push({
    ...quote[0].sublines[0],
    id: crypto.randomUUID(),
    label: "Second sub-line",
  });
  const html = quoteTableHtml(quote, "USD");
  expect(html).not.toContain("quote-col-description");
  expect(html).not.toContain('class="quote-table-description"');
  expect(html).toContain('class="quote-table-details"');
  expect(html).toContain("Second sub-line");
  expect(html).toContain("12-month minimum commitment.");
});
