"use client";
import { FieldEditor } from "./field-editor";
import { useState } from "react";
import { Button } from "./ui";
import type { Block } from "../lib/model";
export function BlocksEditor({
  content,
  onChange,
  map,
  library = [],
}: {
  content: Block[];
  onChange: (b: Block[]) => void;
  map: Record<string, string>;
  library?: { id: string; name: string; block: Block }[];
}) {
  const [variable, setVariable] = useState(
    Object.keys(map)[0] ?? "proposal.title",
  );
  const replace = (i: number, b: Block) =>
    onChange(content.map((v, n) => (n === i ? b : v)));
  function add(block: Block) {
    onChange([...content, block]);
  }
  async function image(file: File) {
    if (file.size > 700000)
      throw new Error("Use a PNG or JPEG smaller than 700 KB");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    add({ type: "image", src: data, alt: file.name });
  }
  return (
    <>
      <div className="toolbar" aria-label="Insert a block">
        <Button onClick={() => add({ type: "heading", text: "New heading" })}>
          Heading
        </Button>
        <Button
          onClick={() =>
            add({
              type: "paragraph",
              content: { type: "doc", content: [{ type: "paragraph" }] },
            })
          }
        >
          Text
        </Button>
        <label className="btn">
          Image
          <input
            className="screen-reader"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              if (e.target.files?.[0])
                void image(e.target.files[0]).catch((e) => alert(e.message));
            }}
          />
        </label>
        <Button onClick={() => add({ type: "pricing_table" })}>
          Pricing table
        </Button>
        <Button
          onClick={() => add({ type: "signature_block", role: "client" })}
        >
          Client signature
        </Button>
        <Button
          onClick={() => add({ type: "signature_block", role: "company" })}
        >
          Company signature
        </Button>
        <Button onClick={() => add({ type: "page_break" })}>Page break</Button>
        <select
          aria-label="Variable"
          value={variable}
          onChange={(e) => setVariable(e.target.value)}
        >
          {Object.entries(map).map(([k, v]) => (
            <option value={k} key={k}>
              {k} — {v || "unresolved"}
            </option>
          ))}
        </select>
        <Button onClick={() => add({ type: "variable", path: variable })}>
          Insert variable
        </Button>
        {library.length > 0 && (
          <select
            aria-label="Insert from content library"
            value=""
            onChange={(e) => {
              const b = library.find((v) => v.id === e.target.value);
              if (b) add(structuredClone(b.block));
            }}
          >
            <option value="">Insert from content library</option>
            {library.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="paper">
        {content.map((b, i) => (
          <section className="editor-block" key={i}>
            <div className="block-actions">
              <Button
                variant="ghost"
                disabled={i === 0}
                aria-label={`Move block ${i + 1} up`}
                onClick={() => {
                  const next = [...content];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  onChange(next);
                }}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                disabled={i === content.length - 1}
                aria-label={`Move block ${i + 1} down`}
                onClick={() => {
                  const next = [...content];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  onChange(next);
                }}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                aria-label={`Remove block ${i + 1}`}
                onClick={() => onChange(content.filter((_, n) => n !== i))}
              >
                Remove
              </Button>
            </div>
            {b.type === "heading" ? (
              <input
                aria-label={`Heading ${i + 1}`}
                value={b.text ?? ""}
                onChange={(e) => replace(i, { ...b, text: e.target.value })}
              />
            ) : b.type === "paragraph" ? (
              <FieldEditor
                map={map}
                showNames={true}
                value={
                  b.content ?? {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: b.text ?? "" }],
                      },
                    ],
                  }
                }
                onChange={(content) =>
                  replace(i, { type: "paragraph", content })
                }
              />
            ) : b.type === "image" ? (
              <>
                <img src={b.src} alt={b.alt ?? ""} />
                <input
                  aria-label="Image description"
                  value={b.alt ?? ""}
                  onChange={(e) => replace(i, { ...b, alt: e.target.value })}
                />
              </>
            ) : b.type === "variable" ? (
              <p className={map[b.path ?? ""] ? "" : "danger"}>
                {`{{${b.path}}}`} → {map[b.path ?? ""] || "Unresolved variable"}
              </p>
            ) : b.type === "signature_block" ? (
              <p>
                Signature:{" "}
                {b.role === "client"
                  ? "Client"
                  : map["company.name"] || "Company"}
              </p>
            ) : b.type === "pricing_table" ? (
              <p className="muted">
                Pricing table — edit the lines in the quote panel.
              </p>
            ) : (
              <hr className="page-break" />
            )}
          </section>
        ))}
      </div>
    </>
  );
}
export { QuoteEditor as ProposalEditor } from "./quote-editor";
