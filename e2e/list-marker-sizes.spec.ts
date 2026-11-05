import { captureReview5 } from "./owner-review5-captures";
import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { RichText } from "../src/lib/model";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const text = (value: string, size?: number): RichText => ({
  type: "text",
  text: value,
  ...(size ? { marks: [{ type: "fontSize", attrs: { size } }] } : {}),
});
for (const kind of ["bulletList", "orderedList"])
  test(`${kind} marker and spacing follow the first-line size in editor, client and PDF`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const id = crypto.randomUUID();
    const f = await editorFixture(page, false, {
      content: [
        { id: crypto.randomUUID(), type: "page_break" },
        {
          id,
          type: "paragraph",
          content: {
            type: "doc",
            content: [
              {
                type: kind,
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [text("Large list entry", 24)],
                      },
                    ],
                  },
                  {
                    type: "listItem",
                    content: [
                      { type: "paragraph", content: [text("Ordinary entry")] },
                    ],
                  },
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [text("Another ordinary entry")],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    await page.goto(`/proposals/${f.draft.id}`);
    const items = page.locator(`[data-block-id="block-${id}"] .tiptap li`);
    await expect
      .poll(() =>
        items
          .first()
          .evaluate((el) => getComputedStyle(el, "::marker").fontSize),
      )
      .toBe("24px");
    const sizes = await items.evaluateAll((es) =>
      es.map((el) => ({
        size: getComputedStyle(el, "::marker").fontSize,
        gap: parseFloat(getComputedStyle(el).marginTop),
        line: getComputedStyle(el.querySelector("p")!).lineHeight,
      })),
    );
    expect(sizes[1].size).toBe("16px");
    expect(sizes[1].gap).toBeCloseTo(sizes[2].gap * 1.5, 1);
    expect(parseFloat(sizes[0].line)).toBeCloseTo(
      parseFloat(sizes[1].line) * 1.5,
      1,
    );
    await expect(
      page.locator('.editor-page-sheets[data-layout-settled="true"]'),
    ).toBeVisible();
    if (kind === "bulletList") {
      await items.first().scrollIntoViewIfNeeded();
      await captureReview5(page, "list-24px-editor-1440");
    }
    const pages = await page.locator(".editor-page-sheets .page-sheet").count();
    await page
      .getByRole("button", { name: "Preview PDF", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download preview", exact: true }),
    ).toBeVisible();
    if (kind === "bulletList" && process.env.REVIEW5_CAPTURE === "1") {
      await page
        .getByRole("button", { name: "Go to page 2", exact: true })
        .click();
      await captureReview5(page, "list-24px-pdf-preview-1440");
    }
    const render = f.renders.at(-1)!;
    expect(render.layout.pages).toBe(pages);
    const { getDocument, OPS } =
      await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: Uint8Array.from(Buffer.from(render.pdf_base64, "base64")),
    });
    const doc = await task.promise;
    const entries: any[] = [];
    for (let n = 1; n <= render.layout.pages; n++)
      entries.push(...(await (await doc.getPage(n)).getTextContent()).items);
    // Chromium paints bullets as vectors; numbered markers share a text run.
    expect(render.layout.sheets![1].html).toContain('data-list-size="24"');
    if (kind === "orderedList") {
      const marker = entries.find((i) => "str" in i && i.str.startsWith("1."));
      expect(marker).toBeDefined();
      expect((Math.abs(marker.transform[3]) * 96) / 72).toBeCloseTo(24, 0);
    } else {
      const ops = await (await doc.getPage(2)).getOperatorList();
      const circles: number[] = [];
      ops.fnArray.forEach((op, n) => {
        if (op !== OPS.constructPath) return;
        const bounds = ops.argsArray[n]?.[2];
        if (!bounds || bounds.length !== 4) return;
        const w = bounds[2] - bounds[0],
          h = bounds[3] - bounds[1];
        if (w > 1 && w < 30 && Math.abs(w - h) < 0.1) circles.push(w);
      });
      expect(circles).toHaveLength(3);
      expect(circles[0]).toBeGreaterThan(circles[1]);
      expect(circles[1]).toBeCloseTo(circles[2], 1);
    }
    const large = entries.find(
      (i) => "str" in i && i.str.includes("Large list entry"),
    );
    expect((Math.abs(large.transform[3]) * 96) / 72).toBeCloseTo(24, 0);
    await task.destroy();
    if (process.env.REVIEW5_CAPTURE === "1") {
      mkdirSync("docs/screenshots/owner-review5", { recursive: true });
      const file = info.outputPath(`${kind}.pdf`);
      writeFileSync(file, Buffer.from(render.pdf_base64, "base64"));
      execFileSync("pdftoppm", [
        "-f",
        "2",
        "-singlefile",
        "-scale-to",
        "1440",
        "-png",
        file,
        `docs/screenshots/owner-review5/${kind}-pdf`,
      ]);
    }
    await page
      .getByRole("button", { name: "Close PDF preview", exact: true })
      .click();
    await page.goto(`/p/${f.draft.id}?preview=1`);
    await expect(page.locator("#proposal-document")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("#proposal-document li")
          .first()
          .evaluate((el) => getComputedStyle(el, "::marker").fontSize),
      )
      .toBe("24px");
    await page.setViewportSize({ width: 768, height: 1000 });
    await expect
      .poll(() =>
        page
          .locator("#proposal-document li")
          .first()
          .evaluate((el) => getComputedStyle(el, "::marker").fontSize),
      )
      .toBe("24px");
  });

test("mixed and nested lists use only their own first line, and wrapping changes no stored JSON", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const id = crypto.randomUUID();
  const nested: RichText = {
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [text("Nested default")] }],
      },
    ],
  };
  const mixed: RichText = {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: [
          text("First line ", 20),
          text("large", 24),
          { type: "hardBreak" },
          text("Later line", 30),
        ],
      },
      nested,
    ],
  };
  const f = await editorFixture(page, false, {
    content: [
      {
        id,
        type: "paragraph",
        content: {
          type: "doc",
          content: [{ type: "bulletList", content: [mixed] }],
        },
      },
    ],
  });
  await page.goto(`/proposals/${f.draft.id}`);
  const items = page.locator(`[data-block-id="block-${id}"] .tiptap li`);
  await expect
    .poll(() =>
      items.first().evaluate((el) => getComputedStyle(el, "::marker").fontSize),
    )
    .toBe("24px");
  expect(
    await items
      .nth(1)
      .evaluate((el) => getComputedStyle(el, "::marker").fontSize),
  ).toBe("16px");
  expect(JSON.stringify(f.active().content)).not.toContain("list-marker");
});
