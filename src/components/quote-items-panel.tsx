"use client";
import { PanelHeading } from "./editor/panel-heading";
import { useState } from "react";
import { Select, Switch } from "./form-controls";
import { oiotItem, oiotKickoff, oiotPlan, oiotPlanDetails } from "../lib/oiot";
import type { Block, QuoteItem, Item } from "../lib/model";
import {
  choiceRequired,
  visibleQuote,
  validateQuoteConditions,
} from "../lib/quote-options";
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
function OiotKickoffInput({
  amount,
  onCommit,
}: {
  amount?: number;
  onCommit: (amount: number) => void;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  function commit(input: HTMLInputElement) {
    if (entry === null) return;
    setEntry(null);
    if (input.value && input.validity.valid) {
      const cents = Math.round(input.valueAsNumber * 100);
      if (cents !== amount) onCommit(cents);
    }
  }
  return (
    <Field label={oiotPlan.kickoffLabel}>
      <input
        type="number"
        min="0"
        max="1000000"
        step="0.01"
        placeholder="Enter amount"
        value={entry ?? (amount === undefined ? "" : amount / 100)}
        onChange={(event) => setEntry(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit(event.currentTarget);
        }}
      />
    </Field>
  );
}

/** One quote panel for proposals and template defaults; callers own history and persistence. */
export function QuoteItemsPanel({
  items,
  totalsItems = items,
  catalog,
  families,
  currency,
  aiUnreviewed = false,
  proposalContent,
  onChange,
  addItem,
  expandedItem,
  setExpandedItem,
  itemDetails,
  setItemDetails,
  intro,
}: {
  items: QuoteItem[];
  totalsItems?: QuoteItem[];
  catalog: Item[];
  families: { id: string; name: string; active: boolean }[];
  currency: string;
  aiUnreviewed?: boolean;
  proposalContent?: Block[];
  onChange: (next: QuoteItem[]) => void;
  addItem: (item?: Item) => void;
  expandedItem: string | null;
  setExpandedItem: (id: string | null) => void;
  itemDetails: string | null;
  setItemDetails: (id: string | null) => void;
  intro?: string;
}) {
  const money = useMoney(),
    range = quoteRange(totalsItems),
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
  function changeRequired(group: string, required: boolean) {
    const rows = items.filter((item) => item.choice_group_id === group);
    const defaultId =
      rows.find((item) => item.default_selected)?.id ?? rows[0].id;
    setItems(
      items.map((item) =>
        item.choice_group_id === group
          ? {
              ...item,
              choice_group_required: required,
              default_selected: required
                ? item.id === defaultId
                : item.default_selected,
            }
          : item,
      ),
    );
  }
  function visibilityControl(rows: QuoteItem[], label: string) {
    const condition = rows[0].show_when;
    const id =
      condition?.kind === "quote_item"
        ? condition.id
        : condition
          ? (items.find((item) => item.pricing_item_id === condition.id)?.id ??
            condition.id)
          : undefined;
    const ids = new Set(rows.map((item) => item.id));
    const changes = (parent?: string) =>
      items.map((item) =>
        ids.has(item.id)
          ? {
              ...item,
              show_when: parent
                ? { kind: "quote_item" as const, id: parent }
                : undefined,
            }
          : item,
      );
    const selectable = items.filter(
      (item) => !ids.has(item.id) && item.optional,
    );
    return (
      <Field label={label}>
        <Select
          value={id ?? ""}
          onChange={(event) => setItems(changes(event.currentTarget.value))}
        >
          <option value="">Always</option>
          {id && !selectable.some((item) => item.id === id) && (
            <option value={id} disabled>
              Previous option unavailable
            </option>
          )}
          {selectable.map((item) => {
            let disabled = false;
            try {
              validateQuoteConditions(changes(item.id));
            } catch {
              disabled = true;
            }
            return (
              <option key={item.id} value={item.id} disabled={disabled}>
                {item.name} is chosen
              </option>
            );
          })}
        </Select>
      </Field>
    );
  }
  function unlink(group: string) {
    setItems(
      items.map((i) =>
        i.choice_group_id === group
          ? { ...i, choice_group_id: null, choice_group_required: undefined }
          : i,
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
              choice_group_required: target.choice_group_required,
              default_selected:
                i.id === target.id ? target.default_selected : false,
            }
          : i,
      ),
    );
  }
  function itemCard(i: QuoteItem) {
    const expanded = expandedItem === i.id;
    const oiot =
      i.oiot_build ||
      (!i.show_when && oiotItem(i, proposalContent ?? [], catalog));
    const kickoff = oiot ? oiotKickoff(i) : undefined;
    const lockedCarePrice = !!(
      i.show_when &&
      items.some((item) => item.oiot_build) &&
      oiotPlanDetails(i, catalog)
    );
    const changeKickoff = (amount: number) =>
      updateItem(i.id, {
        sublines: kickoff
          ? i.sublines.map((line) =>
              line.id === kickoff.id
                ? { ...line, amount, oiot_kickoff: true, list_amount: null }
                : line,
            )
          : [
              {
                id: uid(),
                label: "Kickoff",
                amount,
                interval: "one_time",
                qty: 1,
                oiot_kickoff: true,
                list_amount: null,
                stripe_lookup_key: null,
                qbo_item_ref:
                  catalog
                    .find((product) => product.id === i.pricing_item_id)
                    ?.sublines?.find((line) => line.interval === "one_time")
                    ?.qbo_item_ref ?? null,
              },
              ...i.sublines,
            ],
      });
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
    const aiPlanAmounts = Boolean(
      oiot &&
      i.ai_entered &&
      (aiUnreviewed || !proposalContent) &&
      (kickoff || i.oiot_purchase_price !== undefined),
    );
    const aiPrice =
      aiPlanAmounts ||
      ((i.ai_entered || aiUnreviewed) &&
        i.sublines.some(
          (s) =>
            s.list_amount !== null &&
            s.amount !== s.list_amount &&
            !i.price_review?.[s.id],
        ));
    return (
      <section
        className="quote-item quote-row"
        data-expanded={expanded}
        data-details={itemDetails === i.id}
        data-default={i.default_selected}
        data-optional={i.optional}
        key={i.id}
        onKeyDown={(event) => {
          if (!expanded || event.key !== "Escape" || event.defaultPrevented)
            return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget
            .querySelector<HTMLButtonElement>(".quote-row-toggle")
            ?.focus();
          setExpandedItem(null);
        }}
      >
        <button
          type="button"
          className="quote-row-toggle"
          aria-expanded={expanded}
          aria-controls={expanded ? `quote-body-${i.id}` : undefined}
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
              title={
                aiPlanAmounts
                  ? "Review assistant-entered plan amounts"
                  : "AI price differs from product list"
              }
            />
          )}
          <strong className="quote-row-amount">
            {i.oiot_build && !kickoff ? "Kickoff needed" : amount}
            {i.sublines.length === 1 &&
              i.sublines[0].interval === "one_time" && <small> one-time</small>}
          </strong>
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
            {oiot && (
              <div className="stack">
                {aiPlanAmounts && (
                  <div className="price-review">
                    <p>
                      Review the kickoff and website purchase price entered by
                      the assistant.
                    </p>
                  </div>
                )}
                <OiotKickoffInput
                  amount={kickoff?.amount}
                  onCommit={changeKickoff}
                />
                <Field
                  label="Website purchase price"
                  hint={oiotPlan.purchasePriceHelp}
                >
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    value={
                      i.oiot_purchase_price === undefined
                        ? ""
                        : i.oiot_purchase_price / 100
                    }
                    onChange={(event) => {
                      const input = event.currentTarget;
                      if (input.validity.valid)
                        updateItem(i.id, {
                          oiot_purchase_price: input.value
                            ? Math.round(input.valueAsNumber * 100)
                            : undefined,
                        });
                    }}
                  />
                </Field>
              </div>
            )}
            {i.sublines.map((s) => (
              <div className="subline" key={s.id}>
                <div className="subline-grid">
                  <div className="subline-label">
                    {i.sublines.length === 1 ? (
                      <span>Shown as the item price</span>
                    ) : (
                      <div
                        className="subline-label-edit"
                        data-label={s.label || sublineLabel(s)}
                      >
                        <textarea
                          rows={1}
                          aria-label={`Sub-line label for ${i.name}`}
                          placeholder={sublineLabel({ ...s, label: "" })}
                          value={s.label ?? ""}
                          onChange={(e) =>
                            updateItem(i.id, {
                              sublines: i.sublines.map((v) =>
                                v.id === s.id
                                  ? {
                                      ...v,
                                      label: e.target.value.replace(
                                        /[\r\n]/g,
                                        "",
                                      ),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </div>
                    )}
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
                  </div>
                  {s.id !== kickoff?.id && (
                    <div className="subline-amount">
                      <Field label={`Amount · ${currency}`}>
                        <span className="currency-input">
                          <span aria-hidden="true">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: currency,
                            })
                              .formatToParts(0)
                              .find((part) => part.type === "currency")
                              ?.value ?? currency}
                          </span>
                          <input
                            aria-label={`Amount ${s.label || i.name}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={s.amount / 100}
                            readOnly={lockedCarePrice}
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
                    </div>
                  )}
                  <div className="subline-quantity">
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
                  </div>
                  <div className="subline-interval">
                    <Field label="Interval">
                      <Select
                        aria-label={`Interval ${s.label || i.name}`}
                        value={s.interval}
                        onChange={(e) =>
                          updateItem(i.id, {
                            sublines: i.sublines.map((v) =>
                              v.id === s.id
                                ? {
                                    ...v,
                                    interval: e.target
                                      .value as typeof s.interval,
                                  }
                                : v,
                            ),
                          })
                        }
                      >
                        <option value="one_time">One-time</option>
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                      </Select>
                    </Field>
                  </div>
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
                <Switch
                  checked={i.optional}
                  disabled={
                    i.oiot_build ||
                    items.some(
                      (item) =>
                        item.oiot_build &&
                        item.choice_group_id === i.choice_group_id,
                    )
                  }
                  onChange={(e) => {
                    if (!e.target.checked && i.choice_group_id) {
                      setItems(
                        items.map((v) =>
                          v.choice_group_id === i.choice_group_id
                            ? {
                                ...v,
                                choice_group_id: null,
                                choice_group_required: undefined,
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
            {visibilityControl([i], "Show only when")}
            {!i.choice_group_id && i.optional ? (
              <Field label="Link as alternative">
                <Select value="" onChange={(e) => link(i, e.target.value)}>
                  <option value="">Choose another optional item</option>
                  {items
                    .filter((v) => v.id !== i.id && v.optional)
                    .map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            {i.source === "custom" &&
              itemDetails === i.id &&
              i.sublines.some((s) => s.interval !== "one_time") && (
                <Field label="Custom family">
                  <Select
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
                  </Select>
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
              {!i.oiot_build && (
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
                  Sub-line
                </Button>
              )}
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
                  setItems(items.filter((item) => item.id !== i.id));
                }}
              >
                Remove
              </Button>
              <Button
                aria-label="Done editing quote line"
                onClick={(event) => {
                  event.currentTarget
                    .closest(".quote-row")
                    ?.querySelector<HTMLButtonElement>(".quote-row-toggle")
                    ?.focus();
                  setExpandedItem(null);
                }}
              >
                Done
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
      <PanelHeading className="sr-only">
        {proposalContent ? "Quote" : "Default quote"}
      </PanelHeading>
      <p className="muted">
        {intro ??
          "Enter agreed prices. The app never sets prices. Use the drag handles to reorder; the client sees this order."}
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
                    <PanelHeading nested>Choose one</PanelHeading>
                    {!unitItems(id).some((item) => item.oiot_build) && (
                      <Button variant="ghost" onClick={() => unlink(id)}>
                        Unlink
                      </Button>
                    )}
                  </header>
                  <details className="quote-group-settings">
                    <Disclosure>Choice group settings</Disclosure>
                    <label className="check">
                      <Switch
                        checked={choiceRequired(unitItems(id)[0])}
                        onChange={(event) =>
                          changeRequired(id, event.target.checked)
                        }
                      />
                      Client must choose one
                    </label>
                    {!choiceRequired(unitItems(id)[0]) &&
                      unitItems(id).some((item) => item.default_selected) && (
                        <Button
                          onClick={() =>
                            setItems(
                              items.map((item) =>
                                item.choice_group_id === id
                                  ? { ...item, default_selected: false }
                                  : item,
                              ),
                            )
                          }
                        >
                          Clear default choice
                        </Button>
                      )}
                    {visibilityControl(unitItems(id), "Show group only when")}
                  </details>
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
          <Field label="Add product">
            <Select
              value=""
              onChange={(e) => {
                const item = catalog.find((i) => i.id === e.target.value);
                if (item) addItem(item);
              }}
            >
              <option value="">Add product</option>
              {sellableCatalogue(catalog)
                .filter((c) => !items.some((i) => i.pricing_item_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {itemDisplayName(c)}
                  </option>
                ))}
            </Select>
          </Field>
          <Button onClick={() => addItem()}>Custom line</Button>
        </div>
      </div>
      <footer>
        <p className="eyebrow">Client sees by default</p>
        <Totals lines={totalsItems} currency={currency} />
        <p className="muted">
          {items.some((item) => item.show_when)
            ? "Across visible choices"
            : "Across all choices"}{" "}
          · {money(range.min.one_time_total, currency)}–
          {money(range.max.one_time_total, currency)} one-time ·{" "}
          {money(range.min.monthly_total, currency)}–
          {money(range.max.monthly_total, currency)}/mo
          {visibleQuote(totalsItems).some((i) =>
            i.sublines.some((s) => s.interval === "year"),
          ) &&
            ` · ${money(range.min.yearly_total, currency)}–${money(range.max.yearly_total, currency)}/yr`}
        </p>
      </footer>
    </div>
  );

  return quotePanel;
}
