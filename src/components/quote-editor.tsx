"use client";
import { fontCss } from "../lib/proposal-fonts";
import { ValidityField } from "./validity-field";
import { readableDate } from "../lib/validity";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, Item, Proposal, QuoteItem, Actor } from "../lib/model";
import type { WorkspaceSettings } from "../lib/workspace";
import type { ReferenceDocument } from "../lib/documents";
import {
  orderedItems,
  catalogQuoteItem,
  draftItems,
  quoteRange,
} from "../lib/quote-model";
import { contentSections, pendingSections } from "../lib/ai-review";
import { variables, intervalLabel, totals } from "../lib/presentation";
import { readiness } from "../lib/quote";
import { withDraftSettings } from "../lib/proposal-settings";
import { sellableCatalogue, itemDisplayName } from "../lib/catalogue-display";
import { FieldEditor } from "./field-editor";
import { api, post, ApiError, Button, Field, Banner, Totals, Icon } from "./ui";
import { useMoney } from "./money-context";
const uid = () => crypto.randomUUID();
export function Sortable({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="quote-sortable"
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag ${label}`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      {children}
    </div>
  );
}
export function Reorder({
  ids,
  onMove,
  children,
}: {
  ids: string[];
  onMove: (from: string, to: string) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (over && active.id !== over.id)
          onMove(String(active.id), String(over.id));
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
function Sheet({
  title,
  close,
  children,
  extra = "",
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  extra?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`editor-sheet ${extra}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <Button onClick={close}>Done</Button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
export function QuoteEditor({
  initial,
  settings,
  catalog,
  families,
  library,
  onSaved,
  staff = [],
  user,
  documents = [],
  initialTab = "Quote",
}: {
  initialTab?: string;
  initial: Proposal;
  settings?: WorkspaceSettings | null;
  catalog: Item[];
  families: { id: string; name: string; active: boolean }[];
  library: { id: string; name: string; block: Block }[];
  onSaved: (p: Proposal) => void;
  staff?: { user_id: string; display_name: string; email: string }[];
  user?: Actor;
  documents?: ReferenceDocument[];
}) {
  const money = useMoney(),
    [p, setP] = useState<Proposal>({
      ...initial,
      quote: draftItems(initial.quote),
    }),
    [customerErrors, setCustomerErrors] = useState<string[]>([]),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    [tab, setTab] = useState(initialTab),
    [drawer, setDrawer] = useState(false),
    [lineId, setLineId] = useState<string | null>(null),
    [reference, setReference] = useState(false),
    [search, setSearch] = useState(""),
    [documentId, setDocumentId] = useState(documents[0]?.id ?? ""),
    [section, setSection] = useState<number | null>(null),
    [names, setNames] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [sender, setSender] = useState(
      user?.actor.slice(6) ?? staff[0]?.user_id ?? "",
    ),
    [note, setNote] = useState(""),
    [protectedLink, setProtected] = useState(!!initial.password_hash),
    [password, setPassword] = useState(""),
    [sending, setSending] = useState(false);
  const cacheKey = `proposal-unsaved:${initial.workspace_id ?? "workspace"}:${initial.id}`;
  const [offline, setOffline] = useState(false),
    [recovery, setRecovery] = useState<Partial<Proposal> | null>(null),
    [deviceSaved, setDeviceSaved] = useState(false);
  useEffect(() => {
    const online = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) setError("");
    };
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
      if (cached) setRecovery(cached);
    } catch {}
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [cacheKey]);
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          revision: p.revision,
          title: p.title,
          content: p.content,
          quote: p.quote,
          valid_until: p.valid_until,
        }),
      );
      setDeviceSaved(true);
    } catch {
      setDeviceSaved(false);
    }
  }, [p, dirty, cacheKey]);
  const generation = useRef(0),
    revision = useRef(initial.revision),
    savingRef = useRef(false),
    latest = useRef(p);
  latest.current = p;
  function change(update: Partial<Proposal>) {
    generation.current++;
    setDirty(true);
    setP((current) => ({ ...current, ...update }));
  }
  async function save() {
    if (savingRef.current || stale || offline) return false;
    if (!dirty) return true;
    savingRef.current = true;
    setSaving(true);
    const captured = generation.current,
      value = latest.current;
    try {
      const result = await api<Proposal>(`/api/proposals/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: revision.current,
          title: value.title,
          content: value.content,
          quote: value.quote,
          valid_until: value.valid_until,
        }),
      });
      revision.current = result.revision;
      if (captured === generation.current) {
        setP({ ...result, quote: draftItems(result.quote) });
        setDirty(false);
        try {
          localStorage.removeItem(cacheKey);
        } catch {}
        setRecovery(null);
        onSaved(result);
      } else setP((v) => ({ ...v, revision: result.revision }));
      setError("");
      return captured === generation.current;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setStale(true);
      setError(e instanceof Error ? e.message : "Unable to save");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!dirty || saving || stale || error || offline) return;
    const id = setTimeout(() => void save(), 900);
    return () => clearTimeout(id);
  }, [p, dirty, saving, stale, error, offline]);
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
  useEffect(() => {
    let active = true;
    api<{ errors: string[] }>(`/api/proposals/${p.id}/ready`)
      .then((result) => {
        if (active && Array.isArray(result.errors))
          setCustomerErrors(
            result.errors.filter(
              (e) =>
                e === "Choose which Stripe customer this client is" ||
                e.startsWith("Stripe customer check unavailable:"),
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [p.id, p.revision]);
  const current = withDraftSettings(p, settings),
    items = orderedItems(p.quote),
    sections = contentSections(p.content),
    pending = pendingSections(p),
    map = variables({
      ...current,
      sender: staff.find((s) => s.user_id === sender)
        ? {
            ...current.sender!,
            ...staff.find((s) => s.user_id === sender)!,
            company_name: settings?.company_name ?? "",
            sending_domain: settings?.sending_domain ?? "",
          }
        : current.sender,
    }),
    ready = readiness(current, catalog, new Date(), confirmed);
  ready.errors.push(...customerErrors);
  ready.ready = !ready.errors.length;
  function setItems(next: QuoteItem[]) {
    change({
      quote: next.map((i, order) => ({
        ...i,
        order,
        selected: !i.optional || i.default_selected,
      })),
    });
  }
  function updateItem(id: string, update: Partial<QuoteItem>) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...update } : i)));
  }
  function defaultItem(item: QuoteItem, value: boolean) {
    setItems(
      items.map((i) =>
        i.id === item.id
          ? { ...i, default_selected: value }
          : value &&
              item.choice_group_id &&
              i.choice_group_id === item.choice_group_id
            ? { ...i, default_selected: false }
            : i,
      ),
    );
  }
  function unlink(group: string) {
    setItems(
      items.map((i) =>
        i.choice_group_id === group ? { ...i, choice_group_id: null } : i,
      ),
    );
  }
  function link(item: QuoteItem, targetId: string) {
    const target = items.find((i) => i.id === targetId);
    if (!target) return;
    const group = target.choice_group_id ?? uid();
    setItems(
      items.map((i) =>
        i.id === item.id || i.id === target.id
          ? {
              ...i,
              optional: true,
              choice_group_id: group,
              default_selected:
                i.id === target.id ? target.default_selected : false,
            }
          : i,
      ),
    );
  }
  function addItem(item?: Item) {
    const id = uid(),
      value = item
        ? catalogQuoteItem(
            item,
            items.length,
            id,
            Array.from({ length: item.sublines?.length || 1 }, uid),
          )
        : {
            id,
            order: items.length,
            name: "Custom item",
            description: "",
            source: "custom" as const,
            pricing_item_id: null,
            custom_family_id: null,
            sublines: [
              {
                id: uid(),
                amount: 0,
                list_amount: null,
                interval: "one_time" as const,
                qty: 1,
                stripe_lookup_key: null,
                qbo_item_ref: null,
              },
            ],
            optional: false,
            default_selected: true,
            choice_group_id: null,
            min_term_months: null,
            schedule: null,
            plan_terms: null,
          };
    setItems([...items, value]);
    if (window.innerWidth < 700) setLineId(id);
  }
  function patchBlock(index: number, block: Block) {
    change({ content: p.content.map((b, n) => (n === index ? block : b)) });
  }
  const doc = documents.find((d) => d.id === documentId),
    range = quoteRange(items);
  const refPanel = (
    <div className="stack">
      <p className="eyebrow">Pricing reference · read only</p>
      {documents.length > 1 && (
        <Field label="Document">
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {doc ? (
        <>
          <h3>{doc.name}</h3>
          <p>
            Version {doc.version} ·{" "}
            {doc.fetched_at
              ? new Date(doc.fetched_at).toLocaleString()
              : "Pasted text"}
          </p>
          <code className="fetch-hash">{doc.content_hash}</code>
          {doc.fetch_error && (
            <Banner tone="warning" title="Showing last good version">
              {doc.fetch_error}
            </Banner>
          )}
          <Field label="Search reference">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
            />
          </Field>
          <pre className="pricing-reference">
            {search
              ? doc.content
                  .split("\n")
                  .filter((l) =>
                    l.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
                  )
                  .join("\n") || "No matching lines"
              : doc.content}
          </pre>
        </>
      ) : (
        <p>
          No pricing reference has been added. Add one in Workspace settings.
        </p>
      )}
    </div>
  );
  function itemCard(i: QuoteItem, full = true) {
    return (
      <section className="quote-item" key={i.id}>
        <header>
          {full ? (
            <input
              className="item-title"
              aria-label="Item name"
              value={i.name}
              onChange={(e) => updateItem(i.id, { name: e.target.value })}
            />
          ) : (
            <button className="item-title" onClick={() => setLineId(i.id)}>
              {i.name}
            </button>
          )}
          <Button
            variant="ghost"
            aria-label={`Remove ${i.name}`}
            onClick={() => {
              setItems(items.filter((v) => v.id !== i.id));
              if (lineId === i.id) setLineId(null);
            }}
          >
            × Remove
          </Button>
        </header>
        {full ? (
          <>
            <Field label="Description">
              <textarea
                value={i.description}
                onChange={(e) =>
                  updateItem(i.id, { description: e.target.value })
                }
              />
            </Field>
            {i.sublines.map((s) => (
              <div className="subline" key={s.id}>
                <div className="subline-label">
                  <input
                    aria-label={`Sub-line label for ${i.name}`}
                    placeholder="Sub-line label (optional)"
                    value={s.label ?? ""}
                    onChange={(e) =>
                      updateItem(i.id, {
                        sublines: i.sublines.map((v) =>
                          v.id === s.id ? { ...v, label: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  {i.sublines.length > 1 && (
                    <Button
                      variant="ghost"
                      aria-label={`Remove sub-line ${s.label || intervalLabel(s.interval)}`}
                      onClick={() =>
                        updateItem(i.id, {
                          sublines: i.sublines.filter((v) => v.id !== s.id),
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="subline-grid">
                  <Field label={`Amount · ${p.currency}`}>
                    <input
                      aria-label={`Amount ${s.label || i.name}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={s.amount / 100}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? {
                                  ...v,
                                  amount: Math.round(
                                    Number(e.target.value) * 100,
                                  ),
                                }
                              : v,
                          ),
                          price_review: Object.fromEntries(
                            Object.entries(i.price_review ?? {}).filter(
                              ([key]) => key !== s.id,
                            ),
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Qty">
                    <input
                      aria-label={`Quantity ${s.label || i.name}`}
                      type="number"
                      min="1"
                      max="10000"
                      value={s.qty}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? { ...v, qty: Number(e.target.value) }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Interval">
                    <select
                      aria-label={`Interval ${s.label || i.name}`}
                      value={s.interval}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? {
                                  ...v,
                                  interval: e.target.value as typeof s.interval,
                                }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="one_time">One-time</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                  </Field>
                </div>
                {(i.ai_entered || p.ai_unreviewed) &&
                  s.list_amount !== null &&
                  s.amount !== s.list_amount &&
                  !i.price_review?.[s.id] && (
                    <div className="price-review">
                      <p>AI-entered price differs from list.</p>
                      <Button
                        onClick={() =>
                          updateItem(i.id, {
                            sublines: i.sublines.map((v) =>
                              v.id === s.id
                                ? { ...v, amount: s.list_amount! }
                                : v,
                            ),
                            price_review: { ...i.price_review, [s.id]: "list" },
                          })
                        }
                      >
                        Use {money(s.list_amount, p.currency)}
                      </Button>
                      <Button
                        onClick={() =>
                          updateItem(i.id, {
                            price_review: { ...i.price_review, [s.id]: "keep" },
                          })
                        }
                      >
                        Keep {money(s.amount, p.currency)}
                      </Button>
                    </div>
                  )}
                <details>
                  <summary>Billing mapping</summary>
                  <Field label="Stripe lookup key">
                    <input
                      value={s.stripe_lookup_key ?? ""}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? {
                                  ...v,
                                  stripe_lookup_key: e.target.value || null,
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="QuickBooks item">
                    <input
                      value={s.qbo_item_ref ?? ""}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? { ...v, qbo_item_ref: e.target.value || null }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                </details>
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() =>
                updateItem(i.id, {
                  sublines: [
                    ...i.sublines,
                    {
                      id: uid(),
                      amount: 0,
                      list_amount: null,
                      interval: "one_time",
                      qty: 1,
                      stripe_lookup_key: null,
                      qbo_item_ref: null,
                    },
                  ],
                })
              }
            >
              + Sub-line
            </Button>
            <div className="item-options">
              <label className="check">
                <input
                  type="checkbox"
                  role="switch"
                  checked={i.optional}
                  onChange={(e) => {
                    if (!e.target.checked && i.choice_group_id) {
                      setItems(
                        items.map((v) =>
                          v.choice_group_id === i.choice_group_id
                            ? {
                                ...v,
                                choice_group_id: null,
                                ...(v.id === i.id
                                  ? { optional: false, default_selected: true }
                                  : {}),
                              }
                            : v,
                        ),
                      );
                    } else
                      updateItem(i.id, {
                        optional: e.target.checked,
                        default_selected: true,
                      });
                  }}
                />
                Optional
              </label>
              {i.optional && (
                <label className="check">
                  <input
                    type={i.choice_group_id ? "radio" : "checkbox"}
                    name={i.choice_group_id ?? i.id}
                    checked={i.default_selected}
                    onChange={(e) => defaultItem(i, e.target.checked)}
                  />
                  {i.choice_group_id
                    ? "Selected for client"
                    : "Ticked for client"}
                </label>
              )}
            </div>
            {i.choice_group_id ? (
              <Button
                variant="ghost"
                onClick={() => unlink(i.choice_group_id!)}
              >
                Remove alternative link
              </Button>
            ) : (
              <Field label="Link as alternative">
                <select value="" onChange={(e) => link(i, e.target.value)}>
                  <option value="">Choose another optional item</option>
                  {items
                    .filter((v) => v.id !== i.id && v.optional)
                    .map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {i.source === "custom" && (
              <Field label="Custom family">
                <select
                  value={i.custom_family_id ?? ""}
                  onChange={(e) =>
                    updateItem(i.id, {
                      custom_family_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">No family — one-time only</option>
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
              <summary>Plan terms</summary>
              {i.schedule && (
                <p>
                  {money(
                    i.sublines.find((s) => s.interval !== "one_time")?.amount ??
                      0,
                    p.currency,
                  )}{" "}
                  for {i.schedule.after_paid_invoices} paid invoices, then{" "}
                  {money(i.schedule.then.amount, p.currency)}.
                </p>
              )}
              {i.min_term_months && (
                <p>{i.min_term_months}-month minimum commitment</p>
              )}
              <pre>{JSON.stringify(i.plan_terms, null, 2)}</pre>
              <small>Terms and schedule come from the products.</small>
            </details>
          </>
        ) : (
          <div className="item-compact">
            {i.sublines.map((s) => (
              <p key={s.id}>
                {s.label || intervalLabel(s.interval)}
                <strong>{money(s.amount * s.qty, p.currency)}</strong>
              </p>
            ))}
            <small>
              {i.choice_group_id
                ? "Choose one"
                : i.optional
                  ? "Optional"
                  : "Required"}
            </small>
            <Button onClick={() => setLineId(i.id)}>Edit item</Button>
          </div>
        )}
        <Button variant="ghost" onClick={() => setReference(true)}>
          Look up
        </Button>
      </section>
    );
  }
  const units = Array.from(
      new Set(items.map((i) => i.choice_group_id ?? i.id)),
    ),
    unitItems = (id: string) =>
      items.filter((i) => (i.choice_group_id ?? i.id) === id);
  const quotePanel = (
    <div className="quote-panel stack">
      <p className="muted">
        Enter agreed prices. Reference text never sets prices automatically.
      </p>
      <div className="quote-cards">
        <Reorder
          ids={units}
          onMove={(from, to) => {
            const order = arrayMove(
              units,
              units.indexOf(from),
              units.indexOf(to),
            );
            setItems(order.flatMap(unitItems));
          }}
        >
          {units.map((id) => (
            <Sortable
              key={id}
              id={id}
              label={
                unitItems(id)[0].choice_group_id
                  ? "choice group"
                  : unitItems(id)[0].name
              }
            >
              {unitItems(id)[0].choice_group_id ? (
                <div className="editor-choice-group">
                  <h3>Choose one</h3>
                  <Reorder
                    ids={unitItems(id).map((i) => i.id)}
                    onMove={(from, to) => {
                      const options = unitItems(id),
                        next = arrayMove(
                          options,
                          options.findIndex((i) => i.id === from),
                          options.findIndex((i) => i.id === to),
                        );
                      setItems(
                        units.flatMap((u) => (u === id ? next : unitItems(u))),
                      );
                    }}
                  >
                    {unitItems(id).map((i) => (
                      <Sortable key={i.id} id={i.id} label={i.name}>
                        <div className="desktop-item">{itemCard(i)}</div>
                        <div className="phone-item">{itemCard(i, false)}</div>
                      </Sortable>
                    ))}
                  </Reorder>
                </div>
              ) : (
                <>
                  <div className="desktop-item">
                    {itemCard(unitItems(id)[0])}
                  </div>
                  <div className="phone-item">
                    {itemCard(unitItems(id)[0], false)}
                  </div>
                </>
              )}
            </Sortable>
          ))}
        </Reorder>
        <Field label="Add from products">
          <select
            value=""
            onChange={(e) => {
              const item = catalog.find((i) => i.id === e.target.value);
              if (item) addItem(item);
            }}
          >
            <option value="">Choose an item</option>
            {sellableCatalogue(catalog)
              .filter((c) => !items.some((i) => i.pricing_item_id === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {itemDisplayName(c)}
                </option>
              ))}
          </select>
        </Field>
        <Button onClick={() => addItem()}>+ Custom item</Button>
      </div>
      <footer>
        <p className="eyebrow">Client sees by default</p>
        <Totals lines={items} currency={p.currency} />
        <p className="muted">
          Across all choices · One-time{" "}
          {money(range.min.one_time_total, p.currency)}–
          {money(range.max.one_time_total, p.currency)} · Monthly{" "}
          {money(range.min.monthly_total, p.currency)}–
          {money(range.max.monthly_total, p.currency)}
          {items.some((i) => i.sublines.some((s) => s.interval === "year")) &&
            ` · Yearly ${money(range.min.yearly_total, p.currency)}–${money(range.max.yearly_total, p.currency)}`}
        </p>
      </footer>
    </div>
  );
  const sendPanel = (
    <div className="stack">
      <h3>Ready to send?</h3>
      <ul className="send-checklist">
        {ready.errors.map((e, n) => (
          <li className="readiness-row blocker" key={n}>
            <Icon name="declined" />
            <div>
              <strong>Blocker</strong>
              <p>{e}</p>
              {e === "Choose which Stripe customer this client is" && (
                <a href={`/clients/${p.client.id}#stripe-customers`}>
                  Choose Stripe customer
                </a>
              )}
            </div>
          </li>
        ))}
        {ready.warnings.map((e, n) => (
          <li className="readiness-row warning" key={n}>
            <Icon name="review" />
            <div>
              <strong>Review</strong>
              <p>{e}</p>
            </div>
          </li>
        ))}
        {ready.ready && (
          <li className="readiness-row success">
            <Icon name="verified" />
            <p>Content, quote and signature blocks are ready.</p>
          </li>
        )}
      </ul>
      {pending.length > 0 && (
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I have reviewed these AI-written sections: {pending.join(", ")}.
        </label>
      )}
      <Field label="From">
        <select value={sender} onChange={(e) => setSender(e.target.value)}>
          {staff.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.display_name} · {settings?.company_name} &lt;{s.email}&gt;
            </option>
          ))}
        </select>
      </Field>
      <Field label="To">
        <input
          value={`${p.client.first_name} ${p.client.last_name} <${p.client.email}>`}
          readOnly
        />
      </Field>
      <Field label="Note">
        <textarea
          placeholder="A personal note for your client"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          role="switch"
          checked={protectedLink}
          onChange={(e) => setProtected(e.target.checked)}
        />
        Require a password
      </label>
      {protectedLink && (
        <Field label="Password">
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            placeholder={
              p.password_hash
                ? "Leave blank to keep current password"
                : "At least 8 characters"
            }
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <small>
        The client link is added automatically. From must match{" "}
        {settings?.sending_domain || "the workspace’s verified domain"}.
      </small>
      <div className="actions">
        <Button
          onClick={async () => {
            if (await save())
              window.open(`/p/${p.id}?preview=1`, "_blank", "noopener");
          }}
        >
          Preview
        </Button>
        <Button
          variant="primary"
          disabled={
            !ready.ready ||
            stale ||
            offline ||
            saving ||
            sending ||
            (protectedLink && !p.password_hash && password.length < 8)
          }
          note={
            !ready.ready
              ? "Resolve the checks above before sending."
              : undefined
          }
          busy={sending}
          onClick={async () => {
            if (!(await save())) return;
            setSending(true);
            try {
              await post(`/api/proposals/${p.id}/send`, {
                confirm_ai_review: confirmed,
                sender_user_id: sender,
                note,
                ...(!protectedLink
                  ? { password: null }
                  : password
                    ? { password }
                    : {}),
              });
              location.href = `/proposals/${p.id}`;
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to send");
            } finally {
              setSending(false);
            }
          }}
        >
          Send to {p.client.first_name || "client"}
        </Button>
      </div>
    </div>
  );
  const panel = (
    <>
      <div className="editor-tabs" role="tablist" aria-label="Proposal tools">
        {["Quote", "Pricing reference", "Review & send"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "Quote"
          ? quotePanel
          : tab === "Pricing reference"
            ? refPanel
            : sendPanel}
      </div>
    </>
  );
  function blockEditor(b: Block, n: number) {
    return (
      <div className="draft-block" key={b.id ?? n}>
        {b.type === "heading" ? (
          <input
            className="document-heading"
            aria-label={`Heading ${n + 1}`}
            value={b.text ?? ""}
            onChange={(e) => patchBlock(n, { ...b, text: e.target.value })}
          />
        ) : b.type === "paragraph" ? (
          <FieldEditor
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
              patchBlock(n, { ...b, content, text: undefined })
            }
            map={map}
            showNames={names}
          />
        ) : b.type === "pricing_table" ? (
          <div className="editor-investment">
            <h2>Your investment</h2>
            {units.map((id) => (
              <div
                key={id}
                className={
                  unitItems(id)[0].choice_group_id ? "editor-choice-group" : ""
                }
              >
                {unitItems(id)[0].choice_group_id && (
                  <p className="eyebrow">Choose one</p>
                )}
                {unitItems(id).map((i) => (
                  <div className="document-item" key={i.id}>
                    <span>
                      {i.optional ? (i.default_selected ? "◉" : "○") : "✓"}
                    </span>
                    <div>
                      <strong>{i.name}</strong>
                      <p>{i.description}</p>
                      {i.sublines.map((s) => (
                        <p className="document-subline" key={s.id}>
                          <span>{s.label || intervalLabel(s.interval)}</span>
                          <strong>
                            {money(s.amount * s.qty, p.currency)}
                            {s.interval === "month"
                              ? "/mo"
                              : s.interval === "year"
                                ? "/yr"
                                : ""}
                          </strong>
                        </p>
                      ))}
                      {i.min_term_months && (
                        <small>
                          {i.min_term_months}-month minimum commitment.
                        </small>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <Totals lines={items} currency={p.currency} />
          </div>
        ) : b.type === "contract" ? (
          <div className="contract-editor">
            <h2>{b.text || "Statement of Work & Contract"}</h2>
            {b.contract_edited && (
              <p className="warning">Contract edited for this proposal.</p>
            )}
            {(b.clauses ?? []).map((c, k) => (
              <details key={c.id} open>
                <summary>
                  {c.heading}
                  {c.draft && " · Draft wording"}
                </summary>
                <Field label="Clause heading">
                  <input
                    value={c.heading}
                    onChange={(e) =>
                      patchBlock(n, {
                        ...b,
                        contract_edited: true,
                        clauses: b.clauses!.map((v, j) =>
                          j === k ? { ...v, heading: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Clause body">
                  <textarea
                    value={c.body}
                    onChange={(e) =>
                      patchBlock(n, {
                        ...b,
                        contract_edited: true,
                        clauses: b.clauses!.map((v, j) =>
                          j === k ? { ...v, body: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Show when">
                  <select
                    value={c.show_when?.pricing_item_id ?? ""}
                    onChange={(e) =>
                      patchBlock(n, {
                        ...b,
                        contract_edited: true,
                        clauses: b.clauses!.map((v, j) =>
                          j === k
                            ? {
                                ...v,
                                show_when: e.target.value
                                  ? {
                                      kind: "item_selected",
                                      pricing_item_id: e.target.value,
                                    }
                                  : null,
                              }
                            : v,
                        ),
                      })
                    }
                  >
                    <option value="">Always</option>
                    {sellableCatalogue(catalog).map((i) => (
                      <option key={i.id} value={i.id}>
                        {itemDisplayName(i)} is selected
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  variant="ghost"
                  onClick={() =>
                    patchBlock(n, {
                      ...b,
                      contract_edited: true,
                      clauses: b.clauses!.filter((_, j) => j !== k),
                    })
                  }
                >
                  Remove clause
                </Button>
                <Button
                  variant="ghost"
                  disabled={k === 0}
                  onClick={() => {
                    const clauses = [...b.clauses!];
                    [clauses[k - 1], clauses[k]] = [clauses[k], clauses[k - 1]];
                    patchBlock(n, { ...b, contract_edited: true, clauses });
                  }}
                >
                  Move clause up
                </Button>
                <Button
                  variant="ghost"
                  disabled={k === b.clauses!.length - 1}
                  onClick={() => {
                    const clauses = [...b.clauses!];
                    [clauses[k + 1], clauses[k]] = [clauses[k], clauses[k + 1]];
                    patchBlock(n, { ...b, contract_edited: true, clauses });
                  }}
                >
                  Move clause down
                </Button>
              </details>
            ))}
            <Button
              onClick={() =>
                patchBlock(n, {
                  ...b,
                  contract_edited: true,
                  clauses: [
                    ...(b.clauses ?? []),
                    {
                      id: uid(),
                      heading: "New clause",
                      body: "",
                      show_when: null,
                    },
                  ],
                })
              }
            >
              + Clause
            </Button>
          </div>
        ) : b.type === "signature_block" ? (
          <div className="editor-signature">
            <Field label="Signer role">
              <select
                value={b.role ?? "client"}
                onChange={(e) =>
                  patchBlock(n, {
                    ...b,
                    role: e.target.value as "client" | "company",
                  })
                }
              >
                <option value="client">Client</option>
                <option value="company">Company</option>
              </select>
            </Field>
            <p className="eyebrow">
              {b.role === "client" ? "Client signature" : "Company signature"}
            </p>
            <strong>
              {b.role === "client"
                ? `${p.client.first_name} ${p.client.last_name}`
                : settings?.company_signatory?.name || settings?.owner}
            </strong>
            <p>
              {b.role === "client"
                ? p.client.title
                : settings?.company_signatory?.title}
            </p>
            <div className="signature-rule" />
          </div>
        ) : b.type === "image" ? (
          <>
            <img src={b.src} alt={b.alt ?? ""} />
            <Field label="Image description">
              <input
                value={b.alt ?? ""}
                onChange={(e) => patchBlock(n, { ...b, alt: e.target.value })}
              />
            </Field>
          </>
        ) : b.type === "variable" ? (
          <span className="field-chip">
            {names ? `{{${b.path}}}` : map[b.path ?? ""]}
          </span>
        ) : (
          <hr />
        )}
        <div className="draft-block-actions">
          <Button
            variant="ghost"
            disabled={n === 0}
            onClick={() => {
              const next = [...p.content];
              [next[n - 1], next[n]] = [next[n], next[n - 1]];
              change({ content: next });
            }}
          >
            Move up
          </Button>
          <Button
            variant="ghost"
            disabled={n === p.content.length - 1}
            onClick={() => {
              const next = [...p.content];
              [next[n + 1], next[n]] = [next[n], next[n + 1]];
              change({ content: next });
            }}
          >
            Move down
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await post("/api/content_library", {
                  id: uid(),
                  name: b.text || `${b.type} block`,
                  block: b,
                });
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to save block",
                );
              }
            }}
          >
            Save block for reuse
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              change({ content: p.content.filter((_, j) => j !== n) })
            }
          >
            Remove block
          </Button>
        </div>
      </div>
    );
  }
  function sectionEditor(s: (typeof sections)[number], n: number) {
    return (
      <section
        className={`document-section ${s.pending ? "ai-pending" : ""}`}
        id={`draft-section-${n}`}
        key={s.id}
      >
        {s.pending && (
          <div className="section-review">
            <span>AI-written · review this section</span>
            <Button
              onClick={() =>
                change({
                  content: p.content.map((b, j) =>
                    s.indices.includes(j)
                      ? {
                          ...b,
                          ai_review: {
                            source: b.ai_review?.source ?? "assistant",
                            reviewed: true,
                          },
                        }
                      : b,
                  ),
                })
              }
            >
              Mark reviewed
            </Button>
          </div>
        )}
        {s.indices.map((j) => blockEditor(p.content[j], j))}
      </section>
    );
  }
  const insert = (type: Block["type"]) => {
    change({
      content: [
        ...p.content,
        {
          id: uid(),
          type,
          ...(type === "heading"
            ? { text: "New section" }
            : type === "paragraph"
              ? { content: { type: "doc", content: [{ type: "paragraph" }] } }
              : type === "contract"
                ? { clauses: [] }
                : type === "signature_block"
                  ? { role: "client" as const }
                  : {}),
        },
      ],
    });
  };
  return (
    <div
      className={`quote-workspace ${section === null ? "section-list-mode" : "section-edit-mode"}`}
    >
      <header className="quote-editor-top">
        <a href="/proposals">‹ Proposals</a>
        <div className="title-field">
          <label className="screen-reader" htmlFor="draft-title">
            Proposal title
          </label>
          <input
            id="draft-title"
            value={p.title}
            onChange={(e) => change({ title: e.target.value })}
          />
          <small role="status">
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : "All changes saved"}
          </small>
        </div>
        <Button
          variant="ghost"
          disabled={saving || stale}
          onClick={async () => {
            if (await save())
              window.open(`/p/${p.id}?preview=1`, "_blank", "noopener");
          }}
        >
          Preview as client
        </Button>
        <Button
          className="tablet-tools"
          aria-label="Quote & totals"
          onClick={() => {
            setTab("Quote");
            if (window.innerWidth < 1100) setDrawer(true);
          }}
        >
          Quote & totals
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setTab("Review & send");
            if (window.innerWidth < 1100) setDrawer(true);
          }}
        >
          Review & send
        </Button>
      </header>
      {p.ai_unreviewed && (
        <Banner tone="ai" title="Assistant draft — ready for your review">
          Read the saved sections as they appear. A person reviews the content
          and entered prices before sending.
        </Banner>
      )}
      {offline && (
        <Banner tone="warning" title="You’re offline. Sending is paused.">
          {deviceSaved
            ? "Your changes are kept on this device."
            : "Keep this page open to retain your changes."}{" "}
          We’ll save them when you’re back online.
        </Banner>
      )}
      {recovery && (
        <Banner
          tone="warning"
          title="Your unsaved edits were kept as a suggestion."
        >
          <p>
            Review the current draft before restoring your edits. Nothing has
            been overwritten.
          </p>
          <details>
            <summary>See my saved changes</summary>
            <div className="recovery-copy">
              <h3>{recovery.title}</h3>
              {recovery.content?.map((b, n) => (
                <p key={n}>
                  {b.text ||
                    (b.type === "contract" &&
                      b.clauses?.map((c) => c.heading).join(" · ")) ||
                    "Document section"}
                </p>
              ))}
              <p>{recovery.quote?.length ?? 0} saved quote items.</p>
            </div>
          </details>
          <Button
            onClick={() => {
              const { revision: ignored, ...edits } = recovery;
              change(edits);
              setRecovery(null);
            }}
          >
            Restore my edits
          </Button>
          <Button
            onClick={() => {
              localStorage.removeItem(cacheKey);
              setRecovery(null);
            }}
          >
            Keep current draft
          </Button>
        </Banner>
      )}
      {error && (
        <Banner
          tone="danger"
          title={
            stale
              ? "This draft changed elsewhere"
              : "Your changes are kept here"
          }
        >
          {error}
          <Button
            onClick={() =>
              stale
                ? void (async () => {
                    try {
                      const edits = {
                        title: p.title,
                        content: p.content,
                        quote: p.quote,
                        valid_until: p.valid_until,
                      };
                      const current = await api<Proposal>(
                        `/api/proposals/${p.id}`,
                      );
                      setRecovery(edits);
                      revision.current = current.revision;
                      setP({ ...current, quote: draftItems(current.quote) });
                      setDirty(false);
                      setStale(false);
                      setError("");
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Unable to load the current draft",
                      );
                    }
                  })()
                : void save()
            }
          >
            {stale ? "Reload and keep mine" : "Try saving again"}
          </Button>
        </Banner>
      )}
      {p.creation_warnings?.length ? (
        <Banner tone="warning" title="Template defaults skipped">
          {p.creation_warnings.join("; ")}
        </Banner>
      ) : null}
      <div className="editor-layout">
        <aside className="editor-outline">
          <p className="eyebrow">Sections</p>
          <nav>
            {sections.map((s, n) => (
              <button
                className={section === n ? "active" : ""}
                key={s.id}
                onClick={() => {
                  setSection(n);
                  document
                    .getElementById(`draft-section-${n}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span>{String(n + 1).padStart(2, "0")}</span>
                {s.title}
                <small>{s.pending ? "Review" : "✓"}</small>
              </button>
            ))}
          </nav>
          <p className="eyebrow">AI review</p>
          <p>
            {sections.length - pending.length} of {sections.length} sections
            reviewed
          </p>
          <progress
            value={sections.length - pending.length}
            max={sections.length || 1}
          />
          <p className="eyebrow">Fields</p>
          <label className="check">
            <input
              type="checkbox"
              role="switch"
              checked={names}
              onChange={(e) => setNames(e.target.checked)}
            />
            Show names
          </label>
          {[
            "client.first_name",
            "client.full_name",
            "client.company",
            "workspace.name",
            "sender.name",
            "proposal.date",
            "proposal.valid_until",
            "proposal.validity",
            "client.address",
            "quote.one_time_total",
            "quote.monthly_total",
          ].map((k) => (
            <button
              className="field-chip"
              key={k}
              onClick={() =>
                change({
                  content: [
                    ...p.content,
                    { id: uid(), type: "variable", path: k },
                  ],
                })
              }
            >
              {names ? `{{${k}}}` : map[k] || k}
            </button>
          ))}
        </aside>
        <main className="editor-document-region">
          <div className="phone-section-list">
            <p className="eyebrow">Proposal for {p.client.company}</p>
            <h1>{p.title}</h1>
            <p>Choose a section to edit.</p>
            {sections.map((s, n) => (
              <button key={s.id} onClick={() => setSection(n)}>
                <span>{String(n + 1).padStart(2, "0")}</span>
                <strong>{s.title}</strong>
                <small>{s.pending ? "Review" : "✓"} ›</small>
              </button>
            ))}
            <Button
              onClick={() => {
                setTab("Quote");
                if (window.innerWidth < 1100) setDrawer(true);
              }}
            >
              Edit quote
            </Button>
          </div>
          <div className="phone-section-nav">
            <Button onClick={() => setSection(null)}>‹ Sections</Button>
            <div>
              <Button
                aria-label="Previous section"
                disabled={section === null || section === 0}
                onClick={() => setSection((section ?? 1) - 1)}
              >
                ‹ Previous
              </Button>
              <Button
                aria-label="Next section"
                disabled={section === null || section >= sections.length - 1}
                onClick={() => setSection((section ?? 0) + 1)}
              >
                Next ›
              </Button>
            </div>
          </div>
          <article className="paper editor-paper proposal-typography">
            <style>{fontCss(p.workspace_settings)}</style>
            <header className="editor-cover">
              <p className="eyebrow">Proposal for {p.client.company}</p>
              <h1>{p.title}</h1>
              <p>
                From <span className="field-chip">{map["sender.name"]}</span>
                {p.valid_until && (
                  <>
                    {" "}
                    · Valid until{" "}
                    <span className="field-chip">
                      {readableDate(
                        p.valid_until,
                        p.workspace_settings?.timezone,
                      )}
                    </span>
                  </>
                )}
              </p>
            </header>
            {sections.map((s, n) => (
              <div
                className={section === n ? "phone-active-section" : ""}
                key={s.id}
              >
                {sectionEditor(s, n)}
              </div>
            ))}
          </article>
          <div className="editor-insert">
            <label className="btn">
              Add image
              <input
                className="screen-reader"
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (
                    file.size > 700000 ||
                    !["image/png", "image/jpeg"].includes(file.type)
                  ) {
                    setError("Use a PNG or JPEG smaller than 700 KB");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () =>
                    change({
                      content: [
                        ...latest.current.content,
                        {
                          id: uid(),
                          type: "image",
                          src: String(reader.result),
                          alt: file.name,
                        },
                      ],
                    });
                  reader.onerror = () =>
                    setError("Unable to read image. Your draft is unchanged.");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <select
              aria-label="Add block"
              value=""
              onChange={(e) => {
                if (e.target.value) insert(e.target.value as Block["type"]);
              }}
            >
              <option value="">+ Add block</option>
              {[
                "heading",
                "paragraph",
                "pricing_table",
                "contract",
                "signature_block",
                "page_break",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {library.length > 0 && (
              <select
                aria-label="Insert saved block"
                value=""
                onChange={(e) => {
                  const b = library.find((b) => b.id === e.target.value);
                  if (b)
                    change({
                      content: [
                        ...p.content,
                        { ...structuredClone(b.block), id: uid() },
                      ],
                    });
                }}
              >
                <option value="">Insert saved block</option>
                {library.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <Field label="Valid until">
              <ValidityField
                timezone={p.workspace_settings?.timezone ?? "UTC"}
                value={p.valid_until}
                onChange={(valid_until) => change({ valid_until })}
              />
            </Field>
          </div>
        </main>
        <aside className="editor-sidepanel">{panel}</aside>
      </div>
      {drawer && (
        <Sheet title={tab} close={() => setDrawer(false)} extra="tools-sheet">
          {panel}
        </Sheet>
      )}
      {lineId && items.find((i) => i.id === lineId) && (
        <Sheet
          title="Edit item"
          close={() => setLineId(null)}
          extra="line-sheet"
        >
          {itemCard(items.find((i) => i.id === lineId)!)}
        </Sheet>
      )}
      {reference && (
        <Sheet
          title="Pricing reference"
          close={() => setReference(false)}
          extra="reference-sheet"
        >
          {refPanel}
        </Sheet>
      )}
    </div>
  );
}
