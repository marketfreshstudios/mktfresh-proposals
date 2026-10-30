import {
  check,
  readLine,
  QuoteItemSchema,
  ContractClauseSchema,
  type Quote,
  type QuoteItem,
  type Line,
  type Item,
  type Block,
} from "./model";
export const isQuoteItem = (v: Quote[number]): v is QuoteItem =>
  "sublines" in v;
/** Pure adapter. The caller owns the result; no input/version is ever mutated. */
export function quoteItems(quote: Quote): QuoteItem[] {
  return quote.map((raw, order) => {
    if (isQuoteItem(raw)) return structuredClone(raw);
    const l = readLine(raw);
    return QuoteItemSchema.parse({
      id: l.id,
      order,
      name: l.name,
      description: l.description,
      source: l.pricing_item_id ? "catalog" : "custom",
      pricing_item_id: l.pricing_item_id,
      custom_family_id: l.custom_family_id,
      sublines: [
        {
          id: l.id,
          amount: l.amount,
          list_amount: l.list_amount,
          interval: l.interval,
          qty: l.qty,
          stripe_lookup_key: l.stripe_lookup_key,
          qbo_item_ref: l.qbo_item_ref,
        },
      ],
      optional: l.optional,
      default_selected: l.optional ? l.selected : true,
      selected: l.optional ? l.selected : true,
      choice_group_id: null,
      min_term_months: l.min_term_months,
      schedule: l.schedule,
      plan_terms: l.plan_terms,
      legacy_group: l.group,
    });
  });
}
export function selected(item: QuoteItem) {
  return !item.optional || (item.selected ?? item.default_selected);
}
export function orderedItems(quote: Quote) {
  const items = quoteItems(quote).sort((a, b) => a.order - b.order),
    out: QuoteItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.choice_group_id) out.push(item);
    else if (!seen.has(item.choice_group_id)) {
      seen.add(item.choice_group_id);
      out.push(
        ...items.filter((v) => v.choice_group_id === item.choice_group_id),
      );
    }
  }
  return out;
}
export function validateItems(quote: Quote, requireChoice = false) {
  const items = quoteItems(quote);
  const ids = new Set<string>(),
    subIds = new Set<string>();
  for (const raw of items) {
    const item = QuoteItemSchema.parse(raw);
    check(!ids.has(item.id), "Duplicate quote item IDs");
    ids.add(item.id);
    for (const s of item.sublines) {
      check(!subIds.has(s.id), "Duplicate sub-line IDs");
      subIds.add(s.id);
    }
    check(
      !item.choice_group_id || item.optional,
      "Choice groups contain optional items only",
    );
    check(
      !item.schedule ||
        item.sublines.filter((s) => s.interval !== "one_time").length === 1,
      "A schedule requires exactly one recurring sub-line",
    );
  }
  const groups = new Set(items.map((i) => i.choice_group_id).filter(Boolean));
  for (const id of groups) {
    const group = items.filter((i) => i.choice_group_id === id);
    check(
      group.filter((i) => i.default_selected).length <= 1,
      "Choose at most one default in each choice group",
    );
    check(
      group.filter(selected).length <= 1,
      "Choose only one item in each choice group",
    );
    if (requireChoice)
      check(
        group.filter(selected).length === 1,
        "Choose one item in each choice group before signing",
      );
  }
  return items;
}
export function draftItems(quote: Quote): QuoteItem[] {
  const items = quoteItems(quote).map((i) => ({
    ...i,
    selected: !i.optional || i.default_selected,
  }));
  validateItems(items);
  return items;
}
/** All provider boundaries use this adapter; sub-line IDs remain stable idempotency identities. */
export function flatQuote(quote: Quote, onlySelected = false): Line[] {
  if (!quote.some(isQuoteItem))
    return (quote as Line[])
      .map(readLine)
      .filter((l) => !onlySelected || !l.optional || l.selected);
  return orderedItems(quote)
    .filter((i) => !onlySelected || selected(i))
    .flatMap((i) =>
      i.sublines.map((s) => ({
        id: s.id,
        name: i.name,
        description: [i.description, s.label].filter(Boolean).join(" · "),
        amount: s.amount,
        list_amount: s.list_amount,
        qty: s.qty,
        interval: s.interval,
        stripe_lookup_key: s.stripe_lookup_key,
        qbo_item_ref: s.qbo_item_ref,
        pricing_item_id: i.pricing_item_id,
        custom_family_id: i.custom_family_id,
        optional: i.optional,
        selected: selected(i),
        group: i.legacy_group ?? null,
        min_term_months: s.interval === "one_time" ? null : i.min_term_months,
        schedule: s.interval === "one_time" ? null : i.schedule,
        plan_terms: i.plan_terms,
      })),
    );
}
export function billingLines(quote: Quote) {
  validateItems(quote, true);
  return flatQuote(quote, true);
}
export function chooseItem(
  quote: Quote,
  id: string,
  value: boolean,
): QuoteItem[] {
  const items = quoteItems(quote),
    item = items.find((i) => i.id === id);
  check(item?.optional, "Only optional items can be toggled");
  if (item.choice_group_id) {
    check(
      value,
      "Choose a replacement item instead of clearing a choice group",
    );
    for (const other of items.filter(
      (i) => i.choice_group_id === item.choice_group_id,
    ))
      other.selected = other.id === id;
  } else item.selected = value;
  validateItems(items);
  return items;
}
export function catalogQuoteItem(
  item: Item,
  order: number,
  id: string,
  subIds: string[],
): QuoteItem {
  return QuoteItemSchema.parse({
    id,
    order,
    name: item.display_name?.trim() || item.name,
    description: item.description,
    source: "catalog",
    pricing_item_id: item.id,
    custom_family_id: null,
    sublines: item.sublines?.length
      ? item.sublines.map((s, n) => ({
          ...s,
          id: subIds[n] ?? s.id,
          list_amount: s.amount,
        }))
      : [
          {
            id: subIds[0] ?? id,
            amount: item.amount,
            list_amount: item.amount,
            interval: item.interval,
            qty: 1,
            stripe_lookup_key: item.stripe_lookup_key,
            qbo_item_ref: item.qbo_item_ref,
          },
        ],
    optional: false,
    default_selected: true,
    selected: true,
    choice_group_id: null,
    min_term_months: item.min_term_months,
    schedule: item.schedule,
    plan_terms: item.plan_terms,
  });
}
export function selectedContent(content: Block[], quote: Quote) {
  const included = new Set(
    quoteItems(quote)
      .filter(selected)
      .map((i) => i.pricing_item_id),
  );
  for (const b of content.filter((b) => b.type === "contract")) {
    check((b.clauses?.length ?? 0) <= 50, "Contract has too many clauses");
    check(
      new Set((b.clauses ?? []).map((c) => c.id)).size ===
        (b.clauses?.length ?? 0),
      "Duplicate contract clause IDs",
    );
  }
  return content.map((b) =>
    b.type === "contract"
      ? {
          ...b,
          clauses: (b.clauses ?? [])
            .map((c) => ContractClauseSchema.parse(c))
            .filter(
              (c) => !c.show_when || included.has(c.show_when.pricing_item_id),
            )
            .map((c) => ({ ...c, show_when: null })),
        }
      : structuredClone(b),
  );
}
export function quoteRange(quote: Quote) {
  const items = quoteItems(quote),
    min = { one_time_total: 0, monthly_total: 0, yearly_total: 0 },
    max = { ...min };
  const sums = (i: QuoteItem) => {
    const t = { ...min, one_time_total: 0, monthly_total: 0, yearly_total: 0 };
    for (const s of i.sublines)
      t[
        s.interval === "one_time"
          ? "one_time_total"
          : s.interval === "month"
            ? "monthly_total"
            : "yearly_total"
      ] += s.amount * s.qty;
    return t;
  };
  const groups = new Set(items.map((i) => i.choice_group_id).filter(Boolean));
  for (const key of Object.keys(min) as (keyof typeof min)[]) {
    for (const i of items.filter((i) => !i.choice_group_id)) {
      const t = sums(i)[key];
      max[key] += t;
      if (!i.optional) min[key] += t;
    }
    for (const id of groups) {
      const v = items
        .filter((i) => i.choice_group_id === id)
        .map((i) => sums(i)[key]);
      min[key] += Math.min(...v);
      max[key] += Math.max(...v);
    }
  }
  return { min, max };
}

export function prepareQuote(
  quote: Quote,
  catalog: Item[],
  ai = false,
): QuoteItem[] {
  return draftItems(quote).map((i) => {
    const item = catalog.find((c) => c.id === i.pricing_item_id);
    return {
      ...i,
      ...(ai ? { ai_entered: true, price_review: undefined } : {}),
      sublines: i.sublines.map((s) => {
        const preset = item?.sublines?.find(
          (v) =>
            v.interval === s.interval &&
            ((!!s.stripe_lookup_key &&
              v.stripe_lookup_key === s.stripe_lookup_key) ||
              (!!s.label && v.label === s.label) ||
              v.id === s.id),
        );
        const list =
          preset?.amount ??
          (item?.interval === s.interval ? item.amount : s.list_amount);
        return { ...s, list_amount: list ?? null };
      }),
    };
  });
}
