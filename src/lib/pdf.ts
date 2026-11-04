import { bandPages, resolvedBandPages } from "./band-overrides";
import { pageBandHtml, pageBandCss } from "./page-band-render";
import { pageGeometry } from "./page-bands";
import { readableDate } from "./validity";
import { signatureHtml } from "./signature-presentation";
import { applyPagePlan, plannedPrintCss } from "./planned-print";
import { documentStyleCss, styleFonts } from "./proposal-styles";
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
    fonts?: (ProposalFont & { data: string })[];
  },
  options?: { preview?: boolean },
) {
  const serverless = process.env.VERCEL
    ? (await import("@sparticuz/chromium")).default
    : null;
  const browser = await chromium.launch({
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
  try {
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
    const page = await browser.newPage({ javaScriptEnabled: false });
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
          `<style>${printCss}${pageBandCss}${printPageCss(version.resolved_styles, version.header_footer)}${plannedPrintCss}${documentStyleCss(version.resolved_styles, brand?.settings?.accent_colour)}</style>` +
          printContent({
            cover: version.cover,
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
          `(() => { const __name = value => value; return (${paginatePrintDocument.toString()})(document.querySelector(".print-root")); })()`,
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
    const body = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
    if (
      !version.pagination &&
      (await PDFDocument.load(body)).getPageCount() !== layout.pages
    )
      throw new Error("PDF pagination differs from the document layout");
    const bodyHash = sha256(body);
    if (options?.preview)
      return { body, pdf: Buffer.from(body), bodyHash, layout };
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
    const auditBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
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
    return { body, pdf: Buffer.from(await pdf.save()), bodyHash, layout };
  } finally {
    await browser.close();
  }
}
