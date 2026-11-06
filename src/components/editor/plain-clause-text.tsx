"use client";
import { useLayoutEffect, useRef } from "react";
import { FieldTextArea } from "../field-options";
import { SourceParagraph } from "../page-spacers";
/** The measured reading layer stays plain text; only the input overlay is editor chrome. */
export function PlainClauseText({
  value,
  onChange,
  map,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  map: Record<string, string>;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const reading = root.current?.querySelector<HTMLElement>(
        ".plain-clause-reading p",
      ),
      input = root.current?.querySelector<HTMLTextAreaElement>("textarea");
    if (!reading || !input) return;
    // Paragraph metrics can differ from the surrounding contract. Match the
    // overlay to the reading layer without adding to measured document height.
    const sync = () => {
      const style = getComputedStyle(reading);
      for (const property of [
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "letter-spacing",
        "text-transform",
        "text-align",
        "color",
      ])
        input.style.setProperty(property, style.getPropertyValue(property));
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(reading);
    return () => resize.disconnect();
  });
  return (
    <div className="plain-clause-text" ref={root}>
      <div className="plain-clause-reading">
        <SourceParagraph
          text={value.replace(
            /{{\s*([\w.-]+)\s*}}/g,
            (_, path) => map[path] ?? `{{${path}}}`,
          )}
        />
      </div>
      <FieldTextArea
        data-editor-chrome
        className="plain-clause-input"
        aria-label={label}
        value={value}
        onValue={onChange}
      />
    </div>
  );
}
