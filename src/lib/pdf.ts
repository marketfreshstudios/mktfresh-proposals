import {
  completionCertificate,
  certificateTime,
} from "./completion-certificate";
import { fontFamily, curatedFonts, type ProposalFont } from "./proposal-fonts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceSettings } from "./workspace";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { escape, htmlDocument, renderBlocks, sha256 } from "./content";
import type { Audit, Signer, Version } from "./model";

/** Render without network or scripts; append a single-page completion certificate. */
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
    const style = `<style>${families.join("")}${custom}body{font-family:${fontFamily(brand?.settings?.proposal_fonts?.body)}}h1,h2,h3,h4{font-family:${fontFamily(brand?.settings?.proposal_fonts?.heading)}}header{border-bottom:3px solid ${brand?.settings?.accent_colour ?? "#245547"};padding-bottom:16px;margin-bottom:24px}</style>`;
    const heading = `<header>${brand?.logo ? `<img alt="" src="${brand.logo}" style="max-height:60px">` : ""}<h2>${escape(brand?.settings?.company_name ?? version.variables_resolved["company.name"] ?? "Proposal")}</h2></header>`;
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route("**/*", (route) => route.abort());
    const signatures = signers
      .map(
        (s) =>
          `<section style="break-inside:avoid"><h2>${s.role === "client" ? "Client" : "Company"} signature</h2><p>${escape(s.name)} · ${escape(s.title)}${s.company ? ` · ${escape(s.company)}` : ` · ${escape(s.email)}`}</p>${s.kind === "drawn" ? `<img alt="Signature" src="${s.image}" style="max-width:100%;max-height:160px;object-fit:contain" />` : `<p><em>${escape(s.typed_name!)}</em></p>`}<p>${escape(certificateTime(s.signed_at, brand?.settings?.timezone))}</p><p>${escape(s.consent_text)}</p></section>`,
      )
      .join("");
    await page.setContent(
      htmlDocument(
        style +
          heading +
          renderBlocks(
            version.content.filter((b) => b.type !== "signature_block"),
            version.quote,
            version.variables_resolved,
            currency,
            brand?.settings?.money?.cents ?? "auto",
          ) +
          signatures,
      ),
    );
    await page.evaluate(() => document.fonts.ready);
    const body = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
    const bodyHash = sha256(body);
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
    return { body, pdf: Buffer.from(await pdf.save()), bodyHash };
  } finally {
    await browser.close();
  }
}
