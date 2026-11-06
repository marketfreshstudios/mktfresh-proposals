import { expect, it } from "vitest";
import {
  plainEditorText,
  fieldNodes,
  editorFieldValue,
  resolvedEditorText,
} from "../src/lib/editor-fields";
import { coverInlineHtml } from "../src/lib/cover-render";
import { renderBlocks } from "../src/lib/presentation";
import { blockText } from "../src/lib/editor-document";
it("legacy token text and real atoms share authoring chips; empty fields use friendly names", () => {
  const value = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "For {{client.company}} · {{proposal.validity}}",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  };
  const normalized = fieldNodes(value);
  expect(blockText({ type: "paragraph", content: normalized })).toBe(
    "For {{client.company}} · {{proposal.validity}}",
  );
  expect(
    normalized.content![0].content!.filter((n) => n.type === "variable"),
  ).toHaveLength(2);
  expect(normalized.content![0].content![1].marks).toEqual([{ type: "bold" }]);
  expect(
    editorFieldValue("proposal.validity", { "proposal.validity": "" }),
  ).toBe("Validity sentence");
  expect(editorFieldValue("workspace.state", {})).toBe("Business state");
  expect(
    resolvedEditorText("Why {{workspace.name}}", {
      "workspace.name": "Example Studio",
    }),
  ).toBe("Why Example Studio");
  const html = coverInlineHtml(value, {
    "client.company": "Example Co",
    "proposal.validity": "",
  });
  expect(html).toContain('data-field="client.company"');
  expect(html).toContain('data-field="proposal.validity"');
  expect(html).toContain("Validity sentence");
  expect(html).not.toContain("{{");
  const printed = coverInlineHtml(
    value,
    { "client.company": "Example Co", "proposal.validity": "" },
    true,
  );
  expect(printed).toBe("<strong>For Example Co · </strong>");
  expect(printed).not.toContain("field-chip");
  expect(
    renderBlocks([{ type: "paragraph", content: normalized }], [], {
      "client.company": "Example Co",
      "proposal.validity": "",
    }),
  ).not.toContain("field-chip");
});
it("all tokens in a bare cover text node survive, including adjacent fields", () => {
  const node = {
    type: "text",
    text: "Hello {{client.first_name}}{{client.last_name}}!",
  };
  const html = coverInlineHtml(node, {
    "client.first_name": "Jane",
    "client.last_name": "Doe",
  });
  expect(html.match(/class="field-chip"/g)).toHaveLength(2);
  expect(html).toContain("Jane");
  expect(html).toContain("Doe");
});

it("plain contract editing preserves token strings and exact line breaks", () => {
  expect(
    plainEditorText(
      fieldNodes({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "For {{client.company}}" },
              { type: "hardBreak" },
              { type: "text", text: "Second line." },
              { type: "hardBreak" },
            ],
          },
        ],
      }),
    ),
  ).toBe("For {{client.company}}\nSecond line.\n");
});
