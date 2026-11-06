"use client";
import type { QuoteItem, Item } from "../lib/model";
import { quoteRange } from "../lib/quote-model";
import { sellableCatalogue, itemDisplayName } from "../lib/catalogue-display";
import {
  sublineLabel,
  ambiguousSublines,
  removeSubline,
} from "../lib/subline-label";
import { DisclosureChevron } from "./disclosure-chevron";
import { Reorder, Sortable } from "./sortable";
import { arrayMove } from "@dnd-kit/sortable";
import { useMoney } from "./money-context";
import { Button, Field, Disclosure, Totals } from "./ui";
const uid = () => crypto.randomUUID();
/** One quote panel for proposals and template defaults; callers own history and persistence. */
export function QuoteItemsPanel({
  items,
  catalog,
  families,
  currency,
  aiUnreviewed = false,
  onChange,
  addItem,
  expandedItem,
  setExpandedItem,
  itemDetails,
  setItemDetails,
  intro,
}: {
  items: QuoteItem[];
  catalog: Item[];
  families: { id: string; name: string; active: boolean }[];
  currency: string;
  aiUnreviewed?: boolean;
  onChange: (next: QuoteItem[]) => void;
  addItem: (item?: Item) => void;
  expandedItem: string | null;
  setExpandedItem: (id: string | null) => void;
  itemDetails: string | null;
  setItemDetails: (id: string | null) => void;
  intro?: string;
}) {
  const money = useMoney(),
    range = quoteRange(items),
    setItems = onChange;
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
  function itemCard(i: QuoteItem) {
    const expanded = expandedItem === i.id;
    const tag = i.choice_group_id
      ? `Choose one${i.default_selected ? " · default" : ""}`
      : i.source === "custom" && !i.optional
        ? "Required · custom line"
        : i.optional
          ? `Optional · ${i.default_selected ? "ticked for client" : "not ticked"}`
          : "Required";
    const amount = i.sublines
      .map(
        (s) =>
          `${money(s.amount * s.qty, currency)}${s.interval === "month" ? "/mo" : s.interval === "year" ? "/yr" : ""}`,
      )
      .join(" + ");
    const aiPrice =
      (i.ai_entered || aiUnreviewed) &&
      i.sublines.some(
        (s) =>
          s.list_amount !== null &&
          s.amount !== s.list_amount &&
          !i.price_review?.[s.id],
      );
    return (
      <section
        className="quote-item quote-row"
        data-expanded={expanded}
        data-details={itemDetails === i.id}
        data-default={i.default_selected}
        data-optional={i.optional}
        key={i.id}
      >
        <button
          type="button"
          className="quote-row-toggle"
          aria-expanded={expanded}
          aria-controls={`quote-body-${i.id}`}
          onClick={() => setExpandedItem(expanded ? null : i.id)}
        >
          <span className="quote-row-caption">
            <strong>{i.name || "Untitled item"}</strong>
            <small data-custom={i.source === "custom" && !i.optional}>
              {tag}
            </small>
          </span>
          {aiPrice && (
            <span
              className="quote-ai-dot"
              title="AI price differs from product list"
            />
          )}
          <strong className="quote-row-amount">{amount}</strong>
          <DisclosureChevron open={expanded} />
        </button>
        {expanded && (
          <div id={`quote-body-${i.id}`} className="quote-row-body">
            <input
              className="item-title"
              aria-label="Item name"
              value={i.name}
              onChange={(e) => updateItem(i.id, { name: e.target.value })}
            />
            <textarea
              aria-label="Description"
              placeholder="Description"
              rows={2}
              value={i.description}
              onChange={(e) =>
                updateItem(i.id, { description: e.target.value })
              }
            />
            {i.sublines.map((s) => (
              <div className="subline" key={s.id}>
                {i.sublines.length > 1 && (
                  <button
                    type="button"
                    className="subline-remove"
                    title={`Remove sub-line ${sublineLabel(s)}`}
                    aria-label={`Remove sub-line ${sublineLabel(s)}`}
                    onClick={() =>
                      updateItem(i.id, { sublines: removeSubline(i, s.id) })
                    }
                  >
                    ×
                  </button>
                )}
                <div className="subline-grid">
                  <div className="subline-label">
                    {i.sublines.length === 1 ? (
                      <span>Shown as the item price</span>
                    ) : (
                      <input
                        aria-label={`Sub-line label for ${i.name}`}
                        placeholder={sublineLabel({ ...s, label: "" })}
                        value={s.label ?? ""}
                        onChange={(e) =>
                          updateItem(i.id, {
                            sublines: i.sublines.map((v) =>
                              v.id === s.id
                                ? { ...v, label: e.target.value }
                                : v,
                            ),
                          })
                        }
                      />
                    )}
                  </div>
                  <Field label={`Amount · ${currency}`}>
                    <span className="currency-input">
                      <span aria-hidden="true">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: currency,
                        })
                          .formatToParts(0)
                          .find((part) => part.type === "currency")?.value ??
                          currency}
                      </span>
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
                    </span>
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
                {(i.ai_entered || aiUnreviewed) &&
                  s.list_amount !== null &&
                  s.amount !== s.list_amount &&
                  !i.price_review?.[s.id] && (
                    <div className="price-review">
                      <p>
                        Claude entered {money(s.amount, currency)}. The product
                        list price is {money(s.list_amount, currency)}.
                      </p>
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
                        Use {money(s.list_amount, currency)}
                      </Button>
                      <Button
                        onClick={() =>
                          updateItem(i.id, {
                            price_review: { ...i.price_review, [s.id]: "keep" },
                          })
                        }
                      >
                        Keep {money(s.amount, currency)}
                      </Button>
                    </div>
                  )}
                <details
                  open={itemDetails === i.id}
                  className="quote-mapping-details"
                >
                  <Disclosure>Billing mapping</Disclosure>
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
            {(i.schedule || i.min_term_months) && (
              <p className="quote-plan-note">
                {i.schedule && (
                  <>
                    {money(
                      i.sublines.find((s) => s.interval !== "one_time")
                        ?.amount ?? 0,
                      currency,
                    )}
                    /mo for {i.schedule.after_paid_invoices} paid invoices, then{" "}
                    {money(i.schedule.then.amount, currency)}/mo.{" "}
                  </>
                )}
                {i.min_term_months && (
                  <>{i.min_term_months}-month minimum commitment.</>
                )}
              </p>
            )}
            {ambiguousSublines(i) && (
              <p className="subline-warning">
                Name these sub-lines so the client can tell them apart.
              </p>
            )}
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
            {!i.choice_group_id && i.optional ? (
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
            ) : null}
            {i.source === "custom" &&
              itemDetails === i.id &&
              i.sublines.some((s) => s.interval !== "one_time") && (
                <Field label="Custom family">
                  <select
                    value={i.custom_family_id ?? ""}
                    onChange={(e) =>
                      updateItem(i.id, {
                        custom_family_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Choose a family</option>
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
            <details
              open={itemDetails === i.id}
              className="quote-mapping-details"
            >
              <Disclosure>Plan terms</Disclosure>
              {i.schedule && (
                <p>
                  {money(
                    i.sublines.find((s) => s.interval !== "one_time")?.amount ??
                      0,
                    currency,
                  )}{" "}
                  for {i.schedule.after_paid_invoices} paid invoices, then{" "}
                  {money(i.schedule.then.amount, currency)}.
                </p>
              )}
              {i.min_term_months && (
                <p>{i.min_term_months}-month minimum commitment</p>
              )}
              <pre>{JSON.stringify(i.plan_terms, null, 2)}</pre>
              <small>Plan terms come from Products.</small>
            </details>

            <footer className="quote-item-footer">
              {" "}
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
              <button
                type="button"
                aria-expanded={itemDetails === i.id}
                onClick={() =>
                  setItemDetails(itemDetails === i.id ? null : i.id)
                }
              >
                Details
              </button>
              <span />{" "}
              <Button
                variant="ghost"
                aria-label={`Remove ${i.name}`}
                onClick={() => {
                  setItems(items.filter((v) => v.id !== i.id));
                }}
              >
                Remove
              </Button>
            </footer>
          </div>
        )}
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
        {intro ??
          "Enter agreed prices. The app never sets prices. Drag ⋮⋮ to reorder; the client sees this order."}
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
                  <header>
                    <h3>Choose one</h3>
                    <Button variant="ghost" onClick={() => unlink(id)}>
                      Unlink
                    </Button>
                  </header>
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
                        {itemCard(i)}
                      </Sortable>
                    ))}
                  </Reorder>
                </div>
              ) : (
                itemCard(unitItems(id)[0])
              )}
            </Sortable>
          ))}
        </Reorder>
        <div className="quote-add-row">
          <Field label="+ Add product">
            <select
              value=""
              onChange={(e) => {
                const item = catalog.find((i) => i.id === e.target.value);
                if (item) addItem(item);
              }}
            >
              <option value="">+ Add product</option>
              {sellableCatalogue(catalog)
                .filter((c) => !items.some((i) => i.pricing_item_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {itemDisplayName(c)}
                  </option>
                ))}
            </select>
          </Field>
          <Button onClick={() => addItem()}>+ Custom</Button>
        </div>
      </div>
      <footer>
        <p className="eyebrow">Client sees by default</p>
        <Totals lines={items} currency={currency} />
        <p className="muted">
          Across all choices · {money(range.min.one_time_total, currency)}–
          {money(range.max.one_time_total, currency)} one-time ·{" "}
          {money(range.min.monthly_total, currency)}–
          {money(range.max.monthly_total, currency)}/mo
          {items.some((i) => i.sublines.some((s) => s.interval === "year")) &&
            ` · ${money(range.min.yearly_total, currency)}–${money(range.max.yearly_total, currency)}/yr`}
        </p>
      </footer>
    </div>
  );

  return quotePanel;
}
