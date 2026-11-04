import { pageMetrics, resolveStyles } from "../src/lib/proposal-styles";
import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
test("browser pages appear without PDF requests and explicit break action is undoable", async ({
  page,
}) => {
  const f = await editorFixture(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const sheets = page.locator(".editor-paper .page-sheet");
  await expect.poll(() => sheets.count()).toBeGreaterThan(3);
  expect(f.calls).toHaveLength(0);
  const paragraph = page.locator(
    `[data-block-id="block-${f.content[1].id}"] .tiptap`,
  );
  await paragraph.click();
  await page
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Start on next page", exact: true })
    .click();
  await expect
    .poll(
      () => f.active().content.filter((b) => b.type === "page_break").length,
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Remove page break", exact: true }),
  ).toBeEnabled();
  await page
    .locator(".editor-v2-header, :is(.editor-edit-bar,.phone-formatting-bar)")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(() => f.active().content.map((b) => b.id))
    .toEqual(f.content.map((b) => b.id));
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  expect(f.calls[0].pagination.pages).toBe(await sheets.count());
  expect(f.renders[0].layout.overflow_pages).toEqual([]);
});

test("Enter pushes a bottom heading to its next sheet within the next animation frame without a PDF request", async ({
  page,
}) => {
  const id = () => crypto.randomUUID();
  const content: import("../src/lib/model").Block[] = [
    { id: id(), type: "paragraph", text: "An opening paragraph." },
    { id: id(), type: "heading", level: 1, text: "Bottom heading" },
  ];
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper"),
    heading = paper.locator(`[data-block-id="block-${content[1].id}"]`);
  await expect(paper).toHaveAttribute("data-pagination", /starts/);
  const metrics = pageMetrics(
    resolveStyles(
      f.settings,
      f.active().template_style_overrides,
      f.active().style_overrides,
    ),
  );
  const gap = await heading.evaluate((el, metrics) => {
    const root = el.closest<HTMLElement>(".editor-paper")!;
    // Fixture calibration uses the canonical Letter measure, never the responsive sheet.
    const clone = root.cloneNode(true) as HTMLElement;
    clone.dataset.pageMeasurement = "true";
    Object.assign(clone.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      visibility: "hidden",
      pointerEvents: "none",
      transform: "none",
      display: "block",
    });
    for (const [key, value] of Object.entries({
      width: `${metrics.width}px`,
      minWidth: `${metrics.width}px`,
      maxWidth: "none",
      minHeight: "0px",
      height: "auto",
      padding: `${metrics.margins.top * 96}px ${metrics.margins.right * 96}px ${metrics.margins.bottom * 96}px ${metrics.margins.left * 96}px`,
    }))
      clone.style.setProperty(
        key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
        value,
        "important",
      );
    clone
      .querySelectorAll(
        "style,[data-pagination-spacer],.editor-page-sheets,.document-page-count",
      )
      .forEach((n) => n.remove());
    clone.querySelectorAll<HTMLElement>("[data-layout-space]").forEach((n) => {
      n.style.removeProperty("margin-top");
      delete n.dataset.layoutSpace;
    });
    clone
      .querySelectorAll<HTMLElement>(
        ".quote-sortable,.document-section,:scope > div",
      )
      .forEach((n) => {
        n.style.transform = "none";
        n.style.setProperty("display", "block", "important");
      });
    root.parentElement!.append(clone);
    try {
      return (
        978 -
        (clone
          .querySelector(
            `[data-block-id="${el.getAttribute("data-block-id")}"]`,
          )!
          .getBoundingClientRect().bottom -
          clone.getBoundingClientRect().top)
      );
    } finally {
      clone.remove();
    }
  }, metrics);
  // Put the real heading within one blank line of the margin, independent of host font metrics.
  await page.addStyleTag({
    content: `[data-block-id="block-${content[0].id}"] > .block-content{padding-bottom:${gap}px!important}`,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect
    .poll(
      async () =>
        JSON.parse((await paper.getAttribute("data-pagination"))!).pages,
    )
    .toBe(1);
  const input = heading.locator("textarea");
  await input.focus();
  await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  await input.press("Enter");
  const result = await paper.evaluate(
    (root) =>
      new Promise<any>((resolve) =>
        requestAnimationFrame(() =>
          resolve(JSON.parse((root as HTMLElement).dataset.pagination!)),
        ),
      ),
  );
  expect(result.pages).toBe(2);
  expect(result.starts[0].block).toBe(content[1].id);
  expect(f.calls).toHaveLength(0);
});

test("PDF page starts are the browser source positions (pdftotext), and print uses the frozen plan", async ({
  page,
}, testInfo) => {
  const f = await editorFixture(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper");
  await expect(paper).toHaveAttribute("data-pagination", /starts/);
  const plan = JSON.parse(
    (await paper.getAttribute("data-pagination"))!,
  ) as import("../src/lib/page-plan").PagePlan;
  const expected = await paper.evaluate(
    (root, starts) =>
      starts.map((s) => {
        const block = root.querySelector(
          `[data-block-id="block-${s.block}"] > .block-content`,
        )!;
        const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) =>
            n.parentElement?.closest(
              ":is(.editor-edit-bar,.phone-block-actions),.drag-handle,textarea,.rich-toolbar,.document-edit-item,.sr-only,[data-pagination-spacer],.block-insert,style",
            )
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        });
        let text = "",
          n;
        while ((n = walk.nextNode())) text += n.textContent;
        return text.slice(s.offset).trim().slice(0, 55).replace(/\s/g, "");
      }),
    plan.starts,
  );
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const { writeFile } = await import("node:fs/promises"),
    { execFileSync } = await import("node:child_process");
  const file = testInfo.outputPath("source-pages.pdf");
  await writeFile(file, Buffer.from(f.renders[0].pdf_base64, "base64"));
  const pages = execFileSync("pdftotext", ["-raw", file, "-"], {
    encoding: "utf8",
  })
    .split("\f")
    .filter((s) => s.trim());
  expect(pages).toHaveLength(plan.pages);
  for (const [n, text] of expected.entries())
    expect(
      pages[n + 1].replace(/\s/g, "").replaceAll("Preview—notsigned", ""),
    ).toMatch(new RegExp("^" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page
    .getByRole("button", { name: "Close PDF preview", exact: true })
    .click();
  // Save then open the exact client print projection; it carries the same source plan.
  await page.locator("#cover-title").fill("Print source");
  await expect.poll(() => f.active().pagination?.pages).toBe(plan.pages);
  await page.goto(`/p/${f.draft.id}?preview=1`);
  await expect
    .poll(() => page.locator(".client-print-projection .planned-sheet").count())
    .toBe(plan.pages);
});

test("computed sidebar lists overflow sections and a pointer drop to page 3 moves the whole section with exact undo", async ({
  page,
}) => {
  const id = () => crypto.randomUUID(),
    content: import("../src/lib/model").Block[] = [];
  for (let n = 0; n < 3; n++) {
    if (n) content.push({ id: id(), type: "page_break" });
    content.push(
      { id: id(), type: "heading", text: `Section ${n + 1}`, level: 1 },
      { id: id(), type: "paragraph", text: `Body ${n + 1}` },
    );
  }
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const nav = page.getByRole("navigation", { name: "Sections", exact: true });
  await expect(
    nav
      .locator('[data-outline-page="3"]')
      .getByRole("button", { name: "Section 3", exact: true }),
  ).toBeVisible();
  const from = nav.getByRole("button", {
      name: "Drag section Section 1",
      exact: true,
    }),
    to = nav.locator('[data-outline-page="3"] .outline-page-title');
  const a = (await from.boundingBox())!,
    b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, {
    steps: 4,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(() => f.active().content.map((b) => b.id))
    .not.toEqual(content.map((b) => b.id));
  await expect(
    nav
      .locator('[data-outline-page="3"]')
      .getByRole("button", { name: "Section 1", exact: true }),
  ).toBeVisible();
  expect(f.active().content.length).toBe(content.length);
  expect(new Set(f.active().content.map((b) => b.id)).size).toBe(
    content.length,
  );
  await page.keyboard.press("Control+z");
  await expect.poll(() => f.active().content).toEqual(content);
});

test("choice groups, signatures and a fitting pricing table stay on one sheet, and styles repaginate without a server request", async ({
  page,
}) => {
  const id = () => crypto.randomUUID(),
    group = id();
  const content: import("../src/lib/model").Block[] = [
    {
      id: id(),
      type: "paragraph",
      text: "An introduction with some detail. ".repeat(140),
    },
    { id: id(), type: "pricing_table" },
    { id: id(), type: "signature_block", role: "client" },
    { id: id(), type: "signature_block", role: "company" },
  ];
  const f = await editorFixture(page, false, {
    content,
    quote: (base) =>
      Array.from({ length: 9 }, (_, n) => ({
        ...structuredClone(base[0]),
        id: id(),
        name: `Product ${n + 1}`,
        description: "A compact useful service with clear deliverables.",
        order: n,
        optional: n < 2,
        default_selected: n !== 1,
        selected: n !== 1,
        choice_group_id: n < 2 ? group : null,
        sublines: base[0].sublines.map((s) => ({ ...s, id: id() })),
      })),
  });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper");
  await expect(paper).toHaveAttribute("data-pagination", /starts/);
  const geometry = await paper.evaluate((root) => {
    // Normalize display-only responsive sheet coordinates into the existing
    // PDF page coordinate frame. The keep-together assertions below are unchanged.
    const sheets = Array.from(
      root.querySelectorAll<HTMLElement>(".page-sheet"),
    );
    const position = (value: number) => {
      const n = sheets.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return value >= r.top - 0.5 && value <= r.bottom + 0.5;
      });
      if (n < 0) return NaN;
      const el = sheets[n],
        r = el.getBoundingClientRect(),
        s = getComputedStyle(el);
      const top = parseFloat(s.paddingTop),
        bottom = parseFloat(s.paddingBottom);
      return (
        n * 1080 +
        72 +
        ((value - r.top - top) * 912) / (r.height - top - bottom)
      );
    };
    return Array.from(
      root.querySelectorAll(".flow-choice-group,.editor-signature"),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: position(r.top), bottom: position(r.bottom) };
    });
  });
  for (const box of geometry) {
    expect(Math.floor((box.top - 72) / 1080)).toBe(
      Math.floor((box.bottom - 72 - 0.5) / 1080),
    );
    expect(box.bottom % 1080).toBeLessThanOrEqual(984);
  }
  const before = await paper.getAttribute("data-pagination");
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Page & margins", { exact: true }).click();
  await page.getByRole("button", { name: "Comfortable", exact: true }).click();
  await expect
    .poll(() => paper.getAttribute("data-pagination"))
    .not.toBe(before);
  expect(f.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  for (const start of f.calls[0].pagination.starts.filter(
    (s: any) => s.block !== content[0].id,
  ))
    expect(start.offset).toBe(0);
  expect(f.renders[0].layout.overflow_pages).toEqual([]);
});

test("list line breaks and blank paragraphs preserve all text in editor and PDF", async ({
  page,
}, testInfo) => {
  const id = () => crypto.randomUUID(),
    content: import("../src/lib/model").Block[] = [
      {
        id: id(),
        type: "paragraph",
        content: {
          type: "doc",
          content: [
            { type: "paragraph" },
            ...Array.from({ length: 55 }, (_, n) => ({
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Paragraph ${n + 1}: a small useful detail.`,
                },
              ],
            })),
            {
              type: "orderedList",
              content: Array.from({ length: 35 }, (_, n) => ({
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: `List detail ${n + 1}: ${"Careful work creates a clear result. ".repeat(3)}`,
                      },
                    ],
                  },
                ],
              })),
            },
          ],
        },
      },
    ];
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = page.locator(".editor-paper");
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await paper.getAttribute("data-pagination")) ?? '{"pages":1}',
        ).pages,
    )
    .toBeGreaterThan(3);
  const original = JSON.stringify(f.active().content);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const { writeFile } = await import("node:fs/promises"),
    { execFileSync } = await import("node:child_process");
  const path = testInfo.outputPath("list-pages.pdf");
  await writeFile(path, Buffer.from(f.renders[0].pdf_base64, "base64"));
  const text = execFileSync("pdftotext", ["-raw", path, "-"], {
    encoding: "utf8",
  });
  expect(text.replace(/\s/g, " ").replaceAll(" ", "")).toContain(
    "Paragraph55:",
  );
  expect(text.replace(/\s/g, "")).toContain("Listdetail35:");
  expect(f.renders[0].layout.overflow_pages).toEqual([]);
  expect(text.split("\f").filter((s) => s.trim())).toHaveLength(
    f.calls[0].pagination.pages,
  );
  expect(JSON.stringify(f.active().content)).toBe(original);
});

test("a PDF overflow remains visible, warns readiness and never drops the end of the content", async ({
  page,
}, testInfo) => {
  const f = await editorFixture(page, true);
  const { pdfPreview } = await import("../src/lib/pdf-preview");
  const result = await pdfPreview(
    f.repo,
    {
      get: async () => new Uint8Array(),
      put: async () => {
        throw new Error("No writes");
      },
    },
    { ...f.active(), pagination: { format: 1, pages: 1, starts: [] } },
    f.settings,
  );
  expect(result.layout.overflow_pages).toEqual([1]);
  const { writeFile } = await import("node:fs/promises"),
    { execFileSync } = await import("node:child_process");
  const path = testInfo.outputPath("overflow.pdf");
  await writeFile(path, Buffer.from(result.pdf_base64, "base64"));
  const text = execFileSync("pdftotext", ["-raw", path, "-"], {
    encoding: "utf8",
  });
  expect(text.replace(/\s/g, "")).toContain("Nextsteps.");
  expect(text.replace(/\s/g, "")).toContain("CLIENTJaneDoe");
  expect(text.split("\f").filter((s) => s.trim()).length).toBeGreaterThan(1);
});

test("overflow page 3 is a real section drop target, preserving original blocks and undo", async ({
  page,
}) => {
  const id = () => crypto.randomUUID(),
    content: import("../src/lib/model").Block[] = [
      { id: id(), type: "heading", text: "Overview", level: 1 },
      { id: id(), type: "paragraph", text: "A short introduction." },
      { id: id(), type: "heading", text: "Scope", level: 1 },
      {
        id: id(),
        type: "paragraph",
        text: "A careful and useful service. ".repeat(450),
      },
      { id: id(), type: "heading", text: "Closing", level: 1 },
      { id: id(), type: "paragraph", text: "Ready to begin." },
    ];
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const nav = page.getByRole("navigation", { name: "Sections", exact: true }),
    paper = page.locator(".editor-paper");
  await expect(
    nav
      .locator('[data-outline-page="3"]')
      .getByRole("button", { name: "Scope (continued)", exact: true }),
  ).toHaveCount(0);
  const from = nav.getByRole("button", {
      name: "Drag section Overview",
      exact: true,
    }),
    to = nav.locator('[data-outline-page="3"] .outline-page-title');
  const a = (await from.boundingBox())!,
    b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, {
    steps: 4,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 20 });
  await page.mouse.up();
  await expect(
    nav
      .locator('[data-outline-page="3"]')
      .getByRole("button", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      f
        .active()
        .content.filter((b) => b.type !== "page_break")
        .map((b) => b.id),
    )
    .not.toEqual(content.map((b) => b.id));
  expect(
    f
      .active()
      .content.filter((b) => b.type !== "page_break")
      .map((b) => b.id)
      .sort(),
  ).toEqual(content.map((b) => b.id).sort());
  for (const block of content)
    expect(f.active().content.find((b) => b.id === block.id)).toEqual(block);
  await page.keyboard.press("Control+z");
  await expect.poll(() => f.active().content).toEqual(content);
  const before = await paper.getAttribute("data-pagination");
  await page.locator("#cover-title").fill("Intermediate");
  await page
    .locator("#cover-title")
    .fill("Latest title that wraps to more than one line ".repeat(4));
  await expect
    .poll(() => paper.getAttribute("data-pagination"))
    .not.toBe(before);
  expect(f.calls).toHaveLength(0);
});
