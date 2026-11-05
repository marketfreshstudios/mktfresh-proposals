import type { RichText } from "../../lib/model";
/** Tiptap's list/link metadata is editor-only; bands store the strict shared RichText shape. */
export function bandRichText(node: RichText): RichText {
  return {
    type: node.type,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.type === "image"
      ? {
          attrs: {
            src: node.attrs?.src ?? "",
            alt: node.attrs?.alt ?? "",
            height: node.attrs?.height ?? 18,
          },
        }
      : {}),
    ...(node.type === "variable"
      ? { attrs: { path: node.attrs?.path ?? "" } }
      : {}),
    ...(node.marks?.length
      ? {
          marks: node.marks
            .filter((mark) =>
              ["bold", "italic", "underline", "link", "fontSize"].includes(
                mark.type,
              ),
            )
            .map((mark) => ({
              type: mark.type,
              ...(mark.type === "fontSize"
                ? { attrs: { size: mark.attrs?.size } }
                : {}),
              ...(mark.type === "link"
                ? { attrs: { href: mark.attrs?.href ?? "" } }
                : {}),
            })),
        }
      : {}),
    ...(node.content ? { content: node.content.map(bandRichText) } : {}),
  };
}
