"use client";
import { FieldEditor } from "../field-editor";
import { plainEditorText } from "../../lib/editor-fields";
import type { RichText } from "../../lib/model";
/** Field atoms are an editing adapter; contract bodies are still plain strings. */
export function PlainClauseText({
  value,
  onChange,
  map,
  label,
  multiline = true,
}: {
  value: string;
  onChange: (value: string) => void;
  map: Record<string, string>;
  label: string;
  multiline?: boolean;
}) {
  const valueNode: RichText = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: value
          .split("\n")
          .flatMap((line, n) => [
            ...(n ? [{ type: "hardBreak" }] : []),
            ...(line ? [{ type: "text", text: line }] : []),
          ]),
      },
    ],
  };
  return (
    <div className="plain-clause-text plain-clause-reading">
      <FieldEditor
        label={label}
        plainText
        multilinePlainText={multiline}
        value={valueNode}
        map={map}
        showNames={false}
        onChange={(node) => onChange(plainEditorText(node))}
      />
    </div>
  );
}
