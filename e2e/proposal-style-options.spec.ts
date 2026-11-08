import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { marginPresets } from "../src/lib/proposal-styles";
import type { Block } from "../src/lib/model";

test.use({ actionTimeout: 10000 });
test.beforeEach(async ({ page }) => {
  if (process.env.STYLE_CPU_RATE === "4")
    await (
      await page.context().newCDPSession(page)
    ).send("Emulation.setCPUThrottlingRate", { rate: 4 });
});
const content: Block[] = [
  { id: "cover-break", type: "page_break" },
  { id: "overview", type: "heading", text: "Overview", level: 1 },
  {
    id: "body",
    type: "paragraph",
    text: "A useful proposal keeps the same text and page geometry everywhere. ".repeat(
      30,
    ),
  },
  { id: "pricing", type: "pricing_table" },
  { id: "client-signature", type: "signature_block", role: "client" },
  { id: "company-signature", type: "signature_block", role: "company" },
];

for (const layout of ["cards", "table"] as const)
  for (const [preset, margin] of Object.entries(marginPresets))
    for (const size of [14, 18])
      test(`${layout}: ${preset} margins and ${size}px body share editor, client and PDF geometry`, async ({
        page,
      }) => {
        const f = await editorFixture(page, false, {
          content,
          quote: (base) => base.map((i) => ({ ...i, description: "" })),
        });
        const bands = {
          ...defaultHeaderFooter(),
          showHeader: false,
          showFooter: false,
        };
        await f.editRemote({
          header_footer: bands,
          style_overrides: {
            quote_layout: layout,
            body: { size },
            heading1: { colour: "#123456" },
            margins: {
              top: margin,
              right: margin,
              bottom: margin,
              left: margin,
            },
          },
        });
        await page.setViewportSize({ width: 1920, height: 1100 });
        await page.goto(`/proposals/${f.draft.id}`);
        await page
          .locator('.editor-page-sheets[data-layout-settled="true"]')
          .waitFor();
        const paper = page.locator(".editor-paper");
        await expect(
          paper.locator('[data-block-id="block-body"] .tiptap'),
        ).toHaveCSS("font-size", `${size}px`);
        await expect(
          paper.locator('[data-block-id="block-overview"] h2'),
        ).toHaveCSS("color", "rgb(18, 52, 86)");
        const expected = 1056 - margin * 192;
        const areas = await paper
          .locator(".page-sheet")
          .evaluateAll((els) =>
            els.map((el) => Number(el.getAttribute("data-content-height"))),
          );
        for (const height of areas) expect(height).toBeCloseTo(expected, 7);
        if (layout === "table") {
          const table = paper.locator("table.quote-table");
          await expect(table.getByRole("columnheader")).toHaveCount(4);
          await expect(
            table.getByRole("columnheader", {
              name: "Description",
              exact: true,
            }),
          ).toHaveCount(0);
          const ratio = await table.evaluate(
            (el) =>
              el.querySelector("col")!.getBoundingClientRect().width /
              el.getBoundingClientRect().width,
          );
          expect(ratio).toBeCloseTo(0.53, 2);
        }
        const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
        await f.editRemote({ pagination: plan });
        await page
          .getByRole("button", { name: "Preview PDF", exact: true })
          .click();
        await expect.poll(() => f.renders.length).toBe(1);
        const pdf = f.renders[0];
        expect(pdf.layout.pages).toBe(plan.pages);
        if (layout === "table") {
          const quoteSheets = pdf.layout.sheets!.filter((s) =>
            s.html.includes('class="quote-table"'),
          );
          expect(quoteSheets.length).toBeGreaterThan(0);
          for (const sheet of quoteSheets) {
            expect(sheet.html).not.toContain("quote-col-description");
            expect(sheet.html).toMatch(/quote-col-item[^>]+width:\s*53%/);
          }
        }
        for (const sheet of pdf.layout.sheets!)
          expect(
            Math.abs(sheet.content_area!.height - expected),
          ).toBeLessThanOrEqual(1);
        const sent = await f.sendRemote();
        await page.goto(`/p/${sent.token}`);
        const client = page.locator(
          '.client-document-sheets[data-layout-ready="true"]',
        );
        await client.waitFor();
        expect(
          JSON.parse((await client.getAttribute("data-page-plan"))!),
        ).toEqual(plan);
        await expect(client.locator(".print-sheet")).toHaveCount(plan.pages);
        if (layout === "table") {
          const table = client.locator("table.quote-table").first();
          await expect(table.getByRole("columnheader")).toHaveCount(4);
          const ratio = await table.evaluate(
            (el) =>
              el.querySelector("col")!.getBoundingClientRect().width /
              el.getBoundingClientRect().width,
          );
          expect(ratio).toBeCloseTo(0.53, 2);
        }
        for (const sheet of await client.locator(".print-sheet").all()) {
          const height = await sheet
            .locator(".client-sheet-content")
            .evaluate(
              (el) =>
                el.getBoundingClientRect().height /
                Number(
                  ((el.getRootNode() as ShadowRoot).host as HTMLElement).dataset
                    .scale,
                ),
            );
          expect(Math.abs(height - expected)).toBeLessThanOrEqual(1);
        }
        await expect(
          client.locator('[data-print-block="body"] p').first(),
        ).toHaveCSS("font-size", `${size}px`);
        await expect(
          client.locator('[data-print-block="overview"] h2'),
        ).toHaveCSS("color", "rgb(18, 52, 86)");
      });

test("Table rows split only at items, repeat headers, and retain accessible choice identities", async ({
  page,
}, info) => {
  const { publicResult } = await import("../src/lib/service");
  const { clientActor } = await import("../tests/helpers");
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const longToken = "ReferenceIdentifier".repeat(8);
  const f = await editorFixture(page, false, {
    content: content.filter((b) => b.id !== "body"),
    quote: (base) =>
      Array.from({ length: 30 }, (_, n) => ({
        ...base[0],
        id: crypto.randomUUID(),
        name: `Service option ${n + 1}${n === 29 ? ` ${longToken}` : ""}`,
        order: n,
        description: `A clear description of the service and the agreed deliverables.${n === 29 ? ` ${longToken}` : ""}`,
        schedule: null,
        min_term_months: null,
        plan_terms: null,
        optional: true,
        selected: undefined,
        default_selected: n === 0 || n === 12,
        choice_group_id:
          n < 12
            ? "00000000-0000-4000-8000-000000000011"
            : n < 14
              ? "00000000-0000-4000-8000-000000000012"
              : null,
        sublines: base[0].sublines.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
        })),
      })),
  });
  await f.editRemote({
    style_overrides: {
      quote_layout: "table",
      body: { size: 18 },
      margins: { top: 1.1, right: 1.1, bottom: 1.1, left: 1.1 },
    },
  });
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper");
  await paper
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  await expect(paper.locator("table.quote-table")).toHaveCount(1);
  await expect(paper.locator("table.quote-table th strong").first()).toHaveCSS(
    "text-transform",
    "none",
  );
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  expect(
    plan.starts.filter((s: any) => s.unit && s.block === "pricing").length,
  ).toBeGreaterThan(2);
  expect(
    plan.starts
      .filter((s: any) => s.block === "pricing")
      .every((s: any) => s.offset === 0),
  ).toBe(true);
  const items = f.active().quote;
  expect(plan.starts.some((s: any) => s.unit === items[13].id)).toBe(false); // fitting group stays whole
  await expect(paper.locator(".quote-table-repeat")).toHaveCount(
    plan.starts.filter((s: any) => s.unit && s.block === "pricing").length,
  );
  await f.editRemote({ pagination: plan });
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const pdf = f.renders[0];
  expect(pdf.layout.pages).toBe(plan.pages);
  writeFileSync(
    info.outputPath("table-layout.json"),
    JSON.stringify(
      {
        plan,
        layout: pdf.layout,
      },
      null,
      2,
    ),
  );
  expect(pdf.layout.overflow_pages).toEqual([]);
  const pdfPath = info.outputPath("table.pdf");
  writeFileSync(pdfPath, Buffer.from(pdf.pdf_base64, "base64"));
  const texts = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
  })
    .split("\f")
    .filter((s) => s.trim());
  for (const text of texts.filter((t) => t.includes("Service option")))
    for (const word of ["Item", "Description", "Qty", "Price", "Total"])
      expect(text).toContain(word);
  const readingOrder = execFileSync("pdftotext", ["-raw", pdfPath, "-"], {
    encoding: "utf8",
  }).replace(/\s/g, "");
  for (let n = 1; n <= 30; n++)
    expect(
      readingOrder.match(new RegExp(`Serviceoption${n}(?![0-9])`, "g")),
    ).toHaveLength(1);
  const sent = await f.sendRemote();
  let current = publicResult(sent);
  await page.route("**/api/public/**", async (route) => {
    if (route.request().url().endsWith("/quote"))
      current = publicResult(
        await f.service.toggle(
          sent.token!,
          "",
          route.request().postDataJSON(),
          clientActor,
        ),
      );
    await route.fulfill({
      json: route.request().url().endsWith("/brand")
        ? { ...current.company, contact: current.contact }
        : current,
    });
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/p/${sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  await expect(
    host.getByRole("checkbox", {
      name: `${items[29].name} · not included`,
      exact: true,
    }),
  ).toBeVisible();
  await host
    .getByRole("checkbox", {
      name: `${items[29].name} · not included`,
      exact: true,
    })
    .check();
  await expect
    .poll(() => current.quote.find((i) => i.id === items[29].id)!.selected)
    .toBe(true);
  for (const control of await host.locator("input[data-client-item]").all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(43.9);
    expect(box!.height).toBeGreaterThanOrEqual(43.9);
  }
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const second = host.getByRole("radio", {
    name: "Service option 2 · not included",
    exact: true,
  });
  await expect(second).toBeEnabled();
  await expect(host).toHaveAttribute("data-layout-ready", "true");
  await second.press("Space");
  await expect
    .poll(() => current.quote.find((i) => i.id === items[1].id)!.selected)
    .toBe(true);
  await expect(
    host.getByRole("radio", {
      name: "Service option 1 · not included",
      exact: true,
    }),
  ).not.toBeChecked();
  expect(current.pagination).toEqual(plan);
  for (const sheet of await host.locator(".print-sheet").all()) {
    if (await sheet.locator(".quote-table-row").count())
      await expect(sheet.locator("thead")).toHaveCount(1);
  }
  for (const start of plan.starts.filter(
    (s: any) => s.block === "pricing" && s.unit && s.unit !== "quote-totals",
  )) {
    const sheet = host.locator(".print-sheet").nth(start.page - 1);
    const offset = await sheet.evaluate((el) => {
      const scale = Number(
        ((el.getRootNode() as ShadowRoot).host as HTMLElement).dataset.scale,
      );
      return (
        (el.querySelector("thead")!.getBoundingClientRect().top -
          el.querySelector(".client-sheet-content")!.getBoundingClientRect()
            .top) /
        scale
      );
    });
    expect(Math.abs(offset)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator(".flow-document table.quote-table")).toHaveCSS(
    "display",
    "table",
  );
  await expect(
    page.locator(".flow-document .quote-table-row").first(),
  ).toHaveCSS("display", "table-row");
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator(".client-document-sheets")).toHaveCount(0);
  await expect(page.locator(".flow-document table.quote-table")).toHaveCount(1);
  await expect(page.locator(".flow-document table.quote-table")).toHaveCSS(
    "font-size",
    "18px",
  );
  const mobile = page.locator(".flow-document table.quote-table");
  const row = mobile.locator(".quote-table-row").first();
  await expect(row).toHaveCSS("display", "grid");
  await expect(
    mobile.getByRole("columnheader", { name: "Description", exact: true }),
  ).toHaveCount(1);
  const boxes = await row.evaluate((el) => {
    const row = el.getBoundingClientRect(),
      item = el.querySelector(".quote-table-item strong")!;
    const description = el.querySelector(".quote-table-description")!,
      rect = description.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(item);
    const wordRects: number[] = [];
    const walker = document.createTreeWalker(description, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode()))
      for (const match of text.textContent!.matchAll(/[A-Za-z]+/g)) {
        const r = document.createRange();
        r.setStart(text, match.index!);
        r.setEnd(text, match.index! + match[0].length);
        wordRects.push(r.getClientRects().length);
      }
    return {
      row: { x: row.x, width: row.width },
      description: { x: rect.x, width: rect.width },
      nameLines: range.getClientRects().length,
      wordRects,
      numbers: [...el.querySelectorAll(".quote-table-numeric")].map((n) => ({
        x: n.getBoundingClientRect().x,
        y: n.getBoundingClientRect().y,
      })),
    };
  });
  expect(boxes.nameLines).toBe(1);
  expect(boxes.description.x).toBeCloseTo(boxes.row.x, 0);
  expect(boxes.description.width).toBeCloseTo(boxes.row.width, 0);
  expect(boxes.wordRects.every((n) => n === 1)).toBe(true);
  expect(
    boxes.numbers.every((n) => Math.abs(n.y - boxes.numbers[0].y) < 1),
  ).toBe(true);
  expect(boxes.numbers[0].x).toBeLessThan(boxes.numbers[1].x);
  expect(boxes.numbers[1].x).toBeLessThan(boxes.numbers[2].x);
  await expect(row.locator(".quote-table-mobile-label")).toHaveText([
    "Qty ",
    "Price ",
    "Total ",
  ]);
  for (const control of await page
    .locator(".flow-document .quote-table-hit")
    .all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(
    page.getByRole("checkbox", {
      name: `${items[29].name} · included`,
      exact: true,
    }),
  ).toBeChecked();
  const phoneRadio = mobile.getByRole("radio", {
    name: "Service option 1 · not included",
    exact: true,
  });
  await expect(phoneRadio).toBeEnabled();
  await phoneRadio.press("Space");
  await expect
    .poll(() => current.quote.find((i) => i.id === items[0].id)!.selected)
    .toBe(true);
  expect(current.quote.find((i) => i.id === items[1].id)!.selected).toBe(false);
  const phoneCheckbox = mobile.getByRole("checkbox", {
    name: `${items[29].name} · included`,
    exact: true,
  });
  await expect(phoneCheckbox).toBeEnabled();
  await phoneCheckbox.press("Space");
  await expect
    .poll(() => current.quote.find((i) => i.id === items[29].id)!.selected)
    .toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const tokenLines = await mobile
    .locator(".quote-table-row")
    .last()
    .evaluate((el, token) => {
      const lines = (element: Element) => {
        const text = element.firstChild!,
          start = text.textContent!.indexOf(token),
          range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + token.length);
        return range.getClientRects().length;
      };
      const name = el.querySelector(".quote-table-item strong")!,
        description = el.querySelector(".quote-table-description p")!;
      return {
        name: lines(name),
        description: lines(description),
        width: el.scrollWidth,
        clientWidth: el.clientWidth,
        wordBreak: getComputedStyle(name).wordBreak,
        wrap: getComputedStyle(name).overflowWrap,
        hyphens: getComputedStyle(name).hyphens,
      };
    }, longToken);
  expect(tokenLines.name).toBeGreaterThan(1);
  expect(tokenLines.description).toBeGreaterThan(1);
  expect(tokenLines.width).toBeLessThanOrEqual(tokenLines.clientWidth);
  expect(tokenLines.wordBreak).toBe("normal");
  expect(tokenLines.wrap).toBe("break-word");
  expect(tokenLines.hyphens).toBe("none");
  if (process.env.CAPTURE_STYLE_OPTIONS) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync("docs/screenshots/proposal-style-options", { recursive: true });
    await page
      .locator('.flow-document [data-document-block="pricing"]')
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: "docs/screenshots/proposal-style-options/client-table-375.png",
      animations: "disabled",
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("workspace, template and proposal Styles save the same opt-in controls without changing legacy defaults", async ({
  page,
}, info) => {
  const { WorkspaceSettingsSchema } = await import("../src/lib/workspace");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const f = await editorFixture(page, false, {
    quote: (base) => base.map((i) => ({ ...i, description: "" })),
    content: content.map((b) =>
      b.id === "body"
        ? { ...b, text: "Clear deliverables, clear prices, and a shared plan." }
        : b,
    ),
  });
  let writes = 0;
  await page.route("**/api/workspace_settings", async (route) => {
    if (route.request().method() === "POST") {
      Object.assign(
        f.settings,
        WorkspaceSettingsSchema.parse(route.request().postDataJSON()),
      );
      writes++;
    }
    await route.fulfill({ json: f.settings });
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/studio/workspace?view=styles");
  await expect(page.getByLabel("Body size (px)", { exact: true })).toHaveValue(
    "16",
  );
  await expect(
    page.getByLabel("Page margin preset", { exact: true }),
  ).toHaveValue("current");
  await expect(page.getByLabel("Quote layout", { exact: true })).toHaveValue(
    "cards",
  );
  expect(writes).toBe(0);
  await page.getByLabel("Body size (px)", { exact: true }).fill("18");
  await page.getByLabel("Body size (px)", { exact: true }).press("Tab");
  await page
    .getByLabel("Page margin preset", { exact: true })
    .selectOption("wide");
  await page.getByLabel("Quote layout", { exact: true }).selectOption("table");
  await expect
    .poll(() => f.settings.proposal_styles?.quote_layout)
    .toBe("table");
  expect(f.settings.proposal_styles?.body?.size).toBe(18);
  expect(f.settings.proposal_styles?.margins).toEqual({
    top: 1.1,
    right: 1.1,
    bottom: 1.1,
    left: 1.1,
  });
  const capture = async (name: string) => {
    if (!process.env.CAPTURE_STYLE_OPTIONS) return;
    mkdirSync("docs/screenshots/proposal-style-options", { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/proposal-style-options/${name}.png`,
      animations: "disabled",
    });
  };
  await capture("workspace-1440");
  const template = (await f.repo.entities<any>("templates"))[0];
  await page.goto(`/studio/templates/${template.id}`);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Page & margins", { exact: true }).click();
  await page
    .getByLabel("Page margin preset", { exact: true })
    .selectOption("narrow");
  await page.getByLabel("Quote layout", { exact: true }).selectOption("cards");
  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("templates"))[0].style_overrides
          ?.quote_layout,
    )
    .toBe("cards");
  expect(
    (await f.repo.entities<any>("templates"))[0].style_overrides.margins.left,
  ).toBe(0.6);
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Text styles", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Text level", exact: true })
    .selectOption("body");
  await page.getByLabel("Body size (px)", { exact: true }).fill("18");
  await page.getByLabel("Body size (px)", { exact: true }).press("Tab");
  await page.getByText("Page & margins", { exact: true }).click();
  await page
    .getByLabel("Page margin preset", { exact: true })
    .selectOption("wide");
  await page.getByLabel("Quote layout", { exact: true }).selectOption("table");
  await expect
    .poll(() => f.active().style_overrides?.quote_layout)
    .toBe("table");
  await page
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  const pricing = page.locator('[data-block-id="block-pricing"]');
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.locator("table")).toBeVisible();
  const nameLines = await pricing
    .locator(".quote-table-item strong")
    .first()
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getClientRects().length;
    });
  expect(nameLines).toBe(1);
  await capture("table-wide-18-editor-1440");
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const geometryPdf = info.outputPath("no-description.pdf");
  writeFileSync(geometryPdf, Buffer.from(f.renders[0].pdf_base64, "base64"));
  const extracted = execFileSync("pdftotext", ["-layout", geometryPdf, "-"], {
    encoding: "utf8",
  });
  expect(
    extracted.split("\n").some((line) => /Website.*Build.*Own.*Now/.test(line)),
  ).toBe(true);
  if (process.env.CAPTURE_STYLE_OPTIONS) {
    const file = info.outputPath("table-wide.pdf");
    writeFileSync(file, Buffer.from(f.renders[0].pdf_base64, "base64"));
    const pdfPage =
      f.renders[0].layout.sheets!.findIndex((s) =>
        s.html.includes("quote-table-row"),
      ) + 1;
    execFileSync("pdftoppm", [
      "-f",
      String(pdfPage),
      "-l",
      String(pdfPage),
      "-scale-to",
      "1500",
      "-png",
      "-singlefile",
      file,
      "docs/screenshots/proposal-style-options/table-wide-18-pdf",
    ]);
  }
  await page.keyboard.press("Escape");
  await page.getByLabel("Quote layout", { exact: true }).selectOption("cards");
  await expect
    .poll(() => f.active().style_overrides?.quote_layout)
    .toBe("cards");
  await pricing.scrollIntoViewIfNeeded();
  await capture("cards-wide-18-editor-1440");
});

test("an empty Table quote retains its header in the editor and PDF preview", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content, quote: [] });
  await f.editRemote({ style_overrides: { quote_layout: "table" } });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  await expect(
    page.locator(".editor-paper table.quote-table thead"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  expect(
    f.renders[0].layout.sheets!.filter((s) =>
      s.html.includes('class="quote-table"'),
    ),
  ).toHaveLength(1);
});

test("a description-free long quote keeps four columns and the same row starts on every sheet", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: content.filter((b) => b.id !== "body"),
    quote: (base) =>
      Array.from({ length: 45 }, (_, n) => ({
        ...base[0],
        id: crypto.randomUUID(),
        order: n,
        name: `Service ${n + 1}`,
        description: "",
        sublines: base[0].sublines.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
        })),
      })),
  });
  await f.editRemote({
    style_overrides: {
      quote_layout: "table",
      body: { size: 18 },
      margins: { top: 1.1, right: 1.1, bottom: 1.1, left: 1.1 },
    },
  });
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper");
  await paper
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  expect(
    plan.starts.filter((s: any) => s.block === "pricing" && s.unit).length,
  ).toBeGreaterThan(1);
  await expect(paper.locator(".quote-table thead th")).toHaveCount(4);
  for (const gap of await paper.locator(".quote-table-gap td").all())
    await expect(gap).toHaveAttribute("colspan", "4");
  await f.editRemote({ pagination: plan });
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const pdf = f.renders[0];
  expect(pdf.layout.pages).toBe(plan.pages);
  expect(pdf.layout.overflow_pages).toEqual([]);
  const sent = await f.sendRemote();
  await page.goto(`/p/${sent.token}`);
  const client = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await client.waitFor();
  for (let n = 0; n < plan.pages; n++) {
    const rows = await client
      .locator(".print-sheet")
      .nth(n)
      .locator(".quote-table-row")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-print-unit")));
    const printed = await page.evaluate(
      (html) =>
        [
          ...new DOMParser()
            .parseFromString(html, "text/html")
            .querySelectorAll(".quote-table-row"),
        ].map((e) => e.getAttribute("data-print-unit")),
      pdf.layout.sheets![n].html,
    );
    expect(rows).toEqual(printed);
    if (rows.length) {
      await expect(
        client.locator(".print-sheet").nth(n).locator("thead th"),
      ).toHaveCount(4);
      expect(pdf.layout.sheets![n].html).not.toContain("quote-col-description");
    }
  }
});
