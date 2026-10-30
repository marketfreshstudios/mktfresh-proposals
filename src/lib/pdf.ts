import { fontFamily, curatedFonts, type ProposalFont } from "./proposal-fonts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceSettings } from "./workspace";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { escape, htmlDocument, renderBlocks, sha256 } from "./content";
import type { Audit, Signer, Version } from "./model";

/** Render without network or scripts; append separately rendered audit pages with pdf-lib. */
export async function sealedPdf(
  version: Version,
  signers: Signer[],
  events: Audit[],
  currency: string,
  brand?: {
    settings?: WorkspaceSettings;
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
          `<section style="break-inside:avoid"><h2>${escape(s.role)} signature</h2><p>${escape(s.name)} · ${escape(s.title)}${s.company ? ` · ${escape(s.company)}` : ` · ${escape(s.email)}`}</p>${s.kind === "drawn" ? `<img alt="Signature" src="${s.image}" style="max-width:100%;max-height:160px;object-fit:contain" />` : `<p><em>${escape(s.typed_name!)}</em></p>`}<p>${escape(s.signed_at)}</p><p>${escape(s.consent_text)}</p></section>`,
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
    const audit =
      `<h1>Signature audit</h1><p>Frozen content SHA-256</p><pre>${version.content_hash}</pre><p>Original signed PDF body SHA-256</p><pre>${bodyHash}</pre><p>The final PDF hash is stored separately and checked by the verification endpoint.</p>` +
      signers
        .map(
          (s) =>
            `<section style="break-inside:avoid"><h2>${escape(s.role)}: ${escape(s.name)}</h2><p>${escape(s.email)} · ${escape(s.title)}</p>${s.application_statement ? `<p>${escape(s.application_statement)}</p><p>Staff ID: ${escape(s.actor)}</p><p>${escape(s.authorization_text ?? "Designated signatory applied their own signature.")}</p>` : ""}<p>Signed: ${escape(s.signed_at)}<br>Consent: ${escape(s.consent_at)}<br>IP: ${escape(s.ip || "Not available")}<br>User agent: ${escape(s.user_agent)}</p><p>${escape(s.consent_text)}</p></section>`,
        )
        .join("") +
      "<h2>Events</h2>" +
      events
        .map(
          (e) =>
            `<section style="break-inside:avoid;border-top:1px solid #ddd;padding-top:8px"><p><strong>${escape(e.type)}</strong>${e.metadata.application_statement ? `<br>${escape(String(e.metadata.application_statement))}` : ""} · ${escape(e.created_at)}<br>Actor: ${escape(e.actor)}<br>IP: ${escape(e.ip || "Not available")}<br>User agent: ${escape(e.user_agent)}</p><pre>${escape(JSON.stringify(e.metadata))}</pre></section>`,
        )
        .join("");
    await page.setContent(htmlDocument(style + heading + audit));
    const auditBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
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
