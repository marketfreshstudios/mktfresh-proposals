import type { Block, Quote } from "./model";
/** Layout identity excludes staff review flags; it never changes the saved/hash input. */
export function printView(content: Block[], quote: Quote) {
  return {
    content: content.map(
      ({ ai_review, contract_edited, clauses, ...block }) => ({
        ...block,
        ...(clauses
          ? { clauses: clauses.map(({ draft, ...clause }) => clause) }
          : {}),
      }),
    ),
    quote: quote.map((i) => ({
      id: i.id,
      order: i.order,
      name: i.name,
      description: i.description,
      optional: i.optional,
      default_selected: i.default_selected,
      selected: i.selected,
      choice_group_id: i.choice_group_id,
      min_term_months: i.min_term_months,
      schedule: i.schedule,
      plan_terms: { client_copy: i.plan_terms?.client_copy },
      sublines: i.sublines.map((s) => ({
        id: s.id,
        label: s.label,
        amount: s.amount,
        qty: s.qty,
        interval: s.interval,
      })),
    })),
  };
}
export function viewKey(value: unknown) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
