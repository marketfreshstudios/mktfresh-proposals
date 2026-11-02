import { authoringPages } from "../src/lib/editor-pages";
import { pdfPreview } from "../src/lib/pdf-preview";
import { freezeStyles } from "../src/lib/proposal-styles";
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import { PDFDocument } from "pdf-lib";
import { sealedPdf } from "../src/lib/pdf";
import { variables, versionHash } from "../src/lib/content";
import { cloneQuote } from "../src/lib/quote-model";
import { previewResult } from "../src/lib/preview";
import type { Block } from "../src/lib/model";

test("editor UX evidence and interactions", async ({ page, context }) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(10000);
  const { repo, service, draft, settings, members } = await setup();
  const unusedProduct = (await repo.entities<any>("pricing_items")).find(
    (i) => !draft.quote.some((q) => q.pricing_item_id === i.id),
  )!;
  const content: Block[] = [
    { id: crypto.randomUUID(), type: "heading", text: "Your next chapter" },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "Hello {{client.first_name}}. Together we’ll agree a clear scope, keep you informed and prepare your next steps.",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "The approach",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "Discovery, design and a supported launch, with clear milestones along the way.",
    },
    {
      id: crypto.randomUUID(),
      type: "pricing_table",
      ai_review: { source: "assistant", reviewed: false },
    },
    {
      id: crypto.randomUUID(),
      type: "contract",
      text: "Agreement",
      clauses: [
        {
          id: crypto.randomUUID(),
          heading: "Scope and changes",
          body: "We’ll agree changes in writing before work begins.",
          show_when: null,
        },
        {
          id: crypto.randomUUID(),
          heading: "Optional scope",
          body: "Only applies when that product is selected.",
          show_when: {
            kind: "item_selected",
            pricing_item_id: unusedProduct.id,
          },
        },
      ],
    },
    { id: crypto.randomUUID(), type: "page_break" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
    { id: crypto.randomUUID(), type: "signature_block", role: "company" },
  ];
  const quote = cloneQuote(draft.quote),
    group = crypto.randomUUID();
  const alternative = structuredClone(quote[0]);
  alternative.id = crypto.randomUUID();
  alternative.name = "Alternative project";
  alternative.sublines = alternative.sublines.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
  }));
  quote[0] = {
    ...quote[0],
    optional: true,
    default_selected: true,
    choice_group_id: group,
  };
  alternative.optional = true;
  alternative.default_selected = false;
  alternative.choice_group_id = group;
  quote.splice(1, 0, alternative);
  let active = await service.edit(
    draft.id,
    { revision: draft.revision, content, quote },
    staff,
  );
  const template = (await repo.entities<any>("templates"))[0];
  template.content = structuredClone(content);
  await repo.put("templates", template);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (req.method() === "PATCH")
          active = await service.edit(active.id, req.postDataJSON(), staff);
        if (parts[2] === "preview-pdf")
          value = await pdfPreview(
            repo,
            {
              put: async () => {
                throw new Error("Preview wrote storage");
              },
              get: async () => new Uint8Array(),
            },
            { ...active, ...req.postDataJSON() },
            settings,
          );
        else if (parts[2] === "preview")
          value = previewResult(active, settings);
        else if (parts[2] === "review")
          value = active = await service.reviewSections(
            active.id,
            req.postDataJSON(),
            staff,
          );
        else value = parts[1] ? active : { items: [active], total: 1 };
      } else if (req.method() === "POST") {
        value = req.postDataJSON();
        await repo.put(parts[0] as any, value as any);
      } else value = await repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  const stage = process.env.EDITOR_UX_BEFORE ? "before" : "after",
    dir =
      process.env.CAPTURE_EDITOR_EVIDENCE === "1"
        ? `.data/evidence/editor-ux/${stage}`
        : "test-results/editor-ux-fixtures";
  await mkdir(dir, { recursive: true });
  const captures: any[] = [];
  async function shot(state: string, width: number, theme: string) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      localStorage.setItem("proposal-theme", t);
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const file = `${state}-${width}-${theme}.png`;
    if (process.env.CAPTURE_EDITOR_EVIDENCE === "1")
      await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    captures.push({ file, state, width, theme, stage });
  }
  for (const theme of process.env.EDITOR_UX_FAST
    ? ["light"]
    : ["light", "dark"]) {
    await context.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of process.env.EDITOR_UX_FAST
      ? [1440]
      : [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/proposals/${active.id}`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      if (width === 375)
        await page.locator(".phone-section-list button").first().click();
      if (stage === "after") {
        await expect(page.locator(".document-page-count")).toHaveAttribute(
          "data-page-count",
          /[0-9]+/,
        );
        await expect(page.locator("#cover-title")).toBeVisible();
      }
      await shot("document", width, theme);
      await page.locator(".draft-block .tiptap").first().click();
      await shot("selected-block", width, theme);
      if (stage === "after") {
        await page
          .locator('.draft-block[data-selected="true"]')
          .getByRole("button", { name: "Add block below", exact: true })
          .click();
        await expect(
          page.getByRole("dialog", { name: "Add a block" }),
        ).toBeVisible();
        await shot("block-menu", width, theme);
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Mark all reviewed", exact: true })
          .first()
          .click();
        await expect(
          page.getByRole("dialog", { name: "Review all AI-written sections" }),
        ).toBeVisible();
        await shot("review-confirm", width, theme);
        await page.keyboard.press("Escape");
        const pricing = page.locator(".editor-investment");
        if (width === 375 && !(await pricing.isVisible())) {
          await page
            .getByRole("button", { name: "‹ Sections", exact: true })
            .click();
          await page.locator(".phone-section-list button").nth(1).click();
        }
        await pricing.scrollIntoViewIfNeeded();
        await pricing.locator(".drag-handle").first().focus();
        await shot("document-pricing", width, theme);
      }
      await page.goto(`/studio/templates/${template.id}`);
      await expect(page.locator(".studio-blocks")).toBeVisible();
      await shot("template", width, theme);
      await page.locator(".studio-block-card").first().hover();
      await shot("template-selected", width, theme);
      await page.goto(`/p/${active.id}?preview=1`);
      await expect(page.locator("#proposal-document")).toBeVisible();
      await shot("client-preview", width, theme);
    }
  }
  if (stage === "after") {
    // Round 3 deliberately uses PDF geometry instead of the fluid client page.
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/proposals/${active.id}`);
      if (width === 375) {
        await page.locator(".phone-section-list button").first().click();
        await page
          .getByRole("button", { name: "Full document", exact: true })
          .click();
      }
      await expect(page.locator(".quote-workspace")).toHaveAttribute(
        "data-panels-ready",
        "true",
      );
      expect(
        await page
          .locator(".editor-paper")
          .evaluate((el) => (el as HTMLElement).offsetWidth),
      ).toBe(816);
      expect(
        parseFloat(
          await page
            .locator(".editor-paper")
            .evaluate((el) => getComputedStyle(el).paddingLeft),
        ),
      ).toBeCloseTo(72, 2);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/proposals/${active.id}`);
    await page
      .getByRole("textbox", { name: "Proposal title", exact: true })
      .fill("A clear next chapter");
    await expect.poll(() => active.title).toBe("A clear next chapter");
    await page.locator(".editor-breadcrumb button").click();
    await expect(page.locator("#cover-title")).toBeFocused();
    // Both drag surfaces reorder the same quote, including alternatives.
    async function keyboardMove(name: string, key: string, target: string) {
      const handle = page.getByRole("button", { name, exact: true });
      await handle.focus();
      await page.keyboard.press("Space");
      await page.evaluate(
        () =>
          new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
      );
      await page.keyboard.press(key);
      await expect(
        page.locator('[id^="DndLiveRegion"]').filter({
          hasText: `over droppable area ${name.startsWith("Drag section") ? "section:" : ""}${target}.`,
        }),
      ).toHaveCount(1);
      await page.keyboard.press("Space");
    }
    const first = content[0].id!,
      second = content[2].id!;
    if (
      !(await page
        .getByRole("button", {
          name: "Drag section Your next chapter",
          exact: true,
        })
        .isVisible())
    )
      await page
        .getByRole("button", { name: "Expand Pages sidebar", exact: true })
        .click();
    await keyboardMove("Drag section Your next chapter", "ArrowDown", second);
    await expect.poll(() => active.content[0].id).toBe(second);
    expect(authoringPages(active.content)[0].blocks.at(-1)?.id).toBe(
      content[1].id,
    );
    expect(authoringPages(active.content)[1].blocks.map((b) => b.id)).toEqual(
      authoringPages(content)[1].blocks.map((b) => b.id),
    );
    await keyboardMove("Drag section Your next chapter", "ArrowUp", second);
    await expect.poll(() => active.content[0].id).toBe(first);
    const pages = page.getByRole("dialog", { name: "Pages", exact: true });
    if (await pages.isVisible())
      await pages.getByRole("button", { name: "Done", exact: true }).click();
    const originalOrder = active.quote.map((i) => i.id);
    await page.locator(".editor-investment").scrollIntoViewIfNeeded();
    await keyboardMove(
      "Drag document choice group",
      "ArrowDown",
      originalOrder[2],
    );
    await expect.poll(() => active.quote[0].id).toBe(originalOrder[2]);
    expect(active.quote.slice(1).map((i) => i.id)).toEqual(
      originalOrder.slice(0, 2),
    );
    await keyboardMove(
      "Drag document option " + alternative.name,
      "ArrowUp",
      originalOrder[0],
    );
    await expect.poll(() => active.quote[1].id).toBe(alternative.id);
    const contract = page.locator(".contract-editor");
    await contract.scrollIntoViewIfNeeded();
    await contract
      .locator("..")
      .locator("..")
      .evaluate((el) => (el as HTMLElement).focus());
    await page
      .getByRole("button", { name: "Contract settings", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Clause", exact: true })
      .selectOption("1");
    await expect(
      page.getByRole("textbox", { name: "Clause body", exact: true }),
    ).toHaveValue("Only applies when that product is selected.");
    await page.keyboard.press("Escape");
    // The complete option card is a labelled touch target, not only its small radio.
    await page
      .locator(".document-quote label.flow-quote-line")
      .filter({ hasText: alternative.name })
      .click();
    await expect
      .poll(
        () =>
          active.quote.find((i) => i.id === alternative.id)?.default_selected,
      )
      .toBe(true);
    await page
      .locator(".document-quote label.flow-quote-line")
      .filter({ hasText: quote[0].name })
      .click();
    await expect
      .poll(
        () => active.quote.find((i) => i.id === quote[0].id)?.default_selected,
      )
      .toBe(true);
    // Slash insertion and focus do not leave the slash in document text.
    const paragraph = page
      .locator(".draft-block")
      .filter({ has: page.locator(".tiptap") })
      .first();
    await paragraph.locator(".tiptap").click();
    await paragraph
      .getByRole("button", { name: "Add block below", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Add a block" })
      .getByRole("menuitem", { name: "Text", exact: true })
      .click();
    const empty = page.locator(".tiptap:focus");
    await expect(empty).toBeVisible();
    await empty.press("/");
    await expect(
      page.getByRole("dialog", { name: "Add a block" }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "Add a block" })
      .getByRole("menuitem", { name: "Heading 1", exact: true })
      .click();
    await expect(page.locator(".document-heading:focus")).toHaveValue(
      "New section",
    );
    // Bulk review only clears content review. It writes one event with the listed sections.
    await page
      .getByRole("button", { name: "Mark all reviewed", exact: true })
      .first()
      .click();
    const prior = active.events.filter(
      (e) => e.type === "ai_sections_reviewed",
    ).length;
    await page
      .getByRole("button", { name: "Confirm all reviewed", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(
        () =>
          active.events.filter((e) => e.type === "ai_sections_reviewed").length,
      )
      .toBe(prior + 1);
    expect(
      active.content
        .filter((b) => b.ai_review)
        .every((b) => b.ai_review?.reviewed),
    ).toBe(true);
    // Long, rich text (including a paragraph larger than a page), explicit breaks, and no lost content.
    const longContent: Block[] = [
      { id: crypto.randomUUID(), type: "heading", text: "Long scope" },
      ...Array.from({ length: 32 }, (_, n): Block => ({
        id: crypto.randomUUID(),
        type: "paragraph",
        text:
          `Section ${n + 1}. ` +
          "Agreed scope and milestones. ".repeat(n === 10 ? 180 : 15),
      })),
      { id: crypto.randomUUID(), type: "page_break" },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "The final agreed step.",
      },
      ...active.content.filter((b) => b.type === "signature_block"),
    ];
    active = await service.edit(
      active.id,
      { revision: active.revision, content: longContent },
      staff,
    );
    await page.goto(`/proposals/${active.id}`);
    await expect(page.locator(".document-page-count")).toHaveAttribute(
      "data-page-count",
      /[0-9]+/,
    );
    const count = Number(
      await page
        .locator(".document-page-count")
        .getAttribute("data-page-count"),
    );
    const map = variables(active),
      version = {
        id: crypto.randomUUID(),
        version_no: 1,
        content: active.content,
        quote: active.quote,
        variables_resolved: map,
        resolved_styles: freezeStyles(
          settings,
          active.template_style_overrides,
          active.style_overrides,
        ),
        content_hash: "",
        created_at: active.created_at,
        frozen: false,
      };
    version.content_hash = versionHash(version);
    const pdf = await sealedPdf(version, [], [], active.currency, {
      settings,
      document: { id: active.id, title: active.title },
    });
    expect((await PDFDocument.load(pdf.pdf)).getPageCount()).toBe(count);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const textLoading = getDocument({
      data: new Uint8Array(pdf.body),
      useSystemFonts: true,
    });
    const textDocument = await textLoading.promise;
    let extracted = "";
    for (let n = 1; n <= textDocument.numPages; n++)
      extracted +=
        (await (await textDocument.getPage(n)).getTextContent()).items
          .map((i) => ("str" in i ? i.str : ""))
          .join(" ") + " ";
    extracted = extracted.replace(/\s+/g, " ");
    await textLoading.destroy();
    for (let n = 1; n <= 32; n++) expect(extracted).toContain(`Section ${n}.`);
    expect(extracted.match(/Agreed scope and milestones\./g)).toHaveLength(645);
    expect(extracted).toContain("The final agreed step.");
    expect(extracted.split(active.title)).toHaveLength(2);
    // A complete choice group remains atomic, including all names, scopes and amounts.
    const longQuote = structuredClone(active.quote),
      grouped = longQuote.filter((i) => i.choice_group_id === group);
    grouped[0].description = "Alpha scope is included. ".repeat(12);
    grouped[1].description = "Beta scope is included. ".repeat(12);
    const pricingContent: Block[] = [
      { id: crypto.randomUUID(), type: "pricing_table" },
    ];
    const pricingVariables = variables({
      ...active,
      quote: longQuote,
      content: pricingContent,
    });
    const pricingVersion = {
      ...version,
      content: pricingContent,
      quote: longQuote,
      variables_resolved: pricingVariables,
    };
    pricingVersion.content_hash = versionHash(pricingVersion);
    const pricingPdf = await sealedPdf(
      pricingVersion,
      [],
      [],
      active.currency,
      { settings, document: { id: active.id, title: active.title } },
    );
    const pricingLoading = getDocument({
        data: new Uint8Array(pricingPdf.body),
        useSystemFonts: true,
      }),
      pricingDoc = await pricingLoading.promise;
    let pricingText = "";
    for (let n = 1; n <= pricingDoc.numPages; n++)
      pricingText +=
        (await (await pricingDoc.getPage(n)).getTextContent()).items
          .map((i) => ("str" in i ? i.str : ""))
          .join(" ") + " ";
    for (let n = 1; n <= pricingDoc.numPages; n++) {
      const pageText = (
        await (await pricingDoc.getPage(n)).getTextContent()
      ).items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ")
        .trim();
      expect(pageText).not.toBe("Choose one");
    }
    pricingText = pricingText.replace(/\s+/g, " ");
    await pricingLoading.destroy();
    for (const item of longQuote) expect(pricingText).toContain(item.name);
    expect(pricingText.match(/Alpha scope is included\./g)).toHaveLength(12);
    expect(pricingText.match(/Beta scope is included\./g)).toHaveLength(12);
    expect(pricingText).toContain("$2,750");
    expect(pricingText).toContain("$25");
    await writeFile(`${dir}/long-pricing-group.pdf`, pricingPdf.pdf);
    const oversized = structuredClone(pricingVersion);
    oversized.quote[0].description = "Oversized scope. ".repeat(500);
    oversized.content_hash = versionHash(oversized);
    await expect(
      sealedPdf(oversized, [], [], active.currency, {
        settings,
        document: { id: active.id, title: active.title },
      }),
    ).rejects.toThrow("too tall for one PDF page");
    await writeFile(`${dir}/long-proposal.pdf`, pdf.pdf);
    await writeFile(
      `${dir}/pagination.json`,
      JSON.stringify({
        editor: count,
        pdf: (await PDFDocument.load(pdf.pdf)).getPageCount(),
      }),
    );
    for (const theme of ["light", "dark"])
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        if (width === 375) {
          await page.goto(`/proposals/${active.id}`);
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          await page.locator(".phone-section-list button").first().click();
          await page
            .getByRole("button", { name: "Full document", exact: true })
            .click();
        }
        const last = page.locator(".editor-page-break");
        await last.scrollIntoViewIfNeeded();
        await expect(page.locator(".document-page-count")).toHaveAttribute(
          "data-page-count",
          String(count),
        );
        await shot("page-break", width, theme);
      }
    active = await service.edit(
      active.id,
      {
        revision: active.revision,
        content: [
          ...active.content,
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            text: "{{unknown.field}}",
          },
        ],
      },
      staff,
    );
    await page.goto(`/proposals/${active.id}`);
    await expect(page.locator(".quote-workspace")).toBeVisible();
    await expect(page.locator(".document-page-count")).toContainText(
      "Page preview unavailable",
    );
    for (const theme of ["light", "dark"])
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 375) {
          await page.goto(`/proposals/${active.id}`);
          await page.locator(".phone-section-list button").first().click();
          await page
            .getByRole("button", { name: "Full document", exact: true })
            .click();
        }
        await page
          .locator(".draft-block")
          .filter({ has: page.locator('[data-field="unknown.field"]') })
          .scrollIntoViewIfNeeded();
        await shot("page-preview-unavailable", width, theme);
      }
    const invalid = page
      .locator(".draft-block")
      .filter({ has: page.locator('[data-field="unknown.field"]') });
    await invalid.evaluate((el) => (el as HTMLElement).focus());
    await invalid
      .getByRole("button", { name: "Delete block", exact: true })
      .click();
    await expect(page.locator(".document-page-count")).toHaveAttribute(
      "data-page-count",
      /[0-9]+/,
    );
    await expect
      .poll(() => active.content.some((b) => b.text?.includes("unknown.field")))
      .toBe(false);
  }
  if (process.env.CAPTURE_EDITOR_EVIDENCE === "1")
    await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
