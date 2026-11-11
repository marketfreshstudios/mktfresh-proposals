"use client";
import { PanelHeading } from "./editor/panel-heading";
import { PanelCard } from "./editor/tools-panel";
import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Select, Switch } from "./form-controls";
import { oiotItem, oiotKickoff, oiotPlan, oiotPlanDetails } from "../lib/oiot";
import {
  QuoteItemSchema,
  type Block,
  type QuoteItem,
  type Item,
  type Subline,
} from "../lib/model";
import {
  choiceRequired,
  choiceGroupLabel,
  choiceGroups,
  conditionTarget,
  defaultChoiceGroupLabel,
  visibleQuote,
  validateQuoteConditions,
} from "../lib/quote-options";
import { quoteRange } from "../lib/quote-model";
import { sellableCatalogue, itemDisplayName } from "../lib/catalogue-display";
import { sublineLabel, removeSubline } from "../lib/subline-label";
import { formatMoney } from "../lib/money";
import { intervalLabel } from "../lib/presentation";
import { DisclosureChevron } from "./disclosure-chevron";
import { QuoteGroupSort, type QuoteDrop } from "./quote-group-sort";
import { useMoney } from "./money-context";
import { Button, Field, Disclosure, Totals } from "./ui";
const uid = () => crypto.randomUUID();
function sublinePlaceholder(line: Subline, index: number) {
  return `Sub-line ${index + 1} | ${intervalLabel(line.interval)}`;
}
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

function GroupName({
  id,
  value,
  onSave,
}: {
  id: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  return (
    <input
      className="quote-group-name"
      data-quote-group-name={id}
      aria-label="Option group name"
      minLength={1}
      maxLength={80}
      value={entry ?? value}
      onChange={(event) => setEntry(event.currentTarget.value)}
      onBlur={() => {
        const name = entry?.trim();
        if (name && name !== value) onSave(name);
        setEntry(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
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
  addItem: (item?: Item, insert?: (value: QuoteItem) => QuoteItem[]) => void;
  expandedItem: string | null;
  setExpandedItem: (id: string | null) => void;
  itemDetails: string | null;
  setItemDetails: (id: string | null) => void;
  intro?: string;
}) {
  const money = useMoney(),
    range = quoteRange(totalsItems),
    setItems = onChange;
  const panel = useRef<HTMLDivElement>(null);
  const focusGroup = useRef<string | null>(null);
  const groups = choiceGroups(items);
  const focusSubline = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusGroup.current) {
      const name = panel.current?.querySelector<HTMLInputElement>(
        `[data-quote-group-name="${focusGroup.current}"]`,
      );
      if (name) {
        name.focus();
        name.select();
        focusGroup.current = null;
      }
    }
    if (!focusSubline.current) return;
    const label = panel.current?.querySelector<HTMLTextAreaElement>(
      `[data-subline-label="${focusSubline.current}"]`,
    );
    if (label) {
      label.focus();
      focusSubline.current = null;
    }
  }, [items, expandedItem]);
  function addSubline(item: QuoteItem) {
    const id = uid();
    const [first] = item.sublines;
    let sublines = item.sublines;
    if (sublines.length === 1 && !first.label?.trim()) {
      const product = catalog.find(
        (entry) => entry.id === item.pricing_item_id,
      );
      const suggestion = product ? itemDisplayName(product) : item.name;
      sublines = [{ ...first, label: suggestion.trim().slice(0, 200) }];
    }
    focusSubline.current = id;
    updateItem(item.id, {
      sublines: [
        ...sublines,
        {
          id,
          amount: 0,
          list_amount: null,
          interval: "one_time",
          qty: 1,
          stripe_lookup_key: null,
          qbo_item_ref: null,
        },
      ],
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
  function changeRequired(group: string, required: boolean) {
    const rows = items.filter((item) => item.choice_group_id === group);
    const defaultId =
      rows.find((item) => item.default_selected)?.id ??
      rows.find((item) => !item.choice_group_placeholder)?.id;
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
    const id = conditionTarget(items, rows[0])?.id ?? condition?.id;
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
      (item) =>
        !ids.has(item.id) && item.optional && !item.choice_group_placeholder,
    );
    function option(item: QuoteItem) {
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
    }
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
          {selectable.filter((item) => !item.choice_group_id).map(option)}
          {[...groups.entries()].map(([group, members]) => {
            const candidates = selectable.filter(
              (item) => item.choice_group_id === group,
            );
            return candidates.length ? (
              <optgroup key={group} label={choiceGroupLabel(members[0])}>
                {candidates.map(option)}
              </optgroup>
            ) : null;
          })}
        </Select>
      </Field>
    );
  }
  const clearGroup = (item: QuoteItem): QuoteItem => ({
    ...item,
    choice_group_id: null,
    choice_group_required: undefined,
    choice_group_label: undefined,
  });
  const groupOptions = (group: string) =>
    (groups.get(group) ?? []).filter((item) => !item.choice_group_placeholder);
  const oiotGroup = (group: string) =>
    groupOptions(group).some((item) =>
      oiotItem(item, proposalContent ?? [], catalog),
    );
  const units = [
    ...new Set(items.map((item) => item.choice_group_id ?? item.id)),
  ];
  const unitItems = (id: string) =>
    groups.get(id) ?? items.filter((item) => item.id === id);

  function unlink(group: string) {
    if (oiotGroup(group)) return;
    setItems(
      items.flatMap((item) =>
        item.choice_group_id !== group
          ? [item]
          : item.choice_group_placeholder
            ? []
            : [clearGroup(item)],
      ),
    );
  }
  function join(
    item: QuoteItem,
    group: string,
    inheritVisibility = false,
  ): QuoteItem {
    const [first] = groups.get(group) ?? [];
    return {
      ...item,
      optional: true,
      choice_group_id: group,
      choice_group_label: first?.choice_group_label,
      choice_group_required: first?.choice_group_required,
      default_selected: false,
      ...(inheritVisibility || first?.choice_group_placeholder
        ? { show_when: first?.show_when }
        : {}),
    };
  }
  function drop(itemId: string, target: QuoteDrop) {
    const item = items.find(
      (option) => option.id === itemId && !option.choice_group_placeholder,
    );
    const source = item?.choice_group_id;
    if (target.group) {
      if (!item || (!source && (item.oiot_build || oiotGroup(target.group))))
        return;
      const next = groupOptions(target.group).filter(
        (option) => option.id !== itemId,
      );
      next.splice(
        target.index,
        0,
        source === target.group ? item : join(item, target.group),
      );
      setItems(
        units
          .filter((id) => id !== itemId)
          .flatMap((id) => (id === target.group ? next : unitItems(id))),
      );
      return;
    }
    if (source && oiotGroup(source)) return;
    const order = units.filter((id) => id !== itemId);
    order.splice(target.index, 0, itemId);
    const remaining = source
      ? groupOptions(source).filter((option) => option.id !== itemId)
      : [];
    setItems(
      order.flatMap((id) => {
        if (id === itemId && source) return [clearGroup(item!)];
        if (id === source)
          return remaining.length === 1 ? remaining.map(clearGroup) : remaining;
        return unitItems(id);
      }),
    );
  }
  function leaveGroup(itemId: string) {
    const group = items.find((item) => item.id === itemId)?.choice_group_id;
    if (group) drop(itemId, { group: null, index: units.indexOf(group) + 1 });
  }
  function link(item: QuoteItem, targetId: string) {
    const target = items.find((i) => i.id === targetId);
    if (!target) return;
    if (target.choice_group_id) {
      drop(item.id, {
        group: target.choice_group_id,
        index: groupOptions(target.choice_group_id).length,
      });
      return;
    }
    const group = uid();
    setItems(
      items.map((i) =>
        i.id === target.id
          ? { ...i, optional: true, choice_group_id: group }
          : i.id === item.id
            ? join(i, group)
            : i,
      ),
    );
  }
  function emptyGroup(
    id: string,
    name = defaultChoiceGroupLabel,
    previous?: QuoteItem,
  ) {
    return QuoteItemSchema.parse({
      id,
      order: items.length,
      name,
      source: "custom",
      sublines: [],
      optional: true,
      default_selected: false,
      choice_group_id: id,
      choice_group_placeholder: true,
      choice_group_label: name,
      choice_group_required: previous?.choice_group_required ?? true,
      show_when: previous?.show_when,
    });
  }
  function createGroup() {
    const id = uid();
    focusGroup.current = id;
    setItems([...items, emptyGroup(id)]);
  }
  function addToGroup(group: string, product?: Item) {
    addItem(product, (value) =>
      units.flatMap((id) =>
        id === group
          ? [...groupOptions(group), join(value, group, true)]
          : unitItems(id),
      ),
    );
  }
  function removeItem(item: QuoteItem) {
    if (
      item.choice_group_id &&
      groupOptions(item.choice_group_id).length === 1
    ) {
      const group = item.choice_group_id;
      setItems(
        items.map((i) =>
          i.id === item.id
            ? emptyGroup(group, choiceGroupLabel(item), item)
            : i,
        ),
      );
    } else setItems(items.filter((i) => i.id !== item.id));
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
      ? i.default_selected
        ? "Default"
        : ""
      : i.optional
        ? `Optional${i.default_selected ? " | Default" : ""}`
        : "";
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
        className="editor-panel-card quote-item quote-row"
        data-expanded={expanded}
        data-open={expanded}
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
            {tag && <small>{tag}</small>}
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
            <div className="quote-price-heading">
              <span>
                Price
                {i.sublines.length > 1
                  ? ` | ${i.sublines.length} sub-lines`
                  : ""}
              </span>
            </div>
            {i.sublines.map((s, index) => (
              <div className="subline" key={s.id}>
                <div
                  className="subline-grid"
                  data-wide-amount={s.amount >= 1000000}
                >
                  <div className="subline-label">
                    {i.sublines.length > 1 && (
                      <div
                        className="subline-label-edit"
                        data-label={s.label || sublinePlaceholder(s, index)}
                      >
                        <textarea
                          data-subline-label={s.id}
                          rows={1}
                          aria-label={`Sub-line label for ${i.name}`}
                          placeholder={sublinePlaceholder(s, index)}
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
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {s.id !== kickoff?.id && (
                    <div className="subline-amount">
                      <Field label={`Amount | ${currency}`}>
                        <span className="currency-input">
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
                          <span
                            className="currency-input-display"
                            aria-hidden="true"
                          >
                            {formatMoney(s.amount, currency, "always")}
                          </span>
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
            {i.sublines.length > 1 &&
              i.sublines.some((s) => !s.label?.trim()) && (
                <p className="subline-warning">
                  Name these sub-lines so the client can tell them apart.
                </p>
              )}
            {!i.oiot_build && (
              <Button
                className="quote-add-subline"
                onClick={() => addSubline(i)}
              >
                Add sub-line
              </Button>
            )}
            <div className="item-options">
              <label className="check">
                <Switch
                  checked={i.optional}
                  disabled={
                    i.oiot_build ||
                    (!!i.choice_group_id && oiotGroup(i.choice_group_id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked && i.choice_group_id) {
                      setItems(
                        items.map((v) =>
                          v.choice_group_id === i.choice_group_id
                            ? {
                                ...clearGroup(v),
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
                  Make default selection
                </label>
              )}
            </div>
            {visibilityControl([i], "Show only when")}
            {i.choice_group_id && !oiotGroup(i.choice_group_id) ? (
              <Button onClick={() => leaveGroup(i.id)}>
                Remove from group
              </Button>
            ) : null}
            {!i.choice_group_id && !i.oiot_build ? (
              <Field label="Link as alternative">
                <Select value="" onChange={(e) => link(i, e.target.value)}>
                  <option value="">Choose another item</option>
                  {items
                    .filter(
                      (v) =>
                        v.id !== i.id &&
                        !v.oiot_build &&
                        !v.choice_group_placeholder &&
                        !(v.choice_group_id && oiotGroup(v.choice_group_id)),
                    )
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
                  removeItem(i);
                }}
              >
                Remove
              </Button>
              <Button
                aria-label="Done editing quote line"
                className="quote-done studio-primary"
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
  function addPicker(group?: string) {
    const menuAdd = (product?: Item) =>
      group ? addToGroup(group, product) : addItem(product);
    return (
      <details className="quote-add-picker">
        <summary>
          {group
            ? "Add item to this group"
            : "Add from catalog or a custom item"}
        </summary>
        <div className="quote-add-row">
          <Field label="Add product">
            <Select
              value=""
              onChange={(e) => {
                const product = catalog.find(
                  (item) => item.id === e.target.value,
                );
                if (product) menuAdd(product);
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
          <Button onClick={() => menuAdd()}>Custom item</Button>
          {!group && (
            <Button className="quote-create-group" onClick={createGroup}>
              Create an option group
            </Button>
          )}
        </div>
      </details>
    );
  }
  const quotePanel = (
    <div ref={panel} className="quote-panel stack">
      <PanelHeading className="sr-only">
        {proposalContent ? "Quote" : "Default quote"}
      </PanelHeading>
      <p className="muted quote-intro">
        {intro ??
          "Enter agreed prices. The app never sets prices. Use the drag handles to reorder; the client sees this order."}
      </p>
      <div className="quote-cards">
        <QuoteGroupSort
          bounds={panel}
          units={units.map((id) => {
            const group = groups.get(id);
            return group
              ? {
                  id,
                  label: choiceGroupLabel(group[0]),
                  dragLabel: group[0].choice_group_label ?? "choice group",
                  options: groupOptions(id).map((item) => ({
                    id: item.id,
                    label: item.name,
                  })),
                  locked: oiotGroup(id),
                }
              : { id, label: unitItems(id)[0].name };
          })}
          onDrop={drop}
          renderItem={(id) => itemCard(items.find((item) => item.id === id)!)}
          renderGroup={(id, options) => {
            const members = groups.get(id)!;
            const name = choiceGroupLabel(members[0]);
            const locked = oiotGroup(id);
            return (
              <PanelCard
                title={
                  <GroupName
                    id={id}
                    value={name}
                    onSave={(name) =>
                      setItems(
                        items.map((item) =>
                          item.choice_group_id === id
                            ? {
                                ...item,
                                choice_group_label: name,
                                ...(item.choice_group_placeholder
                                  ? { name }
                                  : {}),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                }
                nested
                collapsible={false}
                className="editor-choice-group"
                bodyClassName="quote-choice-well"
                actions={
                  !locked && (
                    <Button variant="ghost" onClick={() => unlink(id)}>
                      Unlink
                    </Button>
                  )
                }
              >
                <details className="quote-group-settings">
                  <Disclosure>Choice group settings</Disclosure>
                  <label className="check">
                    <Switch
                      checked={choiceRequired(members[0])}
                      onChange={(event) =>
                        changeRequired(id, event.target.checked)
                      }
                    />
                    Client must choose one
                  </label>
                  {!choiceRequired(members[0]) &&
                    members.some((item) => item.default_selected) && (
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
                  {visibilityControl(members, "Show group only when")}
                </details>
                <div className="quote-group-options">{options}</div>
                {!groupOptions(id).length && (
                  <p className="quote-empty-group muted">
                    Drag an item here, or add one below.
                  </p>
                )}
                {!locked && addPicker(id)}
              </PanelCard>
            );
          }}
        />
        {addPicker()}
      </div>
      <footer>
        <p className="eyebrow">Client sees by default</p>
        <Totals lines={totalsItems} currency={currency} />
        <p className="muted">
          {items.some((item) => item.show_when)
            ? "Across visible choices"
            : "Across all choices"}{" "}
          | {money(range.min.one_time_total, currency)}–
          {money(range.max.one_time_total, currency)} |{" "}
          {money(range.min.monthly_total, currency)}–
          {money(range.max.monthly_total, currency)}/mo
          {visibleQuote(totalsItems).some((i) =>
            i.sublines.some((s) => s.interval === "year"),
          ) &&
            ` | ${money(range.min.yearly_total, currency)}–${money(range.max.yearly_total, currency)}/yr`}
        </p>
      </footer>
    </div>
  );

  return quotePanel;
}
