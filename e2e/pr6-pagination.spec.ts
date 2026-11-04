import { test, expect, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block, RichText } from "../src/lib/model";
import { pdfPreview } from "../src/lib/pdf-preview";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const line = "A measured source line.";
const richLines = (count: number, list: boolean): RichText => {
  const p: RichText = {
    type: "paragraph",
    content: Array.from({ length: count }, (_, n) => [
      ...(n ? [{ type: "hardBreak" }] : []),
      { type: "text", text: line },
    ]).flat(),
  };
  return {
    type: "doc",
    content: list
      ? [{ type: "bulletList", content: [{ type: "listItem", content: [p] }] }]
      : [p],
  };
};
async function plan(page: Page) {
  return page
    .locator(".editor-paper")
    .evaluate((el) => JSON.parse(el.getAttribute("data-pagination")!));
}
async function positionAtBottom(page: Page, target: string, fits: number) {
  await page
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  await page
    .locator('[data-block-id="block-filler"] > .block-content')
    .evaluate((el) => ((el as HTMLElement).style.height = "0px"));
  const height = await page.locator(".editor-paper").evaluate(
    (root, value) => {
      const clone = root.cloneNode(true) as HTMLElement;
      clone.dataset.pageMeasurement = "true";
      clone
        .querySelectorAll(
          "style,[data-pagination-spacer],.editor-page-sheets,.document-page-count",
        )
        .forEach((n) => n.remove());
      clone
        .querySelectorAll<HTMLElement>("[data-layout-space]")
        .forEach((n) => {
          n.style.removeProperty("margin-top");
          delete n.dataset.layoutSpace;
        });
      Object.assign(clone.style, {
        position: "absolute",
        visibility: "hidden",
        height: "auto",
        minHeight: "0px",
      });
      for (const [key, v] of Object.entries({
        width: "816px",
        minWidth: "816px",
        maxWidth: "none",
        padding: "72px",
      }))
        clone.style.setProperty(
          key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
          v,
          "important",
        );
      root.parentElement!.append(clone);
      const target = clone.querySelector(
        `[data-block-id="block-${value.target}"] > .block-content`,
      )!;
      const walk = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.parentElement?.closest(
            "[data-editor-chrome],textarea,.sr-only,[data-pagination-spacer]",
          )
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });
      const rows: number[] = [];
      let node;
      while ((node = walk.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects())
          if (r.height > 0 && !rows.some((v) => Math.abs(v - r.bottom) < 1))
            rows.push(r.bottom);
      }
      rows.sort((a, b) => a - b);
      const height =
        1056 -
        72 -
        (rows[value.fits - 1] - clone.getBoundingClientRect().top) -
        1;
      clone.remove();
      return height;
    },
    { target, fits },
  );
  expect(height).toBeGreaterThan(0);
  await page
    .locator('[data-block-id="block-filler"] > .block-content')
    .evaluate(
      (el, height) => ((el as HTMLElement).style.height = `${height}px`),
      height,
    );
  await page
    .locator(".editor-paper")
    .evaluate((el) => el.dispatchEvent(new Event("pagination-layout-change")));
}
for (const [count, fits, list] of [
  [2, 1, true],
  [3, 2, true],
  [4, 3, false],
  [60, 4, false],
] as const) {
  test(`widows/orphans: ${list ? "list item" : "paragraph"} ${count} lines with ${fits} lines left`, async ({
    page,
  }) => {
    const content: Block[] = [
      { id: "filler", type: "paragraph", text: "Calibration space." },
      { id: "target", type: "paragraph", content: richLines(count, list) },
    ];
    const f = await editorFixture(page, false, { content });
    await page.setViewportSize({ width: 1920, height: 1100 });
    await page.goto(`/proposals/${f.draft.id}`);
    await positionAtBottom(page, "target", fits);
    const expected = count <= 3 ? 0 : (count === 4 ? 2 : 4) * line.length;
    await expect
      .poll(
        async () =>
          (await plan(page)).starts.find((s: any) => s.block === "target")
            ?.offset,
      )
      .toBe(expected);
    const starts = (await plan(page)).starts
      .filter((s: any) => s.block === "target")
      .map((s: any) => s.offset);
    if (count <= 3) expect(starts).toEqual([0]);
    else {
      const boundaries = [0, ...starts, count * line.length];
      for (let i = 1; i < boundaries.length; i++)
        expect(
          (boundaries[i] - boundaries[i - 1]) / line.length,
        ).toBeGreaterThanOrEqual(2);
    }
    expect(f.patches).toHaveLength(0);
  });
}

test("1440px editor text matches the PDF page edge words; narrow projections keep source plans", async ({
  page,
}, info) => {
  const text = Array.from(
    { length: 1600 },
    (_, n) => `w${String(n).padStart(4, "0")}`,
  ).join(" ");
  const f = await editorFixture(page, false, {
    content: [{ id: "long", type: "paragraph", text }],
  });
  await f.editRemote({ style_overrides: { body: { font: "mono", size: 16 } } });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const column = await page.locator(".editor-paper").evaluate((el) => {
    const s = getComputedStyle(el);
    return (
      el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    );
  });
  expect(column).toBeCloseTo(672, 1);
  const original = await plan(page);
  const screen = await page.locator(".editor-paper").evaluate((root) => {
    const boxes = Array.from(root.querySelectorAll(".page-sheet")).map((el) =>
      el.getBoundingClientRect(),
    );
    const pages = boxes.map(() => [] as string[]);
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement?.closest(".tiptap") &&
        !n.parentElement.closest(
          "[data-pagination-spacer],[data-editor-chrome]",
        )
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let node;
    while ((node = walk.nextNode()))
      for (const m of node.textContent!.matchAll(/w\d{4}/g)) {
        const r = document.createRange();
        r.setStart(node, m.index!);
        r.setEnd(node, m.index! + m[0].length);
        const rect = r.getBoundingClientRect(),
          index = boxes.findIndex(
            (b) => rect.top >= b.top - 1 && rect.bottom <= b.bottom + 1,
          );
        if (index >= 0) pages[index].push(m[0]);
      }
    return pages.map((words) => [words[0], words.at(-1)]);
  });
  const pdf = await pdfPreview(
    f.repo,
    {
      get: async () => new Uint8Array(),
      put: async () => {
        throw new Error("No writes");
      },
    },
    { ...f.active(), pagination: original },
    f.settings,
  );
  const path = info.outputPath("matching-columns.pdf");
  await writeFile(path, Buffer.from(pdf.pdf_base64, "base64"));
  const pages = execFileSync("pdftotext", ["-layout", path, "-"], {
    encoding: "utf8",
  })
    .split("\f")
    .filter((s) => s.trim());
  const printed = pages.map((p) => {
    const w = p.match(/w\d{4}/g) ?? [];
    return [w[0], w.at(-1)];
  });
  expect(screen).toEqual(printed);
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 1100 });
    await page
      .locator(".editor-paper")
      .evaluate((el) => el.dispatchEvent(new Event("pagination-flush")));
    await page
      .locator(".editor-page-sheets[data-layout-settled=true]")
      .waitFor();
    expect((await plan(page)).pages).toBe(original.pages);
    expect(await plan(page)).toEqual(original);
    await expect(
      page.locator('[data-block-id="block-long"] .tiptap'),
    ).toHaveCSS("font-size", "16px");
    const bad = await page
      .locator(".editor-paper [data-pagination-spacer]")
      .evaluateAll((spaces) =>
        spaces.flatMap((span) => {
          if (!span.previousSibling || !span.nextSibling) return [];
          const before = document.createRange(),
            after = document.createRange();
          const prev = span.previousSibling,
            next = span.nextSibling;
          if (
            prev.nodeType !== 3 ||
            next.nodeType !== 3 ||
            !prev.textContent?.trim() ||
            !next.textContent?.trim()
          )
            return [];
          before.setStart(prev, Math.max(0, prev.textContent.length - 1));
          before.setEnd(prev, prev.textContent.length);
          after.setStart(next, 0);
          after.setEnd(next, 1);
          return before.getBoundingClientRect().bottom >
            span.getBoundingClientRect().top + 1
            ? [span.parentElement?.textContent]
            : [];
        }),
      );
    expect(bad).toEqual([]);
  }
  expect(f.patches).toHaveLength(0);
});

test("adjacent signatures share a row and a page; separated signatures stay authored", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      { id: "filler", type: "paragraph", text: "Calibration space." },
      { id: "client", type: "signature_block", role: "client" },
      { id: "company", type: "signature_block", role: "company" },
      { id: "break", type: "page_break" },
      { id: "separate", type: "signature_block", role: "client" },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  await expect(page.locator(".editor-paper .signature-pair")).toHaveCount(1);
  const pair = page.locator(".signature-pair .signature-area");
  const a = await pair.nth(0).boundingBox(),
    b = await pair.nth(1).boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
  expect(b!.x - a!.x).toBeGreaterThan(100);
  await expect(pair.first()).toHaveCSS("height", "56px");
  expect(
    (await plan(page)).starts.some((s: any) => s.block === "company"),
  ).toBe(false);
});

test("cover fields keep tokens, persist per proposal, remove logo, and inherit in template preview", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  await expect(
    page.locator('.cover-field .field-chip[data-field="workspace.name"]'),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Cover client name", exact: true })
    .fill("Prepared especially for {{client.first_name}}");
  await expect
    .poll(() => f.active().cover?.prepared_for)
    .toBe("Prepared especially for {{client.first_name}}");
  await page
    .getByRole("textbox", { name: "Cover client name", exact: true })
    .blur();
  await expect(
    page.locator('.cover-field .field-chip[data-field="client.first_name"]'),
  ).toContainText("Jane");
  await page
    .getByRole("button", { name: "Edit cover logo", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove logo", exact: true }).click();
  await expect.poll(() => f.active().cover?.logo).toBeNull();
  await page
    .getByRole("button", { name: "Edit cover logo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use workspace logo", exact: true })
    .click();
  await expect.poll(() => f.active().cover?.logo).toBeUndefined();
});

test("sub-line placeholders, duplicate hint, 3→2→1 removal and undo stay in sync with document and PDF", async ({
  page,
}, info) => {
  const f = await editorFixture(page, false, {
    quote: (base) => [
      {
        ...base[0],
        name: "Sub-line service",
        source: "custom",
        pricing_item_id: null,
        ai_entered: false,
        price_review: {},
        sublines: ["one_time", "month", "year"].map((interval, n) => ({
          ...base[0].sublines[0],
          id: crypto.randomUUID(),
          label: "",
          interval: interval as any,
          amount: (n + 1) * 10000,
          qty: 1,
          list_amount: null,
          stripe_lookup_key: null,
          qbo_item_ref: null,
        })),
      },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  const row = page.getByRole("button", { name: /^Sub-line service Required/ });
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  const labels = page.getByRole("textbox", {
    name: "Sub-line label for Sub-line service",
  });
  for (const [n, label] of [
    "Setup fee",
    "Subscription",
    "Annual subscription",
  ].entries())
    await expect(labels.nth(n)).toHaveAttribute("placeholder", label);
  await page
    .getByRole("combobox", { name: "Interval Sub-line service" })
    .nth(2)
    .selectOption("month");
  await expect(
    page.getByText("Name these sub-lines so the client can tell them apart."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove sub-line Subscription", exact: true })
    .last()
    .click();
  await expect(labels).toHaveCount(2);
  await page
    .getByRole("button", { name: "Remove sub-line Subscription", exact: true })
    .click();
  await expect(labels).toHaveCount(0);
  await expect(
    page.getByText("Shown as the item price", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Remove sub-line/ }),
  ).toHaveCount(0);
  await expect(
    page.locator(".document-quote .flow-line-title .amount"),
  ).toHaveText("$100");
  await expect(page.locator(".document-quote .flow-subline")).toHaveCount(0);
  await expect.poll(() => f.active().quote[0].sublines.length).toBe(1);
  const pdf = await pdfPreview(
    f.repo,
    {
      get: async () => new Uint8Array(),
      put: async () => {
        throw new Error("No writes");
      },
    },
    f.active(),
    f.settings,
  );
  const path = info.outputPath("one-price.pdf");
  await writeFile(path, Buffer.from(pdf.pdf_base64, "base64"));
  const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
  expect(text).toContain("Sub-line service");
  expect(text).toContain("$100");
  expect(text).not.toContain("Setup fee");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(labels).toHaveCount(2);
});

test("a short contract clause moves with its heading rather than leaving an orphan", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      { id: "filler", type: "paragraph", text: "Calibration space." },
      {
        id: "target",
        type: "contract",
        text: "Terms",
        clauses: [
          {
            id: "clause",
            heading: "Agreement",
            body: [line, line, line].join("\n"),
            show_when: null,
          },
        ],
      },
    ],
  });
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  // Terms, Agreement and one body line fit. The remaining two lines must not strand the heading.
  await positionAtBottom(page, "target", 3);
  await expect
    .poll(async () =>
      (await plan(page)).starts.find((s: any) => s.part === "clause"),
    )
    .toMatchObject({ block: "target", part: "clause", offset: 0 });
});

test("pagination measurement copies cannot uncheck the live choice group", async ({
  page,
}) => {
  const group = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    quote: (base) =>
      [0, 1].map((n) => ({
        ...base[0],
        id: crypto.randomUUID(),
        name: `Choice ${n + 1}`,
        choice_group_id: group,
        optional: true,
        default_selected: n === 0,
        selected: n === 0,
        order: n,
        sublines: base[0].sublines.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
        })),
      })),
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const choice = page.getByRole("radio", {
    name: /Default selection for Choice 1/,
  });
  await expect(choice).toBeChecked();
  for (const width of [1180, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page
      .locator(".editor-paper")
      .evaluate((el) => el.dispatchEvent(new Event("pagination-flush")));
    await expect(choice).toBeChecked();
  }
  expect(f.patches).toHaveLength(0);
});

test("client signing shows the signature pair live; the locked editor renders the accepted signature", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: [
      { id: "quote", type: "pricing_table" },
      { id: "client", type: "signature_block", role: "client" },
      { id: "company", type: "signature_block", role: "company" },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/p/${f.draft.id}?preview=1`);
  await page
    .getByRole("button", { name: "Review and sign", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your signature", exact: true })
    .fill("Example Signature");
  const preview = page.getByLabel("Signature preview", { exact: true });
  await expect(preview.locator(".document-signature")).toHaveCount(2);
  await expect(preview.locator(".typed-signature")).toHaveText(
    "Example Signature",
  );
  await expect(preview.locator(".typed-signature")).toHaveCSS(
    "font-size",
    "28px",
  );
  await expect(preview.locator(".typed-signature")).toHaveCSS(
    "font-style",
    "italic",
  );
  await expect(preview.locator(".typed-signature")).toHaveCSS("margin", "0px");
  const areas = preview.locator(".signature-area");
  await expect(areas.first()).toHaveCSS("height", "56px");
  const a = await areas.first().boundingBox(),
    b = await areas.last().boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 375, height: 1000 });
  await expect
    .poll(() =>
      preview
        .locator(".signature-pair")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
    )
    .toBe(1);
  await f.sendRemote();
  const { signature } = await import("../tests/helpers");
  await f.signRemote(signature(f.active().revision));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}?action=edit`);
  await expect(
    page.locator(
      '[data-block-id="block-client"] .signature-area .typed-signature',
    ),
  ).toHaveText("Jane Doe");
  await expect(
    page.locator('[data-block-id="block-client"] .signature-date'),
  ).not.toHaveText(/Date signed/);
  await expect(page.locator(".editor-edit-bar")).toHaveCount(0);
});
