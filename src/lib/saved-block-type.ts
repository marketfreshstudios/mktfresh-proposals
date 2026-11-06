import type { Block, RichText } from "./model";
import { convertTextStyle } from "./editor-document";
const fixedTypeLabels: Partial<Record<Block["type"], string>> = {
  pricing_table: "Pricing table",
  signature_block: "Signatures",
  page_break: "Page break",
  variable: "Field",
};
export function savedBlockType(block: Block) {
  if (block.type === "contract") return "Contract clause";
  if (block.type === "image") return "Image";
  if (!["paragraph", "heading"].includes(block.type))
    return fixedTypeLabels[block.type] ?? "Block";
  const list = block.content?.content?.find((n) =>
    ["bulletList", "orderedList"].includes(n.type),
  );
  return list?.type === "bulletList"
    ? "Bulleted list"
    : list
      ? "Numbered list"
      : "Text";
}
/** Same paragraph/list shapes as the rich-text editor; keep IDs, fields, marks and nesting. */
export function convertSavedBlockType(block: Block, type: string): Block {
  if (
    !["paragraph", "heading"].includes(block.type) ||
    !["Text", "Bulleted list", "Numbered list"].includes(type)
  )
    return block;
  const text = convertTextStyle(block, 0);
  const doc: RichText = text.content ?? {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: block.text ? [{ type: "text", text: block.text }] : [],
      },
    ],
  };
  const nodes = structuredClone(doc.content ?? []);
  const flatten = (node: RichText): RichText[] =>
    ["bulletList", "orderedList", "listItem"].includes(node.type)
      ? (node.content ?? []).flatMap(flatten)
      : [{ ...node, type: node.type === "heading" ? "paragraph" : node.type }];
  const content =
    type === "Text"
      ? nodes.flatMap(flatten)
      : [
          {
            type: type === "Bulleted list" ? "bulletList" : "orderedList",
            content: nodes.flatMap((node) =>
              ["bulletList", "orderedList"].includes(node.type)
                ? (node.content ?? [])
                : [
                    {
                      type: "listItem",
                      content: [{ ...node, type: "paragraph" }],
                    },
                  ],
            ),
          },
        ];
  return { ...text, text: undefined, content: { ...doc, content } };
}
