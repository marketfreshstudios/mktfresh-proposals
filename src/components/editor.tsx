"use client";
import { withDraftSettings } from "../lib/proposal-settings";
import type { WorkspaceSettings } from "../lib/workspace";
import { sellableCatalogue, itemDisplayName } from "../lib/catalogue-display";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button, Field, Banner, Totals, api, ApiError } from "./ui";
import {
  catalogLine,
  LineSchema,
  type Block,
  type RichText,
  type Proposal,
  type Item,
} from "../lib/model";
import { variables, money } from "../lib/presentation";
import { readiness } from "../lib/quote";
function RichEditor({
  value,
  onChange,
}: {
  value: RichText;
  onChange: (v: RichText) => void;
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: false,
        strike: false,
        code: false,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => change.current(editor.getJSON() as RichText),
  });
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value))
      editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);
  return (
    <>
      <div className="actions">
        <Button
          type="button"
          variant="ghost"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Bold
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Italic
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          List
        </Button>
      </div>
      <EditorContent editor={editor} />
    </>
  );
}
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
              <RichEditor
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
export function ProposalEditor({
  initial,
  settings,
  catalog,
  families,
  library,
  onSaved,
}: {
  initial: Proposal;
  settings?: WorkspaceSettings | null;
  catalog: Item[];
  families: { id: string; name: string; active: boolean }[];
  library: { id: string; name: string; block: Block }[];
  onSaved: (p: Proposal) => void;
}) {
  const [p, setP] = useState(initial),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false);
  const generation = useRef(0),
    revision = useRef(initial.revision),
    savingRef = useRef(false);
  function change(update: Partial<Proposal>) {
    generation.current++;
    setDirty(true);
    setP((p) => ({ ...p, ...update }));
  }
  async function save() {
    if (savingRef.current || !dirty || stale) return;
    savingRef.current = true;
    setSaving(true);
    const captured = generation.current;
    try {
      const result = await api<Proposal>(`/api/proposals/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: revision.current,
          title: p.title,
          content: p.content,
          quote: p.quote,
          valid_until: p.valid_until,
        }),
      });
      revision.current = result.revision;
      if (captured === generation.current) {
        setP(result);
        setDirty(false);
        onSaved(result);
      } else setP((current) => ({ ...current, revision: result.revision }));
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setStale(true);
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!dirty || saving || stale || error) return;
    const timer = setTimeout(() => void save(), 900);
    return () => clearTimeout(timer);
  }, [p, dirty, saving, stale, error]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const current = withDraftSettings(p, settings);
  const ready = readiness(current, catalog),
    map = variables(current);
  return (
    <div className="stack">
      {p.origin && (
        <Banner title={`From playbook ${p.origin.source_version}`} tone="info">
          Review the supplied scope and entered prices before sending.
        </Banner>
      )}
      {!!p.creation_warnings?.length && (
        <Banner tone="warning" title="Template defaults skipped">
          <ul>
            {p.creation_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}
      {p.ai_unreviewed && (
        <Banner tone="ai" title="Drafted by an assistant — not yet reviewed">
          Review the scope and marked prices. Saving the draft records your
          review.
        </Banner>
      )}
      {p.brief && (
        <details className="card">
          <summary>
            Discovery brief from {p.ai_connector ?? "the author"}
          </summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.brief}</p>
        </details>
      )}
      {error && (
        <Banner
          tone="danger"
          title={stale ? "This draft changed elsewhere" : "Draft was not saved"}
          action={
            stale ? (
              <Button onClick={() => location.reload()}>
                Reload and review
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setError("");
                  void save();
                }}
              >
                Try saving again
              </Button>
            )
          }
        >
          {error}
        </Banner>
      )}
      <div className="actions">
        <Field label="Proposal title">
          <input
            value={p.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </Field>
        <Button
          onClick={() => {
            setDirty(true);
            generation.current++;
            void save();
          }}
          disabled={saving || stale}
        >
          Save and mark reviewed
        </Button>
        <span role="status" className="muted">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button
          disabled={dirty || saving || stale}
          onClick={() =>
            window.open(`/p/${p.id}?preview=1`, "_blank", "noopener")
          }
        >
          Preview as client
        </Button>
        {!dirty && !saving && (
          <a className="btn primary" href={`/proposals/${p.id}/send`}>
            Continue to send
          </a>
        )}
      </div>
      <div className="editor-grid">
        <div className="stack">
          <BlocksEditor
            content={p.content}
            onChange={(content) => change({ content })}
            map={map}
            library={library}
          />
        </div>
        <aside className="card quote-panel stack">
          <h2>Quote</h2>
          <Totals lines={p.quote} currency={p.currency} />
          {p.quote.map((line, i) => {
            const update = (values: Partial<typeof line>) =>
              change({
                quote: p.quote.map((l, n) =>
                  n === i ? { ...l, ...values } : l,
                ),
              });
            return (
              <section className="quote-edit stack" key={line.id}>
                <Field label="Service name">
                  <input
                    value={line.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </Field>
                <Field label="Scope included">
                  <textarea
                    value={line.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </Field>
                <div className="grid">
                  <Field
                    label={`Amount (${p.currency})`}
                    hint={
                      line.list_amount !== null
                        ? `List: ${money(line.list_amount, p.currency)}`
                        : "Custom — check scope and price"
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount / 100}
                      onChange={(e) =>
                        update({
                          amount: Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </Field>
                  <Field label="Quantity">
                    <input
                      type="number"
                      min="1"
                      value={line.qty}
                      onChange={(e) => update({ qty: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Interval">
                    <select
                      value={line.interval}
                      onChange={(e) =>
                        update({
                          interval: e.target.value as typeof line.interval,
                        })
                      }
                    >
                      <option value="one_time">One-time</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                  </Field>
                  <Field label="Minimum term (months)">
                    <input
                      type="number"
                      min="1"
                      value={line.min_term_months ?? ""}
                      onChange={(e) =>
                        update({
                          min_term_months: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </Field>
                </div>
                {line.list_amount !== null &&
                  line.amount !== line.list_amount && (
                    <span className="pill warning">
                      Amount differs from list
                    </span>
                  )}
                <Field label="Display group (optional)">
                  <input
                    value={line.group ?? ""}
                    onChange={(e) => update({ group: e.target.value || null })}
                  />
                </Field>
                {!line.pricing_item_id && (
                  <Field label="Custom product family">
                    <select
                      value={line.custom_family_id ?? ""}
                      onChange={(e) =>
                        update({ custom_family_id: e.target.value || null })
                      }
                    >
                      <option value="">Select a service family</option>
                      {families
                        .filter((f) => f.active)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <details>
                  <summary>Billing reference and schedule</summary>
                  <div className="stack">
                    <Field label="Stripe lookup key">
                      <input
                        value={line.stripe_lookup_key ?? ""}
                        onChange={(e) =>
                          update({ stripe_lookup_key: e.target.value || null })
                        }
                      />
                    </Field>
                    <Field label="QuickBooks item reference">
                      <input
                        value={line.qbo_item_ref ?? ""}
                        onChange={(e) =>
                          update({ qbo_item_ref: e.target.value || null })
                        }
                      />
                    </Field>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!line.schedule}
                        onChange={(e) =>
                          update({
                            schedule: e.target.checked
                              ? {
                                  after_paid_invoices: 1,
                                  then: { amount: 0, lookup_key: "" },
                                }
                              : null,
                          })
                        }
                      />
                      Scheduled step-down
                    </label>
                    {line.schedule && (
                      <>
                        <Field label="After paid invoices">
                          <input
                            type="number"
                            min="1"
                            value={line.schedule.after_paid_invoices}
                            onChange={(e) =>
                              update({
                                schedule: {
                                  ...line.schedule!,
                                  after_paid_invoices: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label={`Then amount (${p.currency})`}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.schedule.then.amount / 100}
                            onChange={(e) =>
                              update({
                                schedule: {
                                  ...line.schedule!,
                                  then: {
                                    ...line.schedule!.then,
                                    amount: Math.round(
                                      Number(e.target.value) * 100,
                                    ),
                                  },
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="Then lookup key">
                          <input
                            value={line.schedule.then.lookup_key}
                            onChange={(e) =>
                              update({
                                schedule: {
                                  ...line.schedule!,
                                  then: {
                                    ...line.schedule!.then,
                                    lookup_key: e.target.value,
                                  },
                                },
                              })
                            }
                          />
                        </Field>
                      </>
                    )}
                    <Field label="Plan terms (JSON)">
                      <textarea
                        defaultValue={
                          line.plan_terms
                            ? JSON.stringify(line.plan_terms, null, 2)
                            : ""
                        }
                        onBlur={(e) => {
                          try {
                            update({
                              plan_terms: e.target.value
                                ? JSON.parse(e.target.value)
                                : null,
                            });
                          } catch {
                            setError(
                              "Plan terms must be valid JSON; changes were not applied.",
                            );
                          }
                        }}
                      />
                    </Field>
                  </div>
                </details>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={line.optional}
                    onChange={(e) =>
                      update({
                        optional: e.target.checked,
                        selected: e.target.checked ? line.selected : true,
                      })
                    }
                  />
                  Optional item
                </label>
                {line.optional && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={line.selected}
                      onChange={(e) => update({ selected: e.target.checked })}
                    />
                    Selected by default
                  </label>
                )}
                <Button
                  variant="ghost"
                  onClick={() =>
                    change({ quote: p.quote.filter((_, n) => n !== i) })
                  }
                >
                  Remove line
                </Button>
              </section>
            );
          })}
          <Field label="Add from catalogue">
            <select
              value=""
              onChange={(e) => {
                const item = catalog.find((i) => i.id === e.target.value);
                if (item)
                  change({
                    quote: [
                      ...p.quote,
                      {
                        ...catalogLine(item, {
                          qty: 1,
                          optional: false,
                          selected: true,
                        }),
                        id: crypto.randomUUID(),
                      },
                    ],
                  });
              }}
            >
              <option value="">Choose a service</option>
              {sellableCatalogue(catalog).map((i) => (
                <option key={i.id} value={i.id}>
                  {itemDisplayName(i)} — {money(i.amount, p.currency)}/
                  {i.interval}
                </option>
              ))}
            </select>
          </Field>
          <Button
            onClick={() =>
              change({
                quote: [
                  ...p.quote,
                  LineSchema.parse({
                    id: crypto.randomUUID(),
                    name: "Custom service",
                    description: "",
                    amount: 0,
                    interval: "one_time",
                    qty: 1,
                    optional: false,
                    selected: true,
                  }),
                ],
              })
            }
          >
            Add custom line
          </Button>
          <div>
            <h3>Ready to send</h3>
            {ready.errors.map((e) => (
              <p key={e} className="danger">
                × {e}
              </p>
            ))}
            {ready.warnings.map((w) => (
              <p key={w} className="warning">
                ! {w}
              </p>
            ))}
            {ready.ready && <p>✓ Content, signatures and quote are ready.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
