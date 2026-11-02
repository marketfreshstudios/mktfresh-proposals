import { test, expect, type Page } from "@playwright/test";
import { setup, staff } from "../tests/helpers";
import type { Block, Proposal } from "../src/lib/model";
import { pdfPreview, type PdfPreview } from "../src/lib/pdf-preview";
import { previewResult } from "../src/lib/preview";
async function fixture(page: Page, long = false) {
  page.setDefaultTimeout(10000);
  const f = await setup(),
    id = crypto.randomUUID();
  const content: Block[] = [
    {
      id: crypto.randomUUID(),
      type: "heading",
      level: 1,
      text: "The approach",
    },
    {
      id,
      type: "paragraph",
      text: "Hello Jane. We build thoughtful things together.",
    },
    ...(long
      ? Array.from({ length: 22 }, (_, n) => ({
          id: crypto.randomUUID(),
          type: "paragraph" as const,
          text: `Paragraph ${n + 1}. ${"A clear plan and careful work lead to a useful result. ".repeat(24)}`,
        }))
      : []),
    { id: crypto.randomUUID(), type: "page_break" },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "Next steps and milestones.",
    },
    ...(long
      ? [
          {
            id: crypto.randomUUID(),
            type: "contract" as const,
            text: "Terms",
            clauses: [
              {
                id: crypto.randomUUID(),
                heading: "Working together",
                body: Array.from(
                  { length: 75 },
                  (_, n) =>
                    `Clause line ${n + 1}. Plain terms for this project.`,
                ).join("\n"),
                show_when: null,
              },
            ],
          },
        ]
      : []),
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  let active = await f.service.edit(
    f.draft.id,
    { revision: f.draft.revision, content },
    staff,
  );
  const results: PdfPreview[] = [];
  const writes: string[] = [];
  await f.repo.put("workspace_documents", {
    id: crypto.randomUUID(),
    name: "Pricing playbook",
    version: "v1",
    content: "Hosting and support\nCustom work needs review",
    content_hash: "a".repeat(64),
    source_type: "pasted",
  } as any);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings: f.settings,
          staff: f.members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (req.method() === "PATCH") {
          writes.push("edit");
          active = await f.service.edit(active.id, req.postDataJSON(), staff);
        }
        if (parts[2] === "preview-pdf") {
          const p =
            req.method() === "POST"
              ? { ...active, ...req.postDataJSON() }
              : active;
          const result = await pdfPreview(
            f.repo,
            {
              put: async () => {
                throw new Error("Preview wrote a file");
              },
              get: async () => new Uint8Array(),
            },
            p,
            f.settings,
          );
          results.push(result);
          if (req.method() === "GET") {
            await route.fulfill({
              body: Buffer.from(result.pdf_base64, "base64"),
              contentType: "application/pdf",
            });
            return;
          }
          value = result;
        } else if (parts[2] === "preview")
          value = previewResult(active, f.settings);
        else value = parts[1] ? active : { items: [active], total: 1 };
      } else value = await f.repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  return { ...f, id, current: () => active, results, writes };
}
async function fields(page: Page) {
  if (
    !(await page.getByRole("tab", { name: "Fields", exact: true }).isVisible())
  )
    await page
      .getByRole("button", { name: "Toggle right panel", exact: true })
      .click();
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  return page.locator(".field-options").filter({ visible: true });
}
test("one-line icon formatting, fixed Letter paper, panel preferences and overlays at all requested widths", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  for (const width of [1440, 1100, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const text = page.locator(`[data-block-id="block-${f.id}"] .tiptap`);
    await text.click();
    const bar = page.getByRole("toolbar", {
      name: "Document formatting",
      exact: true,
    });
    const rows = await bar
      .locator(".formatting-button,select")
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: r.top, height: r.height };
        }),
      );
    expect(
      Math.max(...rows.map((r) => r.top)) - Math.min(...rows.map((r) => r.top)),
    ).toBeLessThanOrEqual(1);
    expect(await bar.locator(".formatting-label").first().isVisible()).toBe(
      false,
    );
    await expect(
      bar.getByRole("button", { name: "Bold", exact: true }),
    ).toHaveAttribute("title", /Bold \(/);
    const paper = page.locator(".editor-paper");
    expect(await paper.evaluate((e) => (e as HTMLElement).offsetWidth)).toBe(
      816,
    );
    expect(
      parseFloat(await paper.evaluate((e) => getComputedStyle(e).paddingLeft)),
    ).toBeCloseTo((18 * 96) / 25.4, 2);
    expect(
      await paper.evaluate((e) => e.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(width);
    if (width === 768) {
      await expect(page.getByLabel("Editor zoom")).not.toHaveText("100%");
      await page.getByRole("button", { name: "100%", exact: true }).click();
      await expect(page.getByLabel("Editor zoom")).toHaveText("100%");
      await page.getByRole("button", { name: "Fit", exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Toggle right panel", exact: true })
    .click();
  await expect(page.locator(".editor-sidepanel")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".editor-sidepanel")).toHaveCount(0);
  await expect(page.locator(".quote-workspace")).toHaveAttribute(
    "data-panels-ready",
    "true",
  );
  await page.keyboard.press("Control+Backslash");
  await expect(page.locator(".editor-sidepanel")).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle Sections sidebar", exact: true })
    .click();
  await expect(page.locator(".editor-outline")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".editor-outline")).toHaveCount(0);
  await page.setViewportSize({ width: 768, height: 1000 });
  await page
    .getByRole("button", { name: "Toggle Sections sidebar", exact: true })
    .click();
  const sections = page.getByRole("dialog", { name: "Sections", exact: true });
  await expect(sections).toBeVisible();
  await sections
    .getByRole("button", { name: "01 The approach", exact: true })
    .click();
  await expect(sections).toHaveCount(0);
});
test("Fields tab remembers cursor across tabs and closes tablet drawer before restoring text focus; pricing references remain searchable", async ({
  page,
}) => {
  const f = await fixture(page);
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    const text = page.locator(`[data-block-id="block-${f.id}"] .tiptap`);
    await text.fill("Hello friend.");
    await text.click();
    await text.evaluate((el) => {
      const r = document.createRange();
      r.setStart(el.querySelector("p")!.firstChild!, 6);
      r.setEnd(el.querySelector("p")!.firstChild!, 12);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
    const panel = await fields(page);
    await expect(panel).toContainText("{{client.first_name}}");
    await panel
      .getByRole("button", {
        name: "Client first name — {{client.first_name}}",
        exact: true,
      })
      .click();
    await expect(text).toBeFocused();
    await expect(text.locator('[data-field="client.first_name"]')).toHaveText(
      "Jane",
    );
    await expect(
      page.getByRole("tab", { name: "Pricing reference", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".editor-outline .field-options")).toHaveCount(0);
    if (
      !(await page.getByRole("tab", { name: "Quote", exact: true }).isVisible())
    )
      await page
        .getByRole("button", { name: "Toggle right panel", exact: true })
        .click();
    await page.getByRole("tab", { name: "Quote", exact: true }).click();
    await page
      .getByRole("button", { name: "Look up", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const ref = page.getByRole("dialog", {
      name: "Pricing reference",
      exact: true,
    });
    await expect(ref).toBeVisible();
    await ref
      .getByRole("searchbox", { name: "Search reference" })
      .fill("Hosting");
    await expect(ref.locator("pre")).toHaveText("Hosting and support");
    await ref.getByRole("button", { name: "Done", exact: true }).click();
    if (width === 768)
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Done", exact: true })
        .click();
  }
});
test("actual preview PDF and every editor marker use the server's page starts, with no sealing or file writes", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await fixture(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".document-page-count")).toHaveAttribute(
    "data-document-pages",
    /\d+/,
  );
  const result = f.results.at(-1)!;
  expect(result.layout.pages).toBeGreaterThan(3);
  const markers = await page
    .locator('.page-guide[data-approximate="false"]')
    .evaluateAll((els) =>
      els.map((e) => ({
        page: Number((e as HTMLElement).dataset.page),
        block: (e as HTMLElement).dataset.block,
        offset: Number((e as HTMLElement).dataset.offset),
        line: (e as HTMLElement).dataset.lineStart,
      })),
    );
  expect(markers).toEqual(
    result.layout.boundaries.map((b) => ({
      page: b.page,
      block: b.block,
      offset: b.offset,
      line: b.start_text,
    })),
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(Buffer.from(result.pdf_base64, "base64")),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  expect(pdf.numPages).toBe(result.layout.pages);
  for (const b of result.layout.boundaries) {
    const content = await (await pdf.getPage(b.page)).getTextContent();
    const value = content.items
      .map((i) => ("str" in i ? i.str : ""))
      .join("")
      .replace(/\s/g, "")
      .replaceAll("Preview—notsigned", "");
    expect(
      value.startsWith(b.start_text!.replace(/\s/g, "").slice(0, 70)),
    ).toBe(true);
  }
  // Check the actual displayed line anchor, not just copied layout metadata.
  for (const boundary of result.layout.boundaries.filter(
    (b) => b.offset > 0 && !b.unit && !b.part,
  )) {
    const delta = await page
      .locator(`[data-block-id="block-${boundary.block}"] .block-content`)
      .evaluate((el, b) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        let offset = b.offset;
        while ((node = walker.nextNode())) {
          if (offset <= (node.textContent?.length ?? 0)) {
            const r = document.createRange();
            r.setStart(node, offset);
            r.setEnd(node, Math.min(offset + 1, node.textContent!.length));
            const marker = document.querySelector<HTMLElement>(
              `.page-guide[data-page="${b.page}"]`,
            )!;
            const paper = document.querySelector<HTMLElement>(".editor-paper")!;
            const scale =
              paper.getBoundingClientRect().width / paper.offsetWidth;
            return Math.abs(
              marker.getBoundingClientRect().top +
                6 * scale -
                r.getBoundingClientRect().top,
            );
          }
          offset -= node.textContent?.length ?? 0;
        }
        throw new Error("Page start outside block");
      }, boundary);
    expect(delta).toBeLessThanOrEqual(1);
  }
  const clauseStarts = result.layout.boundaries.filter(
    (b) => b.part && b.part_offset! > 0,
  );
  expect(clauseStarts.length).toBeGreaterThan(0);
  for (const b of clauseStarts) {
    const prefix = b.start_text!.slice(0, 50);
    const delta = await page
      .locator(`[data-block-id="clause-${b.part}"] p`)
      .evaluate(
        (el, { prefix, page }) => {
          const node = el.firstChild!,
            raw = node.textContent!,
            normalized = raw.replace(/\n/g, ""),
            found = normalized.indexOf(prefix);
          if (found < 0) throw new Error("PDF line absent from clause");
          let at = 0,
            count = 0;
          while (at < raw.length && count < found) {
            if (raw[at] !== "\n") count++;
            at++;
          }
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + 1);
          const paper = document.querySelector<HTMLElement>(".editor-paper")!,
            scale = paper.getBoundingClientRect().width / paper.offsetWidth;
          return Math.abs(
            document
              .querySelector(`.page-guide[data-page="${page}"]`)!
              .getBoundingClientRect().top +
              6 * scale -
              r.getBoundingClientRect().top,
          );
        },
        { prefix, page: b.page },
      );
    expect(delta).toBeLessThanOrEqual(1);
  }
  const firstText = (await (await pdf.getPage(1)).getTextContent()).items
    .map((i) => ("str" in i ? i.str : ""))
    .join("")
    .replace(/\s/g, "");
  expect(firstText).toContain("Preview—notsigned");
  expect(firstText).not.toContain("Certificateofcompletion");
  const before = JSON.stringify(await f.repo.get(f.draft.id));
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Preview PDF", exact: true });
  await expect(
    viewer.getByRole("navigation", { name: "Page thumbnails" }),
  ).toBeVisible();
  await expect(viewer.locator("main canvas")).toHaveCount(pdf.numPages);
  await expect
    .poll(() =>
      viewer
        .locator("main canvas")
        .first()
        .evaluate((el) => {
          const canvas = el as HTMLCanvasElement,
            bytes = canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data;
          for (let n = 0; n < bytes.length; n += 64)
            if (
              bytes[n + 3] > 0 &&
              bytes[n] < 200 &&
              bytes[n + 1] < 200 &&
              bytes[n + 2] < 200
            )
              return true;
          return false;
        }),
    )
    .toBe(true);
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(viewer.getByLabel("PDF zoom")).toHaveText("125%");
  await expect(
    viewer.getByRole("link", { name: "Download preview", exact: true }),
  ).toHaveAttribute("href", /^blob:/);
  await expect(
    viewer.getByRole("link", { name: "Open in new tab", exact: true }),
  ).toHaveAttribute("href", /^blob:/);
  expect(JSON.stringify(await f.repo.get(f.draft.id))).toBe(before);
  expect(f.current().files).toHaveLength(0);
  expect(f.current().jobs).toHaveLength(0);
  await viewer
    .getByRole("button", { name: "Close PDF preview", exact: true })
    .click();
  await loading.destroy();
});
