import { test, expect } from "@playwright/test";
import { setup } from "../tests/helpers";
import {
  printContent,
  printCss,
  paginatePrintDocument,
} from "../src/lib/document-print";
import type { Block } from "../src/lib/model";

test("PDF measurement keeps cards, complete choice groups and signatures on one page", async ({
  page,
}) => {
  const { draft } = await setup();
  const quote = structuredClone(draft.quote),
    group = crypto.randomUUID();
  quote[0].choice_group_id = group;
  quote[0].description = "Alpha scope. ".repeat(12);
  const alternate = structuredClone(quote[0]);
  alternate.id = crypto.randomUUID();
  alternate.description = "Beta scope. ".repeat(12);
  quote.splice(1, 0, alternate);
  const content: Block[] = [
    ...Array.from({ length: 10 }, (_, n) => ({
      id: `paragraph-${n}`,
      type: "paragraph" as const,
      text: "Agreed scope and milestones. ".repeat(8),
    })),
    { id: "pricing", type: "pricing_table" },
    { id: "client-signature", type: "signature_block", role: "client" },
    { id: "company-signature", type: "signature_block", role: "company" },
  ];
  const html = printContent({
    title: "Intact cards",
    company: "Client",
    sender: "Staff",
    validity: "",
    content,
    quote,
    variables: {},
    currency: "USD",
  });
  await page.setContent(`<style>${printCss}</style>${html}`);
  await page
    .locator('[data-print-block="paragraph-9"] p')
    .evaluate((el) => ((el as HTMLElement).style.minHeight = "650px"));
  // Only this trusted shared paginator is evaluated, never document content.
  const result = await page.evaluate((code) => {
    const paginate = new Function(
      "root",
      `const __name = value => value; return (${code})(root)`,
    );
    const result = paginate(document.querySelector(".print-root"));
    return {
      ...result,
      units: Array.from(
        document.querySelectorAll<HTMLElement>(
          ".print-choice-group,.print-pricing-unit,.document-signature",
        ),
      ).map((el) => {
        const page = el.closest<HTMLElement>(".print-sheet")!,
          a = el.getBoundingClientRect(),
          b = page.getBoundingClientRect();
        return {
          unit: el.dataset.printUnit,
          top: a.top - b.top,
          bottom: a.bottom - b.top,
          height: b.height,
        };
      }),
    };
  }, paginatePrintDocument.toString());
  expect(result.pages).toBeGreaterThan(1);
  expect(result.units).toHaveLength(4);
  const signaturePages = await page
    .locator(".document-signature")
    .evaluateAll((es) =>
      es.map((el) =>
        Array.from(document.querySelectorAll(".print-sheet")).indexOf(
          el.closest(".print-sheet")!,
        ),
      ),
    );
  expect(signaturePages[0]).toBe(signaturePages[1]);
  for (const unit of result.units) {
    expect(unit.top).toBeGreaterThanOrEqual(0);
    expect(unit.bottom).toBeLessThanOrEqual(unit.height + 1);
  }
  expect(
    result.boundaries.some((b: { unit?: string }) => b.unit === quote[0].id),
  ).toBe(true);
  await expect(page.locator(".print-choice-group")).toHaveCount(1);
  await expect(
    page.locator(".print-choice-group .print-pricing-card"),
  ).toHaveCount(2);
  // Unsupported over-page atoms fail clearly; they are never fragmented or clipped.
  for (const selector of [
    ".print-choice-group",
    ".print-pricing-unit",
    ".document-signature",
    ".signature-pair",
  ]) {
    await page.setContent(
      `<style>${printCss}</style><main class="print-root"><section class="${selector.slice(1)}"><p>${"Long scope. ".repeat(3000)}</p></section></main>`,
    );
    await expect(
      page.evaluate(
        (code) =>
          new Function(
            "root",
            `const __name = value => value; return (${code})(root)`,
          )(document.querySelector(".print-root")),
        paginatePrintDocument.toString(),
      ),
    ).rejects.toThrow("too tall for one PDF page");
  }
});
