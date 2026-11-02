import { documentStyleCss, styleFonts } from "./proposal-styles";
import {
  completionCertificate,
  certificateTime,
} from "./completion-certificate";
import { fontFamily, curatedFonts, type ProposalFont } from "./proposal-fonts";
import {
  printContent,
  printCss,
  printPageCss,
  paginatePrintDocument,
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
    const signatures = signers
      .map(
        (s) =>
          `<section class="print-signature" style="break-inside:avoid"><h2>${s.role === "client" ? "Client" : "Company"} signature</h2><p>${escape(s.name)} · ${escape(s.title)}${s.company ? ` · ${escape(s.company)}` : ` · ${escape(s.email)}`}</p>${s.kind === "drawn" ? `<img alt="Signature" src="${s.image}" style="max-width:100%;max-height:160px;object-fit:contain" />` : `<p><em>${escape(s.typed_name!)}</em></p>`}<p>${escape(certificateTime(s.signed_at, brand?.settings?.timezone))}</p><p>${escape(s.consent_text)}</p></section>`,
      )
      .join("");
    await page.setContent(
      htmlDocument(
        style +
          `<style>${printCss}${printPageCss(version.resolved_styles)}${documentStyleCss(version.resolved_styles, brand?.settings?.accent_colour)}</style>` +
          printContent({
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
            logo: brand?.logo,
            signatory: brand?.settings?.company_signatory,
            currentLayout: !!version.resolved_styles?.layout,
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
    const layout: PrintLayout = await page.evaluate<
      ReturnType<typeof paginatePrintDocument>
    >(
      `(() => { const __name = value => value; return (${paginatePrintDocument.toString()})(document.querySelector(".print-root")); })()`,
    );
    layout.sheets = await page.locator(".print-sheet").evaluateAll((sheets) =>
      sheets.map((sheet) => {
        const top = sheet.getBoundingClientRect().top;
        const lineTop = (el: HTMLElement) => {
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walk.nextNode()))
            if (node.textContent?.trim()) {
              const range = document.createRange();
              range.setStart(node, 0);
              range.setEnd(node, Math.min(1, node.textContent.length));
              return range.getBoundingClientRect().top;
            }
          return el.getBoundingClientRect().top;
        };
        return {
          html: sheet.innerHTML,
          fragments: Array.from(
            sheet.querySelectorAll<HTMLElement>(".print-atom"),
          ).flatMap((atom) => {
            const common = {
              block: atom.dataset.sourceBlock!,
              offset: Number(atom.dataset.sourceOffset),
              ...(atom.dataset.sourcePart
                ? {
                    part: atom.dataset.sourcePart,
                    part_offset: Number(atom.dataset.sourcePartOffset),
                  }
                : {}),
              ...(atom.dataset.sourceUnit
                ? { unit: atom.dataset.sourceUnit }
                : {}),
            };
            const targets =
              atom.querySelectorAll<HTMLElement>("[data-print-unit]");
            return [
              {
                ...common,
                y: lineTop(atom) - top,
                height: atom.getBoundingClientRect().height,
                bottom: atom.getBoundingClientRect().bottom - top,
              },
              ...Array.from(targets)
                .filter((el) => el !== atom.firstElementChild)
                .map((el) => ({
                  ...common,
                  unit: el.dataset.printUnit,
                  y: lineTop(el) - top,
                  height: el.getBoundingClientRect().height,
                  bottom: el.getBoundingClientRect().bottom - top,
                })),
            ];
          }),
        };
      }),
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
    if ((await PDFDocument.load(body)).getPageCount() !== layout.pages)
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
