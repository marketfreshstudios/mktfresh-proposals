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
      {text.split(/({{\s*[\w.-]+\s*}})/g).map((part, n) => {
        const field = /^{{\s*([\w.-]+)\s*}}$/.exec(part);
        return field ? (
          <span
            key={n}
            className="field-chip"
            data-field={field[1]}
            title={part}
          >
            {map[field[1]] ?? part}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}

export function HeadingElement({
  level,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level: number }) {
  return createElement(`h${level + 1}`, props);
}
