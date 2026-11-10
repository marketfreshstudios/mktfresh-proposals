"use client";
import { useMemo } from "react";
import { FieldEditor } from "../field-editor";
import {
  clauseEditorBody,
  clauseEditorDoc,
} from "../../lib/clause-editor-text";
/** Field atoms are an editing adapter; contract bodies are still plain strings. */
export function PlainClauseText({
  value,
  onChange,
  map,
  label,
  multiline = true,
  boldRunIns = false,
}: {
  value: string;
  onChange: (value: string) => void;
  map: Record<string, string>;
  label: string;
  multiline?: boolean;
  boldRunIns?: boolean;
}) {
  const doc = useMemo(
    () => clauseEditorDoc(value, boldRunIns),
    [value, boldRunIns],
  );
  return (
    <div className="plain-clause-text plain-clause-reading">
      <FieldEditor
        key={boldRunIns ? "run-in" : "plain"}
        label={label}
        plainText
        multilinePlainText={multiline}
        clauseRunIns={boldRunIns}
        value={doc}
        map={map}
        showNames={false}
        onChange={(node) => onChange(clauseEditorBody(node, boldRunIns))}
      />
    </div>
  );
}
