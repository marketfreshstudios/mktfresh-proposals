/** Local, mock-only visual PDF check. Never loads environment credentials. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { setup } from "../tests/helpers";
import { sealedPdf } from "../src/lib/pdf";
import { variables, versionHash, sha256 } from "../src/lib/content";
const { draft, settings } = await setup();
const bytes = await readFile("public/fonts/InstrumentSans-Variable.woff2");
const font = {
  id: "00000000-0000-4000-8000-000000000099",
  name: "Uploaded studio font",
  path: "local/fonts/check.woff2",
  format: "woff2" as const,
  hash: sha256(bytes),
};
settings.proposal_fonts = { heading: "serif", body: font };
draft.workspace_settings = settings;
const version = {
  id: draft.id,
  version_no: 1,
  content: draft.content,
  quote: draft.quote,
  variables_resolved: variables(draft),
  created_at: new Date().toISOString(),
  frozen: true,
  content_hash: "",
};
version.content_hash = versionHash(version);
const result = await sealedPdf(version, [], [], draft.currency, {
  settings,
  fonts: [{ ...font, data: bytes.toString("base64") }],
});
assert.equal(result.pdf.subarray(0, 5).toString(), "%PDF-");
await mkdir(".data/evidence/phase5", { recursive: true });
await writeFile(".data/evidence/phase5/proposal-fonts.pdf", result.pdf);
console.log(
  "Local proposal PDF rendered with curated headings and an uploaded body font.",
);
