import { openEditorPanel } from "./editor-ui";
import { pdfPreview } from "../src/lib/pdf-preview";
import { test, expect, type Page } from "@playwright/test";
import { setup, staff } from "../tests/helpers";
import type { Block, Template } from "../src/lib/model";
import { previewResult } from "../src/lib/preview";
import { freezeStyles } from "../src/lib/proposal-styles";
import { variables, versionHash } from "../src/lib/content";
import { sealedPdf } from "../src/lib/pdf";
import { PDFDocument } from "pdf-lib";
async function fixture(page: Page, grouped = false) {
  page.setDefaultTimeout(10000);
  const f = await setup(),
    { repo, service, draft, settings, members } = f;
  const heading = crypto.randomUUID(),
    text = crypto.randomUUID(),
    pricing = crypto.randomUUID();
  const content: Block[] = [
    { id: heading, type: "heading", level: 1, text: "Our approach" },
    { id: text, type: "paragraph", text: "Draft paragraph" },
    { id: pricing, type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  const quote = structuredClone(draft.quote);
  if (grouped) {
    const group = crypto.randomUUID();
    quote[0] = {
      ...quote[0],
      optional: true,
      default_selected: true,
      choice_group_id: group,
    };
    quote.splice(1, 0, {
      ...structuredClone(quote[0]),
      id: crypto.randomUUID(),
      name: "Alternative product",
      default_selected: false,
      sublines: quote[0].sublines.map((line) => ({
        ...line,
        id: crypto.randomUUID(),
      })),
    });
    quote.forEach((item, n) => (item.order = n));
  }
  let active = await service.edit(
    draft.id,
    { revision: draft.revision, content, quote },
    staff,
  );
  const template = (await repo.entities<Template>("templates"))[0];
  template.content = structuredClone(content);
  await repo.put("templates", template);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown;
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "workspace-fonts") value = [];
      else if (parts[0] === "proposals") {
        active = await service.forRead((await repo.get(active.id))!);
        if (req.method() === "PATCH")
          active = await service.edit(active.id, req.postDataJSON(), staff);
        value =
          parts[2] === "preview-pdf"
            ? await pdfPreview(
                repo,
                {
                  put: async () => {
                    throw new Error("Preview wrote storage");
                  },
                  get: async () => new Uint8Array(),
                },
                { ...active, ...req.postDataJSON() },
                settings,
              )
            : parts[2] === "preview"
              ? previewResult(active, settings)
              : parts[1]
                ? active
                : { items: [active], total: 1 };
      } else if (req.method() === "POST") {
        value = req.postDataJSON();
        await repo.put(parts[0] as any, value as any);
      } else value = await repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  return { ...f, heading, text, pricing, template, current: () => active };
}
async function openDocument(page: Page, width: number, id: string) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/proposals/${id}`);
  if (width === 375) {
    await expect(page.locator(".editor-paper")).toBeVisible();
    await expect(page.locator(".editor-paper")).toBeVisible();
  }
}
for (const width of [1440, 375]) {
  test(`block menu dismisses outside, Escape, scroll and insertion in both editors (${width})`, async ({
    page,
  }) => {
    const f = await fixture(page);
    if (width < 700) {
      // The focused Studio shell does not scroll the window. Give its phone
      // section genuine document overflow instead of relying on an old offset.
      const content = f
        .current()
        .content.map((block) =>
          block.id === f.text
            ? {
                ...block,
                text: "A paragraph long enough to scroll the document. ".repeat(
                  80,
                ),
                content: undefined,
              }
            : block,
        );
      await f.service.edit(
        f.draft.id,
        { revision: f.current().revision, content },
        staff,
      );
      await f.repo.put("templates", { ...f.template, content });
    }
    await openDocument(page, width, f.draft.id);
    const menu = page.getByRole("dialog", { name: "Add a block", exact: true });
    for (const kind of ["proposal", "template"]) {
      if (kind === "template")
        await page.goto(`/studio/templates/${f.template.id}`);
      const block =
        kind === "proposal"
          ? page.locator(`[data-block-id="block-${f.text}"]`)
          : page.locator(".studio-block-card").nth(1);
      const trigger = block.getByRole("button", {
        name: /^Add (a )?block below$/,
        exact: true,
      });
      const open = async () => {
        await block.click();
        await trigger.click();
        await expect(menu).toBeVisible();
      };
      await open();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await open();
      await page
        .locator(
          kind === "proposal" ? ".document-cover h1" : ".template-cover h1",
        )
        .dispatchEvent("pointerdown");
      await expect(menu).toHaveCount(0);
      await page.setViewportSize({ width, height: 600 });
      await open();
      const movement = await block.evaluate((el) => {
        let canvas: HTMLElement | null = el.parentElement;
        while (
          canvas &&
          !(
            canvas.scrollHeight > canvas.clientHeight + 1 &&
            /auto|scroll/.test(getComputedStyle(canvas).overflowY)
          )
        )
          canvas = canvas.parentElement;
        const before = canvas?.scrollTop ?? scrollY;
        (canvas ?? window).scrollBy(0, before > 0 ? -64 : 64);
        return (canvas?.scrollTop ?? scrollY) - before;
      });
      expect(Math.abs(movement)).toBeGreaterThan(0);
      await expect(menu).toHaveCount(0);
      await open();
      await menu.getByRole("searchbox").fill("Heading 3");
      await page.keyboard.press("Enter");
      await expect(menu).toHaveCount(0);
      if (kind === "proposal")
        await expect
          .poll(() => f.current().content.some((b) => b.level === 3))
          .toBe(true);
      else
        await expect(
          page.locator(
            width >= 700
              ? ".studio-block-card h4 .tiptap"
              : ".studio-block-card h4",
          ),
        ).toHaveText("Subheading");
    }
  });
  test(`heading conversion, styles and pricing handles stay usable (${width})`, async ({
    page,
  }) => {
    const f = await fixture(page, true);
    await openDocument(page, width, f.draft.id);
    const frame = page.locator(`[data-block-id="block-${f.text}"]`),
      bar = page.getByRole("toolbar", {
        name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
        exact: true,
      });
    await frame.locator(".tiptap").focus();
    const barHeight = (await bar.boundingBox())!.height;
    for (const level of [1, 2, 3] as const) {
      await expect
        .poll(async () => (await bar.boundingBox())!.height)
        .toBeCloseTo(barHeight, 2);
      await frame.locator(".tiptap").fill("#".repeat(level));
      await frame.locator(".tiptap").press("Space");
      await expect(frame.locator(`h${level + 1} .tiptap`)).toBeFocused();
      await expect(bar.locator(".text-style-label")).toHaveText(
        width < 700 ? `H${level}` : `Heading ${level}`,
      );
      await frame.locator(".tiptap").fill(`Level ${level}`);
      await expect
        .poll(() => f.current().content.find((b) => b.id === f.text)?.level)
        .toBe(level);
      await bar.locator('button[aria-label="Text style"]').click();
      await page.getByLabel("Paragraph", { exact: true }).click();
      await expect(frame.locator(".tiptap")).toBeFocused();
    }
    await frame.locator(".tiptap").fill("A retained sentence");
    await frame.locator(".tiptap").evaluate((el) => {
      const range = document.createRange();
      range.setStart(el.querySelector("p")!.firstChild!, 0);
      range.collapse(true);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await frame.locator(".tiptap").pressSequentially("## ");
    await expect(frame.locator("h3 .tiptap")).toHaveText("A retained sentence");
    await expect
      .poll(() => f.current().content.find((b) => b.id === f.text)?.level)
      .toBe(2);
    if (width === 1440) {
      if (
        !(await page.locator(".editor-outline .outline-subheading").isVisible())
      )
        await page
          .getByRole("button", {
            name: /^Expand (Pages|Sections) sidebar$/,
            exact: true,
          })
          .click();
      await expect(
        page.locator(".editor-outline .outline-subheading"),
      ).toHaveCount(1);
      await expect(
        page.locator('.editor-outline [aria-label^="Drag section"]'),
      ).toHaveCount(1);
      const pages = page.getByRole("dialog", {
        name: /^(Pages|Sections)$/,
        exact: true,
      });
      if (await pages.isVisible())
        await pages.getByRole("button", { name: "Done", exact: true }).click();
    }
    const pricing = page.locator(`[data-block-id="block-${f.pricing}"]`);
    await pricing.click();
    await expect
      .poll(async () => (await bar.boundingBox())!.height)
      .toBeCloseTo(barHeight, 2);
    const handles = pricing.locator(".document-quote .drag-handle");
    expect(await handles.count()).toBeGreaterThan(0);
    for (const handle of await handles.all()) {
      await handle.scrollIntoViewIfNeeded();
      await handle.focus();
      await expect(handle).toBeVisible();
      const geometry = await handle.evaluate((el) => {
        const h = el.getBoundingClientRect(),
          p = el.parentElement!,
          card = p
            .querySelector(
              ":scope > .flow-quote-line,:scope > .flow-choice-group",
            )!
            .getBoundingClientRect();
        const overlaps = (b: DOMRect) =>
          h.left < b.right &&
          h.right > b.left &&
          h.top < b.bottom &&
          h.bottom > b.top;
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let node;
        let intersects = false;
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest("button")) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          if (Array.from(range.getClientRects()).some(overlaps))
            intersects = true;
        }
        intersects ||= Array.from(p.querySelectorAll("input")).some((e) =>
          overlaps(e.getBoundingClientRect()),
        );
        return {
          inside:
            h.left >= card.left &&
            h.right <= card.right &&
            h.top >= card.top &&
            h.bottom <= card.bottom,
          intersects,
          opacity: getComputedStyle(el).opacity,
        };
      });
      expect(geometry).toEqual({
        inside: true,
        intersects: false,
        opacity: "1",
      });
    }
    const beforeOrder = f.current().quote[0].id;
    const groupHandle = pricing.getByRole("button", {
      name: "Drag document choice group",
      exact: true,
    });
    await groupHandle.focus();
    await groupHandle.press("Space");
    await expect(groupHandle).toHaveAttribute("aria-pressed", "true");
    // dnd-kit attaches its keyboard sensor after activation; wait for the
    // rendered drag geometry before moving, as in the shared editor checks.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.keyboard.press("ArrowDown");
    const target = f.current().quote.find((i) => !i.choice_group_id)!.id;
    await expect(
      page
        .locator('[id^="DndLiveRegion"]')
        .filter({ hasText: `over droppable area ${target}.` }),
    ).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(groupHandle).not.toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => f.current().quote[0].id).not.toBe(beforeOrder);
    await openEditorPanel(page, "Styles");
    const styles = page.getByRole("region", {
      name: "Proposal styles",
      exact: true,
    });
    await styles.getByText("Text styles", { exact: true }).click();
    await styles
      .getByRole("spinbutton", { name: "Title size (px)", exact: true })
      .fill("44");
    await expect.poll(() => f.current().style_overrides?.title?.size).toBe(44);
    if (width === 375)
      await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".editor-paper .document-cover h1")).toHaveCSS(
      "font-size",
      "44px",
    );
    const editorHeading = await frame.locator("h3").evaluate((el) => ({
      size: getComputedStyle(el).fontSize,
      font: getComputedStyle(el).fontFamily,
      colour: getComputedStyle(el).color,
    }));
    await page.goto(`/p/${f.draft.id}?preview=1`);
    await expect(page.locator("#proposal-document h1")).toHaveCSS(
      "font-size",
      "44px",
    );
    expect(
      await page
        .locator(`[data-document-block="${f.text}"] h3`)
        .evaluate((el) => ({
          size: getComputedStyle(el).fontSize,
          font: getComputedStyle(el).fontFamily,
          colour: getComputedStyle(el).color,
        })),
    ).toEqual(editorHeading);
  });
}
test("resolved styles reach the PDF and editor pagination, without changing old versions", async ({
  page,
}) => {
  const f = await fixture(page),
    paragraphs: Block[] = Array.from({ length: 34 }, (_, n) => ({
      id: crypto.randomUUID(),
      type: "paragraph",
      text: `Paragraph ${n + 1}. ${"Shared reading and print styles. ".repeat(10)}`,
    }));
  const active = f.current();
  await f.service.edit(
    active.id,
    {
      revision: active.revision,
      content: [...active.content.slice(0, 1), ...paragraphs],
      style_overrides: {
        title: { font: "inter", size: 46 },
        heading1: { size: 32, colour: "#123456" },
        body: { size: 21, space_below: 15 },
      },
    },
    staff,
  );
  await openDocument(page, 1440, active.id);
  const count = page.locator(".document-page-count");
  await expect(count).toHaveAttribute("data-page-count", /[0-9]+/);
  const p = await f.service.forRead((await f.repo.get(active.id))!);
  const version = {
    id: crypto.randomUUID(),
    version_no: 1,
    content: p.content,
    quote: p.quote,
    variables_resolved: variables(p),
    content_hash: "",
    pagination: JSON.parse(
      (await page.locator(".editor-paper").getAttribute("data-pagination"))!,
    ),
    resolved_styles: freezeStyles(
      f.settings,
      p.template_style_overrides,
      p.style_overrides,
    ),
    created_at: p.created_at,
    frozen: false,
  };
  version.content_hash = versionHash(version);
  const pdf = await sealedPdf(version, [], [], p.currency, {
    settings: f.settings,
    document: { id: p.id, title: p.title },
  });
  expect((await PDFDocument.load(pdf.pdf)).getPageCount()).toBe(
    Number(await count.getAttribute("data-page-count")),
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(pdf.body),
    useSystemFonts: true,
  });
  const doc = await loading.promise;
  const first = await (await doc.getPage(1)).getTextContent();
  const title = first.items.find((i) => "str" in i && i.str === p.title) as any,
    body = first.items.find(
      (i) => "str" in i && i.str.startsWith("Paragraph 1."),
    ) as any;
  expect(title.height).toBeCloseTo(46 * 0.75, 1);
  expect(body.height).toBeCloseTo(21 * 0.75, 1);
  const normal = {
    ...version,
    pagination: undefined,
    resolved_styles: freezeStyles(f.settings),
  };
  normal.content_hash = versionHash(normal);
  const smaller = await sealedPdf(normal, [], [], p.currency, {
    settings: f.settings,
    document: { id: p.id, title: p.title },
  });
  expect((await PDFDocument.load(pdf.body)).getPageCount()).toBeGreaterThan(
    (await PDFDocument.load(smaller.body)).getPageCount(),
  );
  await loading.destroy();
});
test("Workspace and templates save style overrides and show responsive live samples", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=styles");
  const styles = page.getByRole("region", {
    name: "Proposal styles",
    exact: true,
  });
  await styles
    .getByRole("combobox", { name: "Text level", exact: true })
    .selectOption("heading2");
  await styles
    .getByRole("combobox", { name: "Heading 2 font", exact: true })
    .selectOption("lora");
  const size = styles.getByRole("spinbutton", {
    name: "Heading 2 size (px)",
    exact: true,
  });
  await size.fill("");
  await size.pressSequentially("26");
  await expect(size).toHaveValue("26");
  await styles
    .getByRole("spinbutton", { name: "Heading 2 weight", exact: true })
    .fill("700");
  await styles.getByRole("button", { name: "Custom", exact: true }).click();
  await styles.getByLabel("Custom color", { exact: true }).fill("#123456");
  await styles.getByText("Typography details", { exact: true }).click();
  await styles
    .getByRole("combobox", { name: "Letter case", exact: true })
    .selectOption("uppercase");
  await styles
    .getByRole("spinbutton", {
      name: "Heading 2 letter spacing (em)",
      exact: true,
    })
    .fill("0.025");
  await styles
    .getByRole("spinbutton", {
      name: "Heading 2 space above (px)",
      exact: true,
    })
    .fill("42");
  await styles
    .getByRole("spinbutton", {
      name: "Heading 2 space below (px)",
      exact: true,
    })
    .fill("18");
  const sample = styles.locator(".style-sample h3");
  await expect(sample).toHaveCSS("font-size", "26px");
  await expect(sample).toHaveCSS("font-family", /Lora/);
  await expect(sample).toHaveCSS("text-transform", "uppercase");
  await expect(sample).toHaveCSS("margin-top", "42px");
  await styles.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(styles.locator(".style-preview-viewport")).toHaveAttribute(
    "data-width",
    "phone",
  );

  await expect
    .poll(
      async () =>
        (await f.repo.entities<any>("workspace_settings"))[0].proposal_styles
          ?.heading2?.size,
    )
    .toBe(26);
  await styles
    .getByRole("button", { name: "Reset to defaults", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Reset to defaults?" })
    .getByRole("button", { name: "Reset to defaults", exact: true })
    .click();
  await expect(
    styles.getByRole("spinbutton", {
      name: "Heading 2 size (px)",
      exact: true,
    }),
  ).toHaveValue("17");
  await page.goto(`/studio/templates/${f.template.id}`);
  if (
    await page
      .getByRole("button", { name: "Open Styles", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open Styles", exact: true })
      .click();
  else await page.getByRole("tab", { name: "Styles", exact: true }).click();
  const templateStyles = page.getByRole("region", {
    name: "Proposal styles",
    exact: true,
  });
  await templateStyles.getByText("Text styles", { exact: true }).click();
  await templateStyles
    .getByRole("combobox", { name: "Text level", exact: true })
    .selectOption("heading3");
  await templateStyles
    .getByRole("spinbutton", { name: "Heading 3 size (px)", exact: true })
    .fill("23");
  await expect(
    page.locator(".template-editor-header .editor-save-status"),
  ).toHaveText("Saved · changes apply to new proposals");
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates")).find(
          (t) => t.id === f.template.id,
        )?.style_overrides?.heading3?.size,
    )
    .toBe(23);
  const paragraph = page.locator(".studio-block-card").nth(1);
  await paragraph.click();
  await paragraph.locator(".tiptap").fill("###");
  await paragraph.locator(".tiptap").press("Space");
  await expect(paragraph.locator(".tiptap")).toBeFocused();
  await paragraph.locator(".tiptap").fill("Template detail");
  await expect(
    page
      .getByRole("toolbar", {
        name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
        exact: true,
      })
      .locator(".text-style-label"),
  ).toHaveText("Heading 3");
  await expect(
    page.locator(".template-editor-header .editor-save-status"),
  ).toHaveText("Saved · changes apply to new proposals");
  await expect
    .poll(
      async () =>
        (await f.repo.entities<Template>("templates")).find(
          (t) => t.id === f.template.id,
        )?.content[1].level,
    )
    .toBe(3);
});
