/** PR 5 visual comparison: run against the local mock app (3100) and designs (4189).
 * `npx tsx scripts/capture-editor-v2-alignment.ts before|after`
 * Every source is rendered at 1440px; after also writes labelled comparison triplets.
 */
import { chromium, type Page, type Locator } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { editorFixture } from "../e2e/editor-fixture";
import { ItemSchema, type Block } from "../src/lib/model";
import { catalogQuoteItem } from "../src/lib/quote-model";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after")
  throw new Error("Use before or after");
const dir = "docs/screenshots/editor-v2-pr5";
const browser = await chromium.launch();
try {
  const app = await browser.newPage({
    baseURL: process.env.EDITOR_CAPTURE_APP_URL ?? "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1100 },
  });
  const prototype = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const faces = await Promise.all(
    [
      ["Instrument Sans", "InstrumentSans-Variable.woff2"],
      ["Source Serif 4", "SourceSerif4-Variable.woff2"],
      ["IBM Plex Mono", "IBMPlexMono-Regular.woff2"],
    ].map(
      async ([family, file]) =>
        `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${(await readFile(`public/fonts/${file}`)).toString("base64")});font-weight:100 900}`,
    ),
  );
  await prototype.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: faces.join("\n") }),
  );
  const f = await editorFixture(app);
  f.settings.company_name = "MarketFresh Studios";
  f.settings.owner = "Jonathan Garces";
  f.members[0].display_name = "Jonathan Garces";
  await f.repo.put("workspace_settings", f.settings);
  const presentation = structuredClone(f.active());
  presentation.created_at = "2026-10-29T12:00:00.000Z";
  presentation.client = {
    ...presentation.client,
    first_name: "Rowan",
    last_name: "Vale",
    company: "Brightline Foods",
    email: "rowan@brightlinefoods.com",
  };
  await f.repo.save(presentation, presentation.revision);
  const content: Block[] = [
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "Overview",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "{{client.first_name}}, thank you for walking us through the new menu and the catering side of the business.",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "This proposal covers a new website for {{client.company}}, ongoing care once it’s live, and optional add-ons you can include if they suit you.",
    },
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "What we’ll do",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      content: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              "Design and build a site with online catering orders",
              "Photograph the catering menu and write the menu pages",
              "Launch, then keep it updated and secure",
            ].map((text) => ({
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text }] },
              ],
            })),
          },
        ],
      },
    },
    { id: crypto.randomUUID(), type: "heading", text: "Timeline" },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "We’ll start the week of November 9. Design takes about three weeks and the build about five, so you’d launch in early January.",
    },
    { id: crypto.randomUUID(), type: "page_break" },
    { id: crypto.randomUUID(), type: "heading", text: "Your investment" },
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "page_break" },
    {
      id: crypto.randomUUID(),
      type: "contract",
      text: "Statement of Work & Contract",
      clauses: [
        {
          id: crypto.randomUUID(),
          heading: "Scope",
          body: "The agreed scope and milestones.",
          show_when: null,
        },
      ],
    },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
    { id: crypto.randomUUID(), type: "signature_block", role: "company" },
  ];
  const group = crypto.randomUUID();
  const line = async (
    name: string,
    amount: number,
    optional = true,
    interval: "one_time" | "month" = "one_time",
  ) => {
    const id = crypto.randomUUID();
    const item = ItemSchema.parse({
      id,
      sku: `capture-${id}`,
      name,
      amount,
      interval,
      stripe_lookup_key: interval === "month" ? `capture-${id}` : null,
      qbo_item_ref: interval === "one_time" ? "mock-services" : null,
    });
    await f.repo.put("pricing_items", item);
    return {
      ...catalogQuoteItem(item, 0, crypto.randomUUID(), [crypto.randomUUID()]),
      optional,
      default_selected: true,
    };
  };
  const oi = await line("Own It Over Time", 50000);
  oi.description = "Spread the cost; you own the site once it’s paid off.";
  oi.choice_group_id = group;
  oi.sublines[0].label = "Kickoff";
  const monthly = await line("Installment subscription", 17500, true, "month");
  oi.sublines.push({ ...monthly.sublines[0], label: "Monthly" });
  oi.schedule = {
    after_paid_invoices: 30,
    then: { amount: 10000, lookup_key: "capture-hosted" },
  };
  oi.min_term_months = 18;
  const own = await line("Website Build — Own It Now", 275000);
  own.description = "Pay once and own it from launch.";
  own.choice_group_id = group;
  own.default_selected = false;
  const custom = {
    ...(await line("Catering menu photography", 65000, false)),
    pricing_item_id: null,
    source: "custom" as const,
  };
  custom.description = "Half-day shoot, 20 edited images.";
  custom.sublines[0].list_amount = null;
  const audit = await line("AI Search Readiness Audit", 29500);
  audit.sublines[0].amount = 25000;
  audit.ai_entered = true;
  audit.default_selected = false;
  const care = await line("Care Standard", 8500, true, "month");
  const visibility = await line("Local Visibility Core", 29500, true, "month");
  visibility.default_selected = false;
  await f.editRemote({
    title: "Brightline Foods — Website & Care",
    content,
    valid_until: "2026-11-28T23:59:59.999Z",
    quote: [oi, own, custom, audit, care, visibility],
    style_overrides: {
      body: { size: 17 },
      heading1: { size: 24, space_above: 32, space_below: 12 },
      margins: { left: 0.85, right: 0.85 },
    },
  });
  await mkdir(dir, { recursive: true });
  await Promise.all([
    app.goto(`/proposals/${f.draft.id}`),
    prototype.goto(
      `http://127.0.0.1:4189/${encodeURIComponent("Redesign 10 - Editor Prototype.dc.html")}`,
    ),
  ]);
  await prototype.getByRole("tab", { name: "Quote", exact: true }).waitFor();
  await app.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  await Promise.all([
    app.evaluate(() => document.fonts.ready),
    prototype.evaluate(() => document.fonts.ready),
  ]);
  const metrics: Record<string, unknown> = {};
  async function shot(
    page: Page,
    name: string,
    region: Locator,
    kind: "prototype" | "before" | "after",
  ) {
    await region.screenshot({ path: `${dir}/${name}-${kind}.png` });
    metrics[`${kind}:${name}`] = await region.evaluate((el) => ({
      box: el.getBoundingClientRect().toJSON(),
      inputs: Array.from(el.querySelectorAll("input,select,textarea")).map(
        (n) => {
          const s = getComputedStyle(n);
          return {
            name: n.getAttribute("aria-label"),
            height: s.height,
            border: s.borderColor,
            radius: s.borderRadius,
            font: s.font,
          };
        },
      ),
    }));
  }
  for (const tab of ["Quote", "Fields", "Styles", "Send"]) {
    await app.getByRole("tab", { name: tab, exact: true }).click();
    await prototype.getByRole("tab", { name: tab, exact: true }).click();
    if (tab === "Styles")
      await app
        .getByRole("combobox", { name: "Text level", exact: true })
        .selectOption("heading1");
    await shot(app, tab.toLowerCase(), app.locator(".editor-v2-panel"), phase);
    if (phase === "before")
      await shot(
        prototype,
        tab.toLowerCase(),
        prototype.getByRole("complementary", { name: "Proposal tools" }),
        "prototype",
      );
  }
  await shot(app, "sections", app.locator(".editor-outline"), phase);
  if (phase === "before")
    await shot(
      prototype,
      "sections",
      prototype.getByRole("navigation", { name: "Sections", exact: true }),
      "prototype",
    );
  await app.getByRole("tab", { name: "Quote", exact: true }).click();
  await prototype.getByRole("tab", { name: "Quote", exact: true }).click();
  await app.locator(".document-cover").first().scrollIntoViewIfNeeded();
  await app.screenshot({ path: `${dir}/editor-1440-${phase}.png` });
  if (phase === "before")
    await prototype.screenshot({ path: `${dir}/editor-1440-prototype.png` });
  const sheet = await app.locator(".page-sheet").first().boundingBox();
  await app.screenshot({
    path: `${dir}/sheet-${phase}.png`,
    clip: { ...sheet!, height: Math.min(600, sheet!.height) },
  });
  if (phase === "before") {
    const first = await prototype.locator("main > div").first().boundingBox();
    await prototype.screenshot({
      path: `${dir}/sheet-prototype.png`,
      clip: { ...first!, height: Math.min(600, first!.height) },
    });
  }
  if (phase === "after") {
    for (const width of [1024, 375]) {
      await app.setViewportSize({ width, height: 1100 });
      await app.goto(`/proposals/${f.draft.id}`);
      await app
        .locator(".editor-page-sheets[data-layout-settled=true]")
        .waitFor();
      await app.screenshot({ path: `${dir}/editor-${width}-after.png` });
    }
  }
  await writeFile(
    `${dir}/metrics-${phase}.json`,
    JSON.stringify(metrics, null, 2),
  );
  // A third browser surface presents the sources side by side at their native size.
  const comparison = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  for (const name of [
    "quote",
    "fields",
    "styles",
    "send",
    "sections",
    "sheet",
  ]) {
    const columns =
      phase === "before"
        ? ["prototype", "before"]
        : ["prototype", "before", "after"];
    const cards = await Promise.all(
      columns.map(
        async (kind) =>
          `<section><h2>${kind}</h2><img src="data:image/png;base64,${(await readFile(`${dir}/${name}-${kind}.png`)).toString("base64")}"></section>`,
      ),
    );
    await comparison.setContent(
      `<style>body{margin:0;background:#f3f0ea;font:14px system-ui}main{display:flex;align-items:flex-start;gap:12px;padding:12px}section{flex:none}h2{font-size:14px;text-transform:uppercase}img{display:block;max-width:100%}</style><main>${cards.join("")}</main>`,
    );
    const naturalWidth = await comparison
      .locator("section")
      .evaluateAll((els) =>
        Math.ceil(
          els.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) +
            (els.length - 1) * 12 +
            24,
        ),
      );
    await comparison.setViewportSize({ width: naturalWidth, height: 1100 });
    await comparison.screenshot({
      path: `${dir}/${name}-${phase === "before" ? "pair" : "triplet"}.png`,
      fullPage: true,
    });
  }
} finally {
  await browser.close();
}
