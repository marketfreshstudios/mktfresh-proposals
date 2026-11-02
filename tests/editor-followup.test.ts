import { it, expect } from "vitest";
import { renderBlocks } from "../src/lib/presentation";
import { printContent, printCss } from "../src/lib/document-print";
import { appendField } from "../src/lib/editor-document";
import { fieldLabel, fieldGroup } from "../src/lib/field-labels";
import { setup } from "./helpers";
it("renders safe rich-text links and rejects executable or insecure links", () => {
  const block = (href: string) => [
    {
      type: "paragraph" as const,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Read more",
                marks: [{ type: "link", attrs: { href } }],
              },
            ],
          },
        ],
      },
    },
  ];
  expect(
    renderBlocks(block("https://example.test/?a=1&b=2"), [], {}),
  ).toContain('href="https://example.test/?a=1&amp;b=2"');
  expect(renderBlocks(block("mailto:staff@example.test"), [], {})).toContain(
    'href="mailto:staff@example.test"',
  );
  for (const href of [
    "javascript:alert(1)",
    "http://example.test",
    "data:text/html,test",
    "/relative",
  ])
    expect(() => renderBlocks(block(href), [], {})).toThrow(
      "Links must use HTTPS or mailto",
    );
});
it("marks each pricing unit, choice group and signature as indivisible in print", async () => {
  const { draft } = await setup();
  const quote = structuredClone(draft.quote);
  quote[0].choice_group_id = crypto.randomUUID();
  const alternate = structuredClone(quote[0]);
  alternate.id = crypto.randomUUID();
  quote.splice(1, 0, alternate);
  const html = printContent({
    title: "Proposal",
    company: "Client",
    sender: "Staff",
    validity: "",
    content: [
      { id: "pricing", type: "pricing_table" },
      { id: "sign", type: "signature_block", role: "client" },
    ],
    quote,
    variables: {},
    currency: "USD",
  });
  expect(html).toContain('class="print-choice-group"');
  expect(html).toContain(`data-print-unit="${quote[0].id}"`);
  expect(html).toContain('class="print-pricing-card"');
  expect(html).toContain('class="print-signature"');
  expect(printCss).toContain("break-inside:avoid;page-break-inside:avoid");
});

it("groups friendly fields and appends only inside a selected text block", () => {
  expect(fieldLabel("client.first_name")).toBe("Client first name");
  expect(fieldGroup("quote.monthly_total")).toBe("Totals");
  expect(fieldGroup("sender.name")).toBe("Sender & workspace");
  const original = {
    type: "paragraph" as const,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Keep me", marks: [{ type: "bold" }] },
          ],
        },
      ],
    },
  };
  const next = appendField(original, "client.first_name");
  expect(next.content!.content![0].content).toEqual([
    { type: "text", text: "Keep me", marks: [{ type: "bold" }] },
    { type: "variable", attrs: { path: "client.first_name" } },
  ]);
  expect(original.content.content[0].content).toHaveLength(1);
  expect(appendField({ type: "pricing_table" }, "client.first_name")).toEqual({
    type: "pricing_table",
  });
});

it("Duplicate block renders the licensed clone SVG, not clipboard copy or text", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { BlockAction } = await import("../src/components/block-controls");
  const icons = (await import("../src/components/icons.json")).default;
  const html = renderToStaticMarkup(
    createElement(
      BlockAction,
      { "aria-label": "Duplicate block" },
      "Duplicate block",
    ),
  );
  expect(html).toContain('aria-label="Duplicate block"');
  expect(html).toContain("<svg");
  expect(html).toContain(icons.clone.path);
  expect(html).not.toContain(icons.copy.path);
});
