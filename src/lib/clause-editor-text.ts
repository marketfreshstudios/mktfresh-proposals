import { plainEditorText } from "./editor-fields";
import type { RichText } from "./model";
import { clauseTextParts } from "./oiot";

/** The editor shows the labels as marks; the contract still stores a string. */
export function clauseEditorDoc(value: string, boldRunIns = false): RichText {
  const content = clauseTextParts(value, boldRunIns).flatMap(({ text, bold }) =>
    text.split("\n").flatMap((line, index) => [
      ...(index ? [{ type: "hardBreak" }] : []),
      ...(line
        ? [
            {
              type: "text",
              ...(bold ? { marks: [{ type: "bold" }] } : {}),
              text: line,
            },
          ]
        : []),
    ]),
  );
  return {
    type: "doc",
    content: [{ type: "paragraph", ...(content.length ? { content } : {}) }],
  };
}

export function clauseEditorBody(node: RichText, boldRunIns = false) {
  if (!boldRunIns) return plainEditorText(node);
  return (node.content ?? [])
    .map((paragraph) => {
      const lines: { text: string; bold: boolean }[][] = [[]];
      for (const child of paragraph.content ?? []) {
        if (child.type === "hardBreak") {
          lines.push([]);
        } else {
          const text = plainEditorText(child).replaceAll("*", "");
          if (text)
            lines.at(-1)!.push({
              text,
              bold: child.marks?.some((mark) => mark.type === "bold") ?? false,
            });
        }
      }
      return lines
        .map((line) => {
          const plain = line.map(({ text }) => text).join("");
          const end = line.findIndex(({ bold }) => !bold);
          if (end <= 0) return plain;
          const label = line
            .slice(0, end)
            .map(({ text }) => text)
            .join("")
            .trimEnd();
          const rest = plain.slice(label.length);
          // Only a leading bold label followed by prose is representable.
          return label && !/^\s/.test(label) && rest.startsWith(" ")
            ? `**${label}**${rest}`
            : plain;
        })
        .join("\n");
    })
    .join("\n");
}
