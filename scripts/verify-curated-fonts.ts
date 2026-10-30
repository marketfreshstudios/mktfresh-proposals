/** Offline, mock-only font/PDF specimens. No environment credentials or provider calls. */
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { setup } from "../tests/helpers";
import { curatedFonts } from "../src/lib/proposal-fonts";
import { sealedPdf } from "../src/lib/pdf";
import { variables, versionHash } from "../src/lib/content";
const directory = ".data/evidence/live-review/fonts";
await mkdir(directory, { recursive: true });
const { draft, settings } = await setup();
const report = [];
for (const font of curatedFonts) {
  settings.proposal_fonts = { heading: font.id, body: font.id };
  draft.workspace_settings = settings;
  const version = {
    id: draft.id,
    version_no: 1,
    quote: draft.quote,
    content: [
      { type: "heading" as const, text: `${font.name} · proposal headings` },
      {
        type: "paragraph" as const,
        content: {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Regular body text: A clear proposal for the next chapter. 0123456789. ",
            },
            {
              type: "text",
              text: "Italic body text. ",
              marks: [{ type: "italic" }],
            },
            {
              type: "text",
              text: "Bold body text. ",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: "Bold italic body text.",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      },
    ],
    variables_resolved: variables(draft),
    created_at: "2026-10-30T12:00:00Z",
    frozen: true,
    content_hash: "",
  };
  version.content_hash = versionHash(version);
  const before = JSON.stringify(version);
  const result = await sealedPdf(version, [], [], draft.currency, { settings });
  assert.equal(JSON.stringify(version), before);
  const parsed = await PDFDocument.load(result.pdf);
  const objects = parsed.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj.toString())
    .join("\n");
  const names = [
    ...objects.matchAll(/\/(?:BaseFont|FontName)\s+\/([^\s\n]+)/g),
  ].map((m) => m[1]);
  const needle = font.name.replace(/\s/g, "");
  assert(
    names.some((n) =>
      n
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .includes(needle.toLowerCase()),
    ),
    `Font missing from PDF: ${font.name}: ${names.join(", ")}`,
  );
  assert(/\/FontFile[23]?\b/.test(objects), "Font must be embedded");
  await writeFile(`${directory}/${font.id}.pdf`, result.pdf);
  report.push({
    id: font.id,
    name: font.name,
    embeddedFontNames: [...new Set(names)],
    bytes: result.pdf.length,
    versionHash: version.content_hash,
  });
  console.log(`Embedded ${font.name} in headings and body`);
}
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
