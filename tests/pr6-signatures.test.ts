import { it, expect } from "vitest";
import {
  signaturePairStarts,
  signatureHtml,
} from "../src/lib/signature-presentation";
import { printContent } from "../src/lib/document-print";
import type { Block } from "../src/lib/model";
const client: Block = { id: "client", type: "signature_block", role: "client" },
  company: Block = { id: "company", type: "signature_block", role: "company" };
it("pairs adjacent opposing roles, preserves authored separation and frozen page starts", () => {
  expect([...signaturePairStarts([client, company])]).toEqual([0]);
  expect([
    ...signaturePairStarts([
      client,
      { id: "p", type: "paragraph", text: "Between" },
      company,
    ]),
  ]).toEqual([]);
  expect([
    ...signaturePairStarts([
      client,
      { id: "break", type: "page_break" },
      company,
    ]),
  ]).toEqual([]);
  expect([
    ...signaturePairStarts([client, company], {
      format: 1,
      pages: 2,
      starts: [{ page: 2, block: "company", offset: 0, explicit: false }],
    }),
  ]).toEqual([]);
});
it("print placeholders and completed signature use the same role, signing rule, name and date", () => {
  const html = printContent({
    title: "Proposal",
    company: "Client Ltd",
    workspace: "Studio",
    sender: "Alex",
    validity: "",
    content: [client, company],
    quote: [],
    variables: { "client.full_name": "Jane Doe" },
    currency: "USD",
    currentLayout: true,
  });
  expect(html).toContain('class="signature-pair"');
  expect(html.match(/class="signature-area"/g)).toHaveLength(2);
  expect(html).toContain("Date signed");
  const signed = signatureHtml({
    role: "company",
    name: "Alex",
    company: "Studio",
    date: "November 3, 2026",
    image: "data:image/png;base64,AA==",
  });
  expect(signed).toContain('<img src="data:image/png;base64,AA=="');
  expect(signed).not.toContain("Date signed");
  expect(signed).toContain("November 3, 2026");
});
