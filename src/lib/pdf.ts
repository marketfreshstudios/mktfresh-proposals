import { ColumnsOverflowError } from "./columns";
import { resolveCoverGraphics } from "./cover-graphics";
import { sizeListMarkers } from "./list-markers";
import {
  PdfPrintError,
  diagnosticText,
  printMemory,
  type PrintDiagnostic,
} from "./pdf-diagnostics";
import { validatePrintGeometry } from "./pdf-geometry";
import { checkedPrint } from "./pdf-print";
import { fitStoredImages } from "./image-size";
import { bandPages, resolvedBandPages } from "./band-overrides";
import { pageBandHtml, pageBandCss } from "./page-band-render";
import { pageGeometry } from "./page-bands";
import { readableDate } from "./validity";
import { signatureHtml } from "./signature-presentation";
import { applyPagePlan, plannedPrintCss } from "./planned-print";
import { documentStyleCss, styleFonts, pageMetrics } from "./proposal-styles";
import { completionCertificate } from "./completion-certificate";
import { fontFamily, curatedFonts, type ProposalFont } from "./proposal-fonts";
import {
  printContent,
  printCss,
  printPageCss,
  paginatePrintDocument,
  collectPrintSheets,
  type PrintLayout,
} from "./document-print";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceSettings } from "./workspace";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { escape, htmlDocument, sha256 } from "./content";
import type { Audit, Signer, Version } from "./model";

/** Render without network or document scripts; append a single-page completion certificate. */
export async function sealedPdf(
  version: Version,
  signers: Signer[],
  events: Audit[],
  currency: string,
  brand?: {
    settings?: WorkspaceSettings;
    document?: { id: string; title: string };
    logo?: string;
    logoIcon?: string;
    fonts?: (ProposalFont & { data: string })[];
  },
  options?: { preview?: boolean },
) {
  const stage = options?.preview
    ? ("preview" as const)
    : signers.some((s) => s.role === "company")
      ? ("company" as const)
      : ("client" as const);
  const failures: PrintDiagnostic[] = [],
    consoleLines: string[] = [],
    stderr: string[] = [];
  const baseMetrics = pageMetrics(version.resolved_styles);
  let geometry: unknown = {
      width: baseMetrics.width,
      height: baseMetrics.height,
      margins: baseMetrics.margins,
      content_height: baseMetrics.contentHeight,
      content_width: baseMetrics.contentWidth,
    },
    pageCount = version.pagination?.pages ?? 0,
    chromiumVersion = "not launched",
    browserPid: number | undefined;
  const capture = (
    error: unknown,
    print: "proposal body" | "certificate",
    attempt: number,
  ) => {
    const value: PrintDiagnostic = {
      stage,
      print,
      attempt,
      page_count: print === "certificate" ? 1 : pageCount,
      geometry:
        print === "certificate"
          ? {
              width: 816,
              height: 1056,
              margins: 0,
              padding: { top: 48, right: 54, bottom: 48, left: 54 },
            }
          : geometry,
      memory: printMemory(browserPid),
      chromium: chromiumVersion,
      console: consoleLines.slice(-12),
      stderr: stderr.slice(-12),
      error: diagnosticText(
        error instanceof Error ? error.message : String(error),
      ),
      at: new Date().toISOString(),
    };
    failures.push(value);
    console.error("pdf_print_failure", value);
    return value;
  };
  try {
    const g = validatePrintGeometry(
      version.resolved_styles,
      version.header_footer,
    );
    geometry = {
      width: g.width,
      height: g.height,
      margins: g.margins,
      content: g.content,
    };
  } catch (error) {
    const diagnostic = capture(error, "proposal body", 0);
    throw new PdfPrintError(
      error instanceof Error ? error.message : String(error),
      [diagnostic],
      error,
    );
  }
  const watch = (page: import("playwright-core").Page) => {
    page.on("console", (message) => {
      consoleLines.push(diagnosticText(`${message.type()}: ${message.text()}`));
      if (consoleLines.length > 24) consoleLines.shift();
    });
    page.on("pageerror", (error) => {
      consoleLines.push(diagnosticText(error.message));
      if (consoleLines.length > 24) consoleLines.shift();
    });
  };
  const serverless = process.env.VERCEL
    ? (await import("@sparticuz/chromium")).default
    : null;
  const server = await chromium.launchServer({
    host: "127.0.0.1",
    ...(serverless
      ? {
          args: serverless.args,
          executablePath: await serverless.executablePath(),
        }
      : {}),
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  browserPid = server.process().pid;
  server.process().stderr?.on("data", (chunk: Buffer) => {
    stderr.push(diagnosticText(chunk.toString()));
    if (stderr.length > 24) stderr.shift();
  });
  let browser: import("playwright-core").Browser | undefined;
  try {
    browser = await chromium.connect(server.wsEndpoint(), { timeout: 30000 });
    chromiumVersion = browser.version();
    const chosen = brand?.settings?.proposal_fonts;
    const ids = new Set([
      ...styleFonts(version.resolved_styles),
      chosen?.heading ?? "serif",
      chosen?.body ?? "serif",
      "mono",
      "sans",
      "serif",
    ]);
    const families = await Promise.all(
      curatedFonts
        .filter((f) => ids.has(f.id))
        .flatMap((f) =>
          f.faces.map(
            async (face) =>
              `@font-face{font-family:${f.family.split(",")[0]};src:url(data:font/woff2;base64,${(await readFile(join(process.cwd(), "public/fonts", face.file))).toString("base64")});font-style:${face.style};font-weight:${face.weight};}`,
          ),
        ),
    );
    const custom = (brand?.fonts ?? [])
      .map(
        (f) =>
          `@font-face{font-family:"Proposal-${f.id}";src:url(data:font/${f.format};base64,${f.data})}`,
      )
      .join("");
    const style = `<style>${families.join("")}${custom}body{--proposal-body:${fontFamily(brand?.settings?.proposal_fonts?.body)};--proposal-heading:${fontFamily(brand?.settings?.proposal_fonts?.heading)};font-family:${fontFamily(brand?.settings?.proposal_fonts?.body)}}h1,h2,h3,h4{font-family:${fontFamily(brand?.settings?.proposal_fonts?.heading)}}</style>`;
    let page = await browser.newPage({ javaScriptEnabled: false });
    watch(page);
    await page.route("**/*", (route) => route.abort());
    const signedBlock = (s: Signer) =>
      signatureHtml({
        role: s.role,
        name: s.name,
        company:
          s.company ||
          (s.role === "company"
            ? brand?.settings?.company_name || ""
            : version.variables_resolved["client.company"] || ""),
        title: s.title,
        date: readableDate(s.signed_at, brand?.settings?.timezone),
        image: s.kind === "drawn" ? s.image : undefined,
        typedName: s.kind === "typed" ? s.typed_name || s.name : undefined,
      });
    const signatures = signers.map(signedBlock).join("");
    await page.setContent(
      htmlDocument(
        style +
          `<style>${printCss}${pageBandCss}${printPageCss(version.resolved_styles, version.header_footer)}${plannedPrintCss}${documentStyleCss(version.resolved_styles, brand?.settings?.accent_colour, version.content)}</style>` +
          printContent({
            cover: version.cover,
            legacyCover: version.cover === undefined,
            title:
              version.variables_resolved["proposal.title"] ??
              brand?.document?.title ??
              "Proposal",
            company: version.variables_resolved["client.company"] ?? "Client",
            sender:
              version.variables_resolved["sender.name"] ??
              brand?.settings?.owner ??
              "",
            validity: version.variables_resolved["proposal.valid_until"] ?? "",
            content: version.content,
            quote: version.quote,
            variables: version.variables_resolved,
            currency,
            cents: brand?.settings?.money?.cents ?? "auto",
            signatures,
            signatureBlocks: Object.fromEntries(
              signers.map((s) => [s.role, signedBlock(s)]),
            ),
            logo: brand?.logo,
            logoIcon: brand?.logoIcon,
            accent: brand?.settings?.accent_colour,
            signatory: brand?.settings?.company_signatory,
            currentLayout: !!version.resolved_styles?.layout,
            planned: !!version.pagination,
            pagination: version.pagination,
            styles: version.resolved_styles,
            workspace:
              brand?.settings?.company_name ??
              version.variables_resolved["company.name"],
          }),
      ),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((img) => (img as HTMLImageElement).decode().catch(() => {})),
      );
    });
    await page.locator(".print-root").evaluate(resolveCoverGraphics);
    await page.locator(".print-root").evaluate(fitStoredImages);
    await page.evaluate(
      `(() => {const __name = value => value; return (${sizeListMarkers.toString()})(document.querySelector(".print-root"));})()`,
    );
    // Serialize only this trusted repository function, never document content.
    // tsx preserves nested function names with __name; keep that helper scoped here.
    const layout: PrintLayout = version.pagination
      ? await page.evaluate(
          ({ fn, plan }) => {
            const apply = new Function(
              "const __name = value => value; return (" + fn + ");",
            )() as typeof applyPagePlan;
            return apply(document.querySelector(".print-root")!, plan);
          },
          { fn: applyPagePlan.toString(), plan: version.pagination },
        )
      : await page.evaluate<ReturnType<typeof paginatePrintDocument>>(
          `(() => { const __name = value => value; return (${paginatePrintDocument.toString()})(document.querySelector(".print-root"), ${Boolean(options?.preview && version.version_no === 0 && version.header_footer)}); })()`,
        );
    layout.sheets = await page.evaluate<ReturnType<typeof collectPrintSheets>>(
      `(() => { const __name = value => value; return (${collectPrintSheets.toString()})(Array.from(document.querySelectorAll(".print-sheet"))); })()`,
    );
    if (version.pagination) {
      const fragments = await page
        .locator(".print-sheet")
        .evaluateAll((sheets) =>
          sheets.map((sheet) => {
            const top = sheet.getBoundingClientRect().top;
            return Array.from(
              sheet.querySelectorAll<HTMLElement>("[data-print-block]"),
            ).map((el) => {
              const box = el.getBoundingClientRect();
              return {
                block: el.dataset.printBlock!,
                offset: 0,
                y: box.top - top,
                height: box.height,
                box_top: box.top - top,
                box_bottom: box.bottom - top,
              };
            });
          }),
        );
      layout.sheets!.forEach((sheet, n) => (sheet.fragments = fragments[n]));
    }
    layout.geometry = Array.from({ length: layout.pages }, (_, n) =>
      pageGeometry(version.resolved_styles, version.header_footer, n + 1),
    );
    if (version.content.some((b) => b.type === "columns")) {
      layout.overflow_columns = await page
        .locator('[data-print-kind="columns"]')
        .evaluateAll(
          (blocks, expected) => {
            if (blocks.length !== expected)
              throw new Error("Missing Columns layout");
            return blocks.flatMap((block) => {
              const sheet = block.closest(".print-sheet")!;
              const height = parseFloat(
                getComputedStyle(sheet).getPropertyValue(
                  "--print-content-height",
                ),
              );
              if (!Number.isFinite(height) || height <= 0)
                throw new Error("Invalid Letter content height for Columns");
              const excess = block.getBoundingClientRect().height - height;
              return excess > 0.5
                ? [
                    {
                      block: (block as HTMLElement).dataset.printBlock!,
                      excess: Math.ceil(excess),
                    },
                  ]
                : [];
            });
          },
          version.content.filter((b) => b.type === "columns").length,
        );
    }
    if (layout.overflow_columns?.length)
      throw new ColumnsOverflowError(layout.overflow_columns);
    const pricingIds = new Set(
      version.content
        .filter((b) => b.type === "pricing_table")
        .map((b, n) => b.id ?? String(n)),
    );
    layout.pricing_pages = Math.max(
      0,
      ...Array.from(pricingIds).map(
        (id) =>
          layout.sheets!.filter((s) => s.fragments.some((f) => f.block === id))
            .length,
      ),
    );
    const starts = await page
      .locator(".print-sheet")
      .evaluateAll((sheets) =>
        sheets.map((el) => (el.textContent ?? "").trim().slice(0, 160)),
      );
    for (const boundary of layout.boundaries)
      boundary.start_text = starts[boundary.page - 1];
    if (version.header_footer) {
      const plan = version.pagination ?? {
        format: 1 as const,
        pages: layout.pages,
        starts: layout.boundaries.map((b) => ({
          page: b.page,
          block: b.block,
          offset: b.offset,
          explicit: b.explicit,
          ...(b.unit ? { unit: b.unit } : {}),
          ...(b.part ? { part: b.part } : {}),
          ...(b.explicit
            ? {
                marker: version.content
                  .slice(
                    0,
                    version.content.findIndex((block) => block.id === b.block),
                  )
                  .findLast((block) => block.type === "page_break")?.id,
              }
            : {}),
        })),
      };
      const resolved = resolvedBandPages(
        version.header_footer,
        bandPages(version.content, plan),
      );
      const bands = Array.from({ length: layout.pages }, (_, n) =>
        (["header", "footer"] as const)
          .map((kind) =>
            pageBandHtml({
              hf: version.header_footer,
              band: resolved[n]?.[kind].value,
              kind,
              page: n + 1,
              pageCount: layout.pages,
              values: version.variables_resolved,
              styles: version.resolved_styles,
              logo: brand?.logo,
              logoIcon: brand?.logoIcon,
              print: true,
            }),
          )
          .join(""),
      );
      await page
        .locator(".print-sheet")
        .evaluateAll(
          (sheets, html) =>
            sheets.forEach((sheet, n) =>
              sheet.insertAdjacentHTML("beforeend", html[n]),
            ),
          bands,
        );
      await page
        .locator(".page-band img")
        .evaluateAll(async (images) =>
          Promise.all(
            images.map((img) =>
              (img as HTMLImageElement).decode().catch(() => {}),
            ),
          ),
        );
      await page.locator(".print-root").evaluate(fitStoredImages);
      const html = await page
        .locator(".print-sheet")
        .evaluateAll((sheets) => sheets.map((el) => el.innerHTML));
      layout.sheets!.forEach((sheet, n) => (sheet.html = html[n]));
    }
    if (options?.preview)
      await page.evaluate(() => {
        const mark = document.createElement("div");
        mark.textContent = "Preview — not signed";
        mark.setAttribute(
          "style",
          'position:fixed;top:45%;left:0;width:100%;text-align:center;font:600 48px "Instrument Sans",sans-serif;color:#555;opacity:.16;transform:rotate(-25deg);z-index:9999;pointer-events:none',
        );
        document.body.append(mark);
      });
    pageCount = layout.pages;
    const printed = await checkedPrint(page, browser, "proposal", {
      failure: capture,
      pageCreated: watch,
    });
    page = printed.page;
    const body = printed.bytes;
    if (
      !version.pagination &&
      (await PDFDocument.load(body)).getPageCount() !== layout.pages
    )
      throw new Error("PDF pagination differs from the document layout");
    const bodyHash = sha256(body);
    if (options?.preview)
      return {
        body,
        pdf: Buffer.from(body),
        bodyHash,
        layout,
        print_failures: failures,
      };
    const certificate = completionCertificate(version, signers, events, brand);
    await page.setContent(htmlDocument(style + certificate));
    await page.evaluate(() => document.fonts.ready);
    await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) =>
          (image as HTMLImageElement).decode().catch(() => {}),
        ),
      );
    });
    const certificatePrint = await checkedPrint(page, browser, "certificate", {
      failure: capture,
      pageCreated: watch,
    });
    page = certificatePrint.page;
    const auditBytes = certificatePrint.bytes;
    const certificatePdf = await PDFDocument.load(auditBytes);
    if (certificatePdf.getPageCount() !== 1)
      throw new Error("Completion certificate must fit on one page");
    const pdf = await PDFDocument.load(body),
      auditPdf = await PDFDocument.load(auditBytes);
    for (const copied of await pdf.copyPages(
      auditPdf,
      auditPdf.getPageIndices(),
    ))
      pdf.addPage(copied);
    return {
      body,
      pdf: Buffer.from(await pdf.save()),
      bodyHash,
      layout,
      print_failures: failures,
    };
  } catch (error) {
    // A recovered body failure still belongs in Evidence if a later certificate
    // failure aborts the job; keep the complete bounded print-attempt history.
    if (failures.length)
      throw new PdfPrintError(
        error instanceof Error ? error.message : String(error),
        failures,
        error,
      );
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    await server.close();
  }
}
