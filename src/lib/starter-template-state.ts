import type { Template } from "./model";
/** Authored state only: layout plans, timestamps and read-model annotations are not edits. */
export function starterState(value: Template) {
  const ignored = new Set([
    "updated_at",
    "created_at",
    "metadata",
    "pagination",
    "workspace_id",
    "starter_edited",
    "source_starter_name",
  ]);
  const sort = (v: any): any =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => v[k] !== undefined)
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(
    sort(
      Object.fromEntries(
        Object.entries(value).filter(([k]) => !ignored.has(k)),
      ),
    ),
  );
}
export const sameStarterState = (a: Template, b: Template) =>
  starterState(a) === starterState(b);
