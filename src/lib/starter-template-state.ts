import type { Template } from "./model";
/** Only customizable content is an edit. Identity, name, availability and metadata are workspace settings. */
export function starterState(value: Template) {
  const authored = {
    content: value.content,
    cover: value.cover,
    header_footer: value.header_footer,
    default_quote: value.default_quote,
    default_items: value.default_items,
    style_overrides: value.style_overrides,
  };
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, n]) => n !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, n]) => [k, sort(n)]),
          )
        : v;
  return JSON.stringify(sort(authored));
}
export const sameStarterState = (a: Template, b: Template) =>
  starterState(a) === starterState(b);
