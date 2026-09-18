import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { escape, htmlDocument, renderBlocks, sha256 } from "./content";
import type { Audit, Signer, Version } from "./model";

/** Render without network or scripts; append separately rendered audit pages with pdf-lib. */
export async function sealedPdf(
  version: Version,
  signers: Signer[],
  events: Audit[],
  currency: string,
) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route("**/*", (route) => route.abort());
    const signatures = signers
      .map(
        (s) =>
          `<section style="break-inside:avoid"><h2>${escape(s.role)} signature</h2><p>${escape(s.name)} · ${escape(s.email)} · ${escape(s.title)}</p>${s.kind === "drawn" ? `<img alt="Signature" src="${s.image}" />` : `<p><em>${escape(s.typed_name!)}</em></p>`}<p>${escape(s.signed_at)}</p><p>${escape(s.consent_text)}</p></section>`,
      )
      .join("");
    await page.setContent(
      htmlDocument(
        renderBlocks(
          version.content,
          version.quote,
          version.variables_resolved,
          currency,
        ) + signatures,
      ),
    );
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
            `<section style="break-inside:avoid"><h2>${escape(s.role)}: ${escape(s.name)}</h2><p>${escape(s.email)} · ${escape(s.title)}</p><p>Signed: ${escape(s.signed_at)}<br>Consent: ${escape(s.consent_at)}<br>IP: ${escape(s.ip || "Not available")}<br>User agent: ${escape(s.user_agent)}</p><p>${escape(s.consent_text)}</p></section>`,
        )
        .join("") +
      "<h2>Events</h2>" +
      events
        .map(
          (e) =>
            `<section style="break-inside:avoid;border-top:1px solid #ddd;padding-top:8px"><p><strong>${escape(e.type)}</strong> · ${escape(e.created_at)}<br>Actor: ${escape(e.actor)}<br>IP: ${escape(e.ip || "Not available")}<br>User agent: ${escape(e.user_agent)}</p><pre>${escape(JSON.stringify(e.metadata))}</pre></section>`,
        )
        .join("");
    await page.setContent(htmlDocument(audit));
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
