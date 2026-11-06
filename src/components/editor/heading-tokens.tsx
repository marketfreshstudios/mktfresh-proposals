import { editorFieldParts } from "../../lib/editor-fields";
import { createElement, type HTMLAttributes } from "react";
/** Heading text stays a plain-text model; this reading layer paints its field tokens. */
export function HeadingTokens({
  text,
  map,
}: {
  text: string;
  map: Record<string, string>;
}) {
  return (
    <>
      {editorFieldParts(text, map).map((part, n) =>
        part.path ? (
          <span key={n} className="field-chip" data-field={part.path}>
            {part.value}
          </span>
        ) : (
          part.value
        ),
      )}
    </>
  );
}

export function HeadingElement({
  level,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level: number }) {
  return createElement(`h${level + 1}`, props);
}
