import { check, type Quote, type QuoteItem } from "./model";

export const selected = (item: QuoteItem) =>
  !item.optional || (item.selected ?? item.default_selected);

// Earlier choice groups were always required at signing.
export const choiceRequired = (item: QuoteItem) =>
  !!item.choice_group_id && item.choice_group_required !== false;

export const defaultChoiceGroupLabel = "Choose one";
// An unnamed group reads the same everywhere (sidebar, document, client view):
// "Choose one" when a choice is required, "Choose up to one" when it isn't.
export const printedChoiceGroupLabel = (item: QuoteItem) =>
  item.choice_group_label ??
  (choiceRequired(item) ? defaultChoiceGroupLabel : "Choose up to one");
export const choiceGroupLabel = printedChoiceGroupLabel;

export function choiceGroups(quote: Quote) {
  const groups = new Map<string, QuoteItem[]>();
  for (const item of quote) {
    const id = item.choice_group_id;
    if (!id) continue;
    const group = groups.get(id) ?? [];
    group.push(item);
    groups.set(id, group);
  }
  return groups;
}

export function conditionTarget(quote: Quote, item: QuoteItem) {
  const condition = item.show_when;
  if (!condition) return;
  if (condition.kind === "quote_item")
    return quote.find(
      (candidate) =>
        !candidate.choice_group_placeholder && candidate.id === condition.id,
    );
  const matches = quote.filter(
    (candidate) =>
      !candidate.choice_group_placeholder &&
      candidate.pricing_item_id === condition.id,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function validateQuoteConditions(quote: Quote, requireTargets = false) {
  for (const item of quote) {
    if (!item.show_when) continue;
    const seen = new Set([item.id]);
    let target = conditionTarget(quote, item);
    if (requireTargets)
      check(
        target,
        `${item.name}: choose an existing option to show this item`,
      );
    while (target) {
      check(
        !seen.has(target.id),
        `${item.name}: quote visibility rules cannot loop`,
      );
      seen.add(target.id);
      target = conditionTarget(quote, target);
    }
  }
}

/** Required groups the client can see with nothing chosen: the same rule the
 * server applies before signing (hidden groups and "up to one" never count). */
export function missingChoiceGroups(quote: Quote) {
  const shown = new Set(visibleQuote(quote).map((item) => item.id));
  return [...choiceGroups(quote).values()].flatMap((group) => {
    const options = group.filter(
      (item) => shown.has(item.id) && !item.choice_group_placeholder,
    );
    return choiceRequired(group[0]) && options.length && !options.some(selected)
      ? [options]
      : [];
  });
}

export function quoteVisibility(quote: Quote) {
  const visible = new Map<string, boolean>();
  const visiting = new Set<string>();
  function visit(item: QuoteItem): boolean {
    if (visible.has(item.id)) return visible.get(item.id)!;
    if (visiting.has(item.id)) return false;
    visiting.add(item.id);
    const target = conditionTarget(quote, item);
    const show =
      !item.show_when || !!(target && visit(target) && selected(target));
    visible.set(item.id, show);
    visiting.delete(item.id);
    return show;
  }
  for (const item of quote) visit(item);
  return visible;
}

export function visibleQuote(quote: Quote) {
  if (!quote.some((item) => item.show_when || item.choice_group_placeholder))
    return quote;
  const visible = quoteVisibility(quote);
  return quote.filter(
    (item) => !item.choice_group_placeholder && visible.get(item.id),
  );
}

/** Activate defaults on reveal and clear hidden selections, including nested conditions. */
export function applyQuoteVisibility(quote: Quote, before?: Quote): Quote {
  if (!quote.some((item) => item.show_when)) return quote;
  const previous = before ? quoteVisibility(before) : undefined;
  const next = quote.map((item) => ({ ...item }));
  // Walk parents before their descendants. A newly shown default may itself
  // reveal another option, so settle its selection before visiting the child.
  const visited = new Set<string>();
  function apply(item: QuoteItem) {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    const parent = conditionTarget(next, item);
    if (parent) apply(parent);
    const visible =
      !item.show_when ||
      !!(parent && quoteVisibility(next).get(parent.id) && selected(parent));
    if (!visible) item.selected = false;
    else if (previous && !previous.get(item.id) && item.optional) {
      const hasChoice =
        item.choice_group_id &&
        next.some(
          (other) =>
            other !== item &&
            other.choice_group_id === item.choice_group_id &&
            !!previous.get(other.id) &&
            quoteVisibility(next).get(other.id) &&
            selected(other),
        );
      item.selected = item.default_selected && !hasChoice;
    }
  }
  for (const item of next) apply(item);
  return next;
}

/** Editor-only notes. These describe the dependency without exposing hidden prices. */
export function conditionalGroupNotes(quote: Quote) {
  return [...choiceGroups(quote).entries()].flatMap(([id, group]) => {
    const target = conditionTarget(quote, group[0]);
    if (
      !target ||
      !group.every((item) => conditionTarget(quote, item)?.id === target.id)
    )
      return [];
    return [
      {
        id,
        label: choiceGroupLabel(group[0]),
        text: `Shows when ${target.name} is chosen`,
      },
    ];
  });
}
