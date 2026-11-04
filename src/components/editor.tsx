"use client";
import { SelectableImage } from "./editor/selectable-image";
import { convertTextStyle, type TextLevel } from "../lib/editor-document";
import { FieldEditor } from "./field-editor";
import { FieldTextArea, FieldOptions } from "./field-options";
import type { Block } from "../lib/model";
/** The inspector edits one existing block; document insertion/deletion lives in its gutter. */
export function BlocksEditor({
  content,
  onChange,
  map,
  onSlash,
}: {
  content: Block[];
  onChange: (blocks: Block[]) => void;
  map: Record<string, string>;
  onSlash?: (anchor?: HTMLElement) => void;
}) {
  return (
    <div className="template-block-fields">
      {content.map((b, n) => {
        const patch = (block: Block) =>
          onChange(content.map((v, j) => (j === n ? block : v)));
        const style = (level: TextLevel, text?: string) => {
          patch(convertTextStyle(b, level, text));
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(
                  `[data-history-block="block-${b.id ?? n}"] textarea,[data-history-block="block-${b.id ?? n}"] .tiptap`,
                )
                ?.focus(),
            ),
          );
        };
        return (
          <section key={b.id ?? n} data-history-block={`block-${b.id ?? n}`}>
            {b.type === "heading" ? (
              <label className="field">
                Heading
                <FieldTextArea
                  textStyle={{ value: b.level ?? 1, change: style }}
                  aria-label={`Heading ${n + 1}`}
                  rows={2}
                  autoFocus
                  value={b.text ?? ""}
                  onValue={(text) => patch({ ...b, text })}
                />
              </label>
            ) : b.type === "paragraph" ? (
              <FieldEditor
                inlineControls
                autoFocus
                map={map}
                showNames={false}
                value={
                  b.content ?? {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        ...(b.text
                          ? { content: [{ type: "text", text: b.text }] }
                          : {}),
                      },
                    ],
                  }
                }
                onChange={(content) =>
                  patch({ ...b, content, text: undefined })
                }
                onSlash={onSlash}
                onTextStyle={style}
              />
            ) : b.type === "image" ? (
              <>
                <SelectableImage
                  value={{ ...b, src: b.src ?? "" }}
                  onChange={(image) => patch({ ...b, ...image })}
                  onDelete={() => onChange(content.filter((_, i) => i !== n))}
                />
                <label className="field">
                  Image description
                  <input
                    value={b.alt ?? ""}
                    onChange={(e) => patch({ ...b, alt: e.target.value })}
                  />
                </label>
              </>
            ) : b.type === "signature_block" ? (
              <label className="field">
                Signer role
                <select
                  value={b.role ?? "client"}
                  onChange={(e) =>
                    patch({
                      ...b,
                      role: e.target.value as "client" | "company",
                    })
                  }
                >
                  <option value="client">Client</option>
                  <option value="company">Company</option>
                </select>
              </label>
            ) : b.type === "variable" ? (
              <>
                <p>
                  {`{{${b.path}}}`} · {map[b.path ?? ""] || "—"}
                </p>
                <FieldOptions
                  map={map}
                  onInsert={(path) => patch({ ...b, path })}
                />
              </>
            ) : b.type === "pricing_table" ? (
              <p className="muted">
                Pricing table — edit products in the template’s default quote.
              </p>
            ) : (
              <p className="muted">Page break</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
export { QuoteEditor as ProposalEditor } from "./quote-editor";
