import { it, expect, vi } from "vitest";
import {
  validatePrintGeometry,
  validatePrintValue,
} from "../src/lib/pdf-geometry";
import { checkedPrint } from "../src/lib/pdf-print";
import { resolveStyles } from "../src/lib/proposal-styles";
import { defaultHeaderFooter, BandSpacingSchema } from "../src/lib/page-bands";
it("old missing fields and independent large stacks have finite Letter dimensions", () => {
  expect(validatePrintGeometry().content.height).toBeCloseTo(919.937, 3);
  const hf = defaultHeaderFooter();
  hf.headerSpacing = BandSpacingSchema.parse({
    heightIn: 0.6,
    distanceIn: 0.4,
  });
  hf.footerSpacing = BandSpacingSchema.parse({
    heightIn: 0.8,
    distanceIn: 0.5,
  });
  expect(validatePrintGeometry(resolveStyles(), hf).content.height).toBeCloseTo(
    805.2,
    6,
  );
});
it("invalid margins, content and sheet dimensions name the bad value before printing", () => {
  for (const value of [NaN, Infinity, -1, 0, 1057])
    expect(() => validatePrintValue("sheet.height", value, 1056)).toThrow(
      /sheet.height/,
    );
  for (const value of [NaN, -1, 12]) {
    const s = resolveStyles();
    s.layout!.margins.top = value;
    expect(() => validatePrintGeometry(s)).toThrow(/margin.top|content.height/);
  }
  expect(() => validatePrintValue("margin.top", 0, 1056, true)).not.toThrow();
});
function fakePage(pdf: any) {
  return {
    evaluate: vi.fn(async () => {}),
    pdf,
    content: vi.fn(async () => "<html>frozen layout</html>"),
    close: vi.fn(async () => {}),
    route: vi.fn(async () => {}),
    setContent: vi.fn(async () => {}),
    locator: () => ({ evaluateAll: vi.fn(async () => {}) }),
  };
}
it("a Chromium Printing failed recreates the target once from the same laid-out HTML", async () => {
  const old = fakePage(
      vi.fn(async () => {
        throw new Error(
          "page.pdf: Protocol error (Page.printToPDF): Printing failed",
        );
      }),
    ),
    fresh = fakePage(vi.fn(async () => Buffer.from("pdf"))),
    browser = { newPage: vi.fn(async () => fresh) };
  expect(
    (
      await checkedPrint(old as any, browser as any, "certificate")
    ).bytes.toString(),
  ).toBe("pdf");
  expect(old.close).toHaveBeenCalledOnce();
  expect(browser.newPage).toHaveBeenCalledWith({ javaScriptEnabled: false });
  expect(fresh.setContent).toHaveBeenCalledWith("<html>frozen layout</html>");
});
it("invalid geometry never prints or retries, and repeat protocol failures identify the stage", async () => {
  const old = fakePage(vi.fn());
  old.evaluate.mockRejectedValue(
    new Error("Invalid PDF print geometry: content.height = NaNpx"),
  );
  const browser = { newPage: vi.fn() };
  await expect(
    checkedPrint(old as any, browser as any, "proposal"),
  ).rejects.toThrow("content.height");
  expect(old.pdf).not.toHaveBeenCalled();
  expect(browser.newPage).not.toHaveBeenCalled();
  const fail = () => {
      throw new Error("Protocol error (Page.printToPDF): Printing failed");
    },
    a = fakePage(vi.fn(fail)),
    b = fakePage(vi.fn(fail));
  await expect(
    checkedPrint(
      a as any,
      { newPage: vi.fn(async () => b) } as any,
      "certificate",
    ),
  ).rejects.toThrow("PDF certificate print failed after a fresh-page retry");
  expect(b.pdf).toHaveBeenCalledOnce();
});
