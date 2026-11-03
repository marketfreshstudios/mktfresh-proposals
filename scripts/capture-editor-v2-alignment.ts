/** PR 5 visual comparison: run against the local mock app (3100) and designs (4189).
 * `npx tsx scripts/capture-editor-v2-alignment.ts before|after`
 * Every source is rendered at 1440px; after also writes labelled comparison triplets.
 */
import { chromium, type Page, type Locator } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { editorFixture } from "../e2e/editor-fixture";
import type { Block } from "../src/lib/model";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after")
  throw new Error("Use before or after");
const dir = "docs/screenshots/editor-v2-pr5";
const browser = await chromium.launch();
try {
  const app = await browser.newPage({
    baseURL: "http://127.0.0.1:3100",
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
    { id: crypto.randomUUID(), type: "heading", text: "What we’ll do" },
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
  const [base] = f.active().quote,
    group = crypto.randomUUID();
  const line = (name: string, amount: number, optional = true) => ({
    ...structuredClone(base),
    id: crypto.randomUUID(),
    name,
    optional,
    default_selected: true,
    description: "",
    sublines: [
      {
        ...base.sublines[0],
        id: crypto.randomUUID(),
        amount,
        list_amount: amount,
      },
    ],
  });
  const oi = line("Own It Over Time", 50000);
  oi.description = "Spread the cost; you own the site once it’s paid off.";
  oi.choice_group_id = group;
  oi.sublines[0].label = "Kickoff";
  oi.sublines.push({
    ...oi.sublines[0],
    id: crypto.randomUUID(),
    label: "Monthly",
    amount: 17500,
    list_amount: 17500,
    interval: "month",
  });
  const own = line("Website Build — Own It Now", 275000);
  own.choice_group_id = group;
  own.default_selected = false;
  const custom = {
    ...line("Phase 1 — Soft-launch site", 65000, false),
    pricing_item_id: null,
    source: "custom" as const,
  };
  await f.editRemote({
    title: "Brightline Foods — Website & Care",
    content,
    quote: [oi, own, custom],
    style_overrides: { body: { size: 17 } },
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
  await app
    .locator(".editor-paper")
    .screenshot({ path: `${dir}/sheet-${phase}.png` });
  if (phase === "before")
    await prototype
      .locator("main > div")
      .first()
      .screenshot({ path: `${dir}/sheet-prototype.png` });
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
    await comparison.screenshot({
      path: `${dir}/${name}-${phase === "before" ? "pair" : "triplet"}.png`,
      fullPage: true,
    });
  }
} finally {
  await browser.close();
}
