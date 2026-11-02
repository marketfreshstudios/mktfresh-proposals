import { test, expect, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { setup } from "../tests/helpers";
import { PDFDocument } from "pdf-lib";
import type { Block, QuoteItem } from "../src/lib/model";
import type { PdfPreview } from "../src/lib/pdf-preview";
const id = () => crypto.randomUUID();
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
async function ready(page: Page, template = false) {
  const paper = page.locator(
    template ? ".template-paged-paper" : ".editor-paper",
  );
  await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  try {
    await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
      "data-approximate",
      "false",
    );
  } catch (e) {
    throw new Error(
      `${e}\nSource placement: ${await paper.getAttribute("data-layout-errors")}`,
    );
  }
  await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-max-error",
    /^(0|0\.\d+)$/,
  );
  return paper;
}
async function pdfText(data: PdfPreview) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(Buffer.from(data.pdf_base64, "base64")),
    useSystemFonts: false,
  });
  const document = await task.promise,
    pages: string[] = [];
  for (let n = 1; n <= document.numPages; n++)
    pages.push(
      (await (await document.getPage(n)).getTextContent()).items
        .map((i: any) => i.str ?? "")
        .join(" "),
    );
  await task.destroy();
  return pages;
}
test("pointer page dragging moves every block, updates real sheets, and page deletion uses an undo toast without a dialog", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const original = JSON.stringify(f.active().content);
  const from = page.getByRole("button", { name: "Drag page 1", exact: true }),
    to = page.locator(`[data-sortable-id="page:${f.content[2].id}"]`);
  const a = (await from.boundingBox())!,
    target = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, {
    steps: 4,
  });
  await expect(from).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(target.x + 16, target.y + target.height - 8, {
    steps: 24,
  });
  await page.mouse.up();
  const expected = [...f.content.slice(3), ...f.content.slice(0, 2)].map(
    (b) => b.id,
  );
  await expect
    .poll(() =>
      f
        .active()
        .content.filter((b) => b.type !== "page_break")
        .map((b) => b.id),
    )
    .toEqual(expected);
  const paper = await ready(page);
  expect(
    JSON.parse(
      (await paper
        .locator(".editor-page-sheet")
        .first()
        .getAttribute("data-source-fragments")) ?? "[]",
    ).some((f: any) => f.block === expected[0]),
  ).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(original);
  await ready(page);
  let dialogs = 0;
  const onDialog = (d: import("@playwright/test").Dialog) => {
    dialogs++;
    void d.dismiss();
  };
  page.on("dialog", onDialog);
  await page
    .getByRole("button", { name: /^Delete page / })
    .last()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Page deleted" }),
  ).toBeVisible();
  await expect
    .poll(() => f.active().content.some((b) => b.id === f.content[3].id))
    .toBe(false);
  expect(dialogs).toBe(0);
  await page
    .getByRole("status")
    .filter({ hasText: "Page deleted" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(original);
  await page
    .getByRole("button", { name: /^Delete page / })
    .last()
    .click();
  await page.keyboard.press("Control+z");
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(original);
  await ready(page);
  await expect(paper).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(paper.locator(".editor-page-sheets")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  const surfaces = await paper
    .locator(".editor-page-sheet")
    .evaluateAll((els) =>
      els.map((e) => ({
        top: (e as HTMLElement).offsetTop,
        bottom: (e as HTMLElement).offsetTop + (e as HTMLElement).offsetHeight,
        bg: getComputedStyle(e).backgroundColor,
      })),
    );
  for (let n = 1; n < surfaces.length; n++)
    expect(surfaces[n].top - surfaces[n - 1].bottom).toBe(24);
  expect(surfaces.every((s) => s.bg === "rgb(255, 255, 255)")).toBe(true);
  page.off("dialog", onDialog);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.goto("/studio/templates");
  const templatePaper = await ready(page, true);
  const templateFrom = page.getByRole("button", {
      name: "Drag page 1",
      exact: true,
    }),
    templateTo = page.getByRole("button", { name: "Drag page 2", exact: true });
  const ta = (await templateFrom.boundingBox())!,
    tb = (await templateTo.boundingBox())!;
  await page.mouse.move(ta.x + ta.width / 2, ta.y + ta.height / 2);
  await page.mouse.down();
  await page.mouse.move(ta.x + ta.width / 2, tb.y + tb.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(
    templatePaper.locator(".studio-block-card h2").first(),
  ).toHaveText("Second section");
  await ready(page, true);
  await page.keyboard.press("Control+z");
  await expect(
    templatePaper.locator(".studio-block-card h2").first(),
  ).toHaveText("First section");
  await ready(page, true);
});

test("adjacent list and paragraph spacing uses the larger style gap in editor, client and actual print layout", async ({
  page,
}) => {
  const list = (name: string): Block => ({
    id: id(),
    type: "paragraph",
    content: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: name }] },
              ],
            },
          ],
        },
      ],
    },
  });
  const content: Block[] = [
    list("First list"),
    { id: id(), type: "heading", text: "First heading" },
    { id: id(), type: "paragraph", text: "First paragraph" },
    { id: id(), type: "heading", text: "Second heading" },
    list("Second list"),
    { id: id(), type: "paragraph", text: "Last paragraph" },
  ];
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const pairs = [
    [0, 1, 27.5],
    [1, 2, 8.75],
    [2, 3, 27.5],
    [4, 5, 9.6],
  ];
  const measure = async (client = false) =>
    page.locator(client ? ".flow-document" : ".editor-paper").evaluate(
      (root, { content, pairs, client }) => {
        const scale = client
          ? 1
          : root.getBoundingClientRect().width /
            (root as HTMLElement).offsetWidth;
        return pairs.map(([a, b, expected]) => {
          const el = (n: number) =>
            root.querySelector(
              client
                ? `[data-document-block="${content[n].id}"]`
                : `[data-block-id="block-${content[n].id}"] .block-content`,
            )!;
          return {
            gap:
              (el(b).getBoundingClientRect().top -
                el(a).getBoundingClientRect().bottom) /
              scale,
            expected,
          };
        });
      },
      { content, pairs, client },
    );
  const measured = await measure();
  for (const gap of measured)
    expect(
      Math.abs(gap.gap - gap.expected),
      JSON.stringify(measured),
    ).toBeLessThanOrEqual(2);
  await expect(page.locator(".editor-paper li").last()).toHaveCSS(
    "margin-bottom",
    "0px",
  );
  const pdf = f.renders.at(-1)!;
  expect(
    (
      await PDFDocument.load(Buffer.from(pdf.pdf_base64, "base64"))
    ).getPageCount(),
  ).toBe(pdf.layout.pages);
  const fragments = pdf.layout.sheets![0].fragments;
  for (const [a, b, expected] of pairs) {
    const left = fragments.find((f) => f.block === content[a].id)!,
      right = fragments.find((f) => f.block === content[b].id)!;
    expect(
      Math.abs(right.box_top! - left.box_bottom! - expected),
    ).toBeLessThanOrEqual(2);
  }
  await page.goto(`/p/${f.draft.id}?preview=1`);
  await expect(page.locator(".flow-document")).toBeVisible();
  for (const gap of await measure(true))
    expect(Math.abs(gap.gap - gap.expected)).toBeLessThanOrEqual(2);
});

test("compact products share name/price rows and accessible selections across editing, client reading and PDF", async ({
  page,
}) => {
  const base = (await setup()).draft.quote[0],
    group = id();
  const item = (name: string, optional = false): QuoteItem => ({
    ...structuredClone(base),
    id: id(),
    name,
    description: "",
    optional,
    selected: true,
    default_selected: true,
    choice_group_id: null,
    sublines: [
      {
        ...base.sublines[0],
        id: id(),
        amount: 19500,
        qty: 1,
        interval: "month",
        label: "Monthly",
      },
    ],
  });
  const required = item("Required care"),
    optional = item("Optional care", true),
    a = item("Choice A", true),
    b = item("Choice B", true),
    multi = item("Combined work");
  required.sublines[0].amount = 75000;
  required.sublines[0].interval = "one_time";
  b.sublines[0].interval = "year";
  optional.description = "Help when needed.";
  a.choice_group_id = group;
  b.choice_group_id = group;
  b.selected = false;
  b.default_selected = false;
  multi.sublines.push({
    ...multi.sublines[0],
    id: id(),
    label: "Kickoff",
    amount: 50000,
    interval: "one_time",
  });
  multi.sublines[0].label = "Ongoing support";
  const quote = [required, optional, a, b, multi].map((i, order) => ({
    ...i,
    order,
  }));
  const content: Block[] = [
    { id: id(), type: "heading", text: "Your scope" },
    { id: id(), type: "pricing_table" },
  ];
  const f = await editorFixture(page, false, { content, quote });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  for (const target of [".editor-paper", ".flow-document"]) {
    if (target === ".flow-document")
      await page.goto(`/p/${f.draft.id}?preview=1`);
    const rows = page.locator(`${target} .flow-quote-line`);
    await expect(rows).toHaveCount(5);
    expect(await rows.allTextContents()).not.toEqual(
      expect.arrayContaining(["Included", "Not included", "Required"]),
    );
    await expect(rows.first().locator(".flow-subline")).toHaveCount(0);
    await expect(rows.first().locator(".amount")).toHaveText("$750");
    await expect(rows.nth(1).locator(".amount")).toHaveText("$195/mo");
    await expect(rows.nth(3).locator(".amount")).toHaveText("$195/yr");
    const geometry = await rows
      .first()
      .locator(".flow-line-title")
      .evaluate((el) => {
        const [a, b] = Array.from(el.children).map((e) =>
          e.getBoundingClientRect(),
        );
        return { dy: Math.abs(a.top - b.top), apart: a.right <= b.left };
      });
    expect(geometry.dy).toBeLessThanOrEqual(1);
    expect(geometry.apart).toBe(true);
    await expect(
      rows.first().getByRole("img", { name: "Required", exact: true }),
    ).toHaveAttribute("title", "Required");
    await expect(rows.nth(4).locator(".flow-subline")).toHaveCount(2);
    await expect(rows.nth(1).locator(".quote-description")).toHaveText(
      "Help when needed.",
    );
  }
  await page
    .getByRole("checkbox", { name: "Optional care · included", exact: true })
    .uncheck();
  await expect(
    page.getByRole("checkbox", {
      name: "Optional care · not included",
      exact: true,
    }),
  ).not.toBeChecked();
  const text = (await pdfText(f.renders[0])).join(" ");
  expect(text).not.toMatch(/\bNot included\b|\bIncluded\b/);
  expect(text).toContain("$195/mo");
  expect(text).toContain("Kickoff");
});

test("moving a signature recomputes authoritative pages without opening Preview PDF; cached undo has no render request", async ({
  page,
}) => {
  const content: Block[] = [
    { id: id(), type: "heading", text: "Agreement" },
    ...Array.from({ length: 14 }, (_, n) => ({
      id: id(),
      type: "paragraph" as const,
      text: `Scope ${String(n).padStart(2, "0")}: ${"A clear delivery and support plan. ".repeat(9)}`,
    })),
    { id: id(), type: "signature_block", role: "client" },
  ];
  const signature = content.at(-1)!;
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await ready(page);
  const before = JSON.stringify(f.active().content),
    handle = page.getByRole("button", {
      name: `Drag block ${content.length}`,
      exact: true,
    });
  await page.locator(`[data-block-id="block-${signature.id}"]`).focus();
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  for (let n = 0; n < 13; n++) {
    await page.keyboard.press("ArrowUp");
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
  }
  await page.keyboard.press("Space");
  await expect.poll(() => f.active().content[2]?.id).toBe(signature.id);
  const paper = await ready(page),
    data = f.renders.at(-1)!;
  await expect(paper).toHaveAttribute(
    "data-layout-fingerprint",
    data.fingerprint,
  );
  const text = await pdfText(data);
  const pageIndex = text.findIndex((p) => p.includes("Client signature"));
  expect(pageIndex).toBeGreaterThanOrEqual(0);
  const pageIds = data.layout
    .sheets!.map((s, n) =>
      s.fragments.some((f) => f.block === signature.id) ? n : -1,
    )
    .filter((n) => n >= 0);
  expect(pageIds).toEqual([pageIndex]);
  const signatureBounds = await paper
    .locator(`[data-block-id="block-${signature.id}"] .editor-signature`)
    .evaluate((el) => {
      const root = el.closest<HTMLElement>(".editor-paper")!,
        scale = root.getBoundingClientRect().width / root.offsetWidth;
      return {
        top:
          (el.getBoundingClientRect().top - root.getBoundingClientRect().top) /
          scale,
        bottom:
          (el.getBoundingClientRect().bottom -
            root.getBoundingClientRect().top) /
          scale,
      };
    });
  expect(signatureBounds.top).toBeGreaterThanOrEqual(pageIndex * 1080 + 72 - 1);
  expect(signatureBounds.bottom).toBeLessThanOrEqual(
    pageIndex * 1080 + 1056 - 72 + 1,
  );
  for (let n = 0; n < 14; n++) {
    const marker = `Scope ${String(n).padStart(2, "0")}:`,
      pdfPage = text.findIndex((p) => p.includes(marker));
    const position = await paper
      .locator(`[data-block-id="block-${content[n + 1].id}"] .tiptap`)
      .evaluate((el) => {
        const root = el.closest<HTMLElement>(".editor-paper")!,
          scale = root.getBoundingClientRect().width / root.offsetWidth;
        return (
          (el.getBoundingClientRect().top - root.getBoundingClientRect().top) /
          scale
        );
      });
    expect(Math.floor(position / 1080)).toBe(pdfPage);
  }
  expect(
    await page
      .getByRole("dialog", { name: "Preview PDF", exact: true })
      .count(),
  ).toBe(0);
  const calls = f.calls.length;
  await page.keyboard.press("Control+z");
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(before);
  await ready(page);
  await page.waitForTimeout(450);
  expect(f.calls.length).toBe(calls);
});

test("cached undo restores continuation spacers when contract text remounts", async ({
  page,
}) => {
  const contract: Block = {
    id: id(),
    type: "contract",
    text: "Terms",
    clauses: [
      {
        id: id(),
        heading: "Working together",
        body: Array.from(
          { length: 80 },
          (_, n) => `Clause line ${n}. Plain terms for this project.`,
        ).join("\n"),
        show_when: null,
      },
    ],
  };
  const f = await editorFixture(page, false, { content: [contract] });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = await ready(page),
    block = paper.locator(`[data-block-id="block-${contract.id}"]`),
    spacers = block.locator("[data-pagination-spacer]"),
    count = await spacers.count(),
    data = f.renders.at(-1)!;
  expect(count).toBeGreaterThan(0);
  await block.focus();
  await block
    .locator(":scope > .block-tools")
    .getByRole("button", { name: "Delete block", exact: true })
    .click();
  await expect(block).toHaveCount(0);
  await ready(page);
  const calls = f.calls.length;
  await page.keyboard.press("Control+z");
  await expect(block).toHaveCount(1);
  await ready(page);
  await expect(spacers).toHaveCount(count);
  const pages = await pdfText(data);
  const positions = await block.locator("[data-source-text]").evaluate((el) => {
    const root = el.closest<HTMLElement>(".editor-paper")!,
      scale = root.getBoundingClientRect().width / root.offsetWidth;
    return Array.from({ length: 80 }, (_, n) => {
      let offset = el.textContent!.indexOf(`Clause line ${n}.`);
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walk.nextNode())) {
        if (offset < node.textContent!.length) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          return Math.floor(
            (range.getBoundingClientRect().top -
              root.getBoundingClientRect().top) /
              scale /
              1080,
          );
        }
        offset -= node.textContent!.length;
      }
      return -1;
    });
  });
  for (const [n, position] of positions.entries())
    expect(position).toBe(
      pages.findIndex((p) => p.includes(`Clause line ${n}.`)),
    );
  await page.waitForTimeout(450);
  expect(f.calls.length).toBe(calls);
});

test("rapid edits retain the last sheets and only the newest server response may commit", async ({
  page,
}) => {
  let release: () => void = () => {},
    held = false;
  const gate = new Promise<void>((r) => (release = r)),
    pendingTitle = "Pending layout ".repeat(14);
  const f = await editorFixture(page, true, {
    onLayout: async (input) => {
      if (input.title === pendingTitle) {
        held = true;
        await gate;
      }
    },
  });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = await ready(page),
    old = await paper.locator(".editor-page-sheets").innerHTML();
  const title = page.getByRole("textbox", {
    name: "Proposal title",
    exact: true,
  });
  await title.fill(pendingTitle);
  await expect.poll(() => held).toBe(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Updating pages…" }),
  ).toBeVisible();
  expect(await paper.locator(".editor-page-sheets").innerHTML()).toBe(old);
  await expect(paper).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await title.fill("Intermediate title");
  await title.fill("Latest title");
  await expect
    .poll(() =>
      f.renders.some(
        (r) =>
          r.fingerprint !== f.renders[0].fingerprint &&
          f.calls.at(-1)?.title === "Latest title",
      ),
    )
    .toBe(true);
  await ready(page);
  const newest = f.renders.at(-1)!;
  await expect(paper).toHaveAttribute(
    "data-layout-fingerprint",
    newest.fingerprint,
  );
  release();
  await page.waitForTimeout(450);
  await expect(paper).toHaveAttribute(
    "data-layout-fingerprint",
    newest.fingerprint,
  );
  await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
    "data-approximate",
    "false",
  );
  expect(f.calls.some((c) => c.title === "Intermediate title")).toBe(false);
});

test("density, margins and font changes automatically refresh the server layout without a PDF viewer", async ({
  page,
}) => {
  const f = await editorFixture(page, true);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const paper = await ready(page);
  let fingerprint = f.renders.at(-1)!.fingerprint;
  const standardPages = f.renders.at(-1)!.layout.pages;
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Density", exact: true })
    .selectOption("comfortable");
  await expect.poll(() => f.renders.at(-1)!.fingerprint).not.toBe(fingerprint);
  await ready(page);
  expect(f.renders.at(-1)!.layout.pages).toBeGreaterThanOrEqual(standardPages);
  fingerprint = f.renders.at(-1)!.fingerprint;
  await page
    .getByRole("spinbutton", { name: "Page margin top", exact: true })
    .fill("1.25");
  await expect.poll(() => f.renders.at(-1)!.fingerprint).not.toBe(fingerprint);
  await ready(page);
  fingerprint = f.renders.at(-1)!.fingerprint;
  await page
    .getByRole("combobox", { name: "Text level", exact: true })
    .selectOption("body");
  await page
    .getByRole("combobox", { name: "Body font", exact: true })
    .selectOption("lora");
  await expect.poll(() => f.renders.at(-1)!.fingerprint).not.toBe(fingerprint);
  await ready(page);
  await expect(paper).toHaveAttribute(
    "data-layout-fingerprint",
    f.renders.at(-1)!.fingerprint,
  );
  await expect(paper.locator(".editor-page-sheet")).toHaveCount(
    f.renders.at(-1)!.layout.pages,
  );
  expect(
    await page
      .getByRole("dialog", { name: "Preview PDF", exact: true })
      .count(),
  ).toBe(0);
});
