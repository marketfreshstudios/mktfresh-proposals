import type { Browser, Page } from "playwright-core";
import { validatePrintDom } from "./pdf-geometry";
import { PdfPrintError, type PrintDiagnostic } from "./pdf-diagnostics";
export async function readyPrintPage(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map((img) => (img as HTMLImageElement).decode().catch(() => {})),
    );
  });
}
export async function checkedPrint(
  page: Page,
  browser: Browser,
  stage: "proposal" | "certificate",
  context?: {
    failure: (
      error: unknown,
      print: "proposal body" | "certificate",
      attempt: number,
    ) => PrintDiagnostic;
    pageCreated: (page: Page) => void;
  },
) {
  const diagnostics: PrintDiagnostic[] = [];
  const options = {
    format: "Letter" as const,
    printBackground: true,
    preferCSSPageSize: true,
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.evaluate(
        `(() => {const __name = value => value; return (${validatePrintDom.toString()})();})()`,
      );
      return { page, bytes: await page.pdf(options) };
    } catch (error) {
      if (context)
        diagnostics.push(
          context.failure(
            error,
            stage === "proposal" ? "proposal body" : "certificate",
            attempt,
          ),
        );
      const transient =
        error instanceof Error &&
        /Protocol error \(Page\.printToPDF\): Printing failed/.test(
          error.message,
        );
      if (!transient || attempt === 2)
        throw new PdfPrintError(
          `PDF ${stage} print failed${attempt === 2 ? " after a fresh-page retry" : ""}: ${error instanceof Error ? error.message : String(error)}`,
          diagnostics,
          error,
        );
      // Geometry passed. Recreate the target once from its already laid-out HTML;
      // keep the frozen content, breaks, signatures and hash inputs unchanged.
      try {
        const html = await page.content();
        await page.close();
        page = await browser.newPage({ javaScriptEnabled: false });
        context?.pageCreated(page);
        await page.route("**/*", (route) => route.abort());
        await page.setContent(html);
        await readyPrintPage(page);
      } catch (retryError) {
        if (context)
          diagnostics.push(
            context.failure(
              retryError,
              stage === "proposal" ? "proposal body" : "certificate",
              2,
            ),
          );
        throw new PdfPrintError(
          `PDF ${stage} retry setup failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          diagnostics,
          retryError,
        );
      }
    }
  }
  throw new Error("PDF print attempts exhausted");
}
