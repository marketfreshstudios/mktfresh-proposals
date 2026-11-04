"use client";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  bandColumns,
  bandJustify,
  type BandLayout,
} from "../../lib/page-bands";
import { fieldGroup, fieldLabel } from "../../lib/field-labels";
export const layouts: [BandLayout, string][] = [
  ["left", "Left"],
  ["center", "Center"],
  ["right", "Right"],
  ["half", "50 / 50"],
  ["wide", "75 / 25"],
  ["thirds", "Thirds"],
];
export function LayoutGlyph({ layout }: { layout: BandLayout }) {
  return (
    <span
      aria-hidden="true"
      className="band-layout-glyph"
      style={{ gridTemplateColumns: bandColumns(layout) }}
    >
      {bandJustify(layout).map((justify, n) => (
        <span key={n} style={{ justifySelf: justify }} />
      ))}
    </span>
  );
}
export function menuKeys(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const buttons = [
    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  ];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  e.preventDefault();
  buttons[
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? buttons.length - 1
        : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length
  ]?.focus();
}
export function LayoutMenu({
  value,
  onPick,
}: {
  value: BandLayout;
  onPick: (v: BandLayout) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      ref={root}
      className="band-layout-menu"
      role="menu"
      aria-label="Band layout"
      onKeyDown={menuKeys}
    >
      {[
        ["1 column", layouts.slice(0, 3)],
        ["2 columns", layouts.slice(3, 5)],
        ["3 columns", layouts.slice(5)],
      ].map(([label, items]) => (
        <section
          role="group"
          aria-label={label as string}
          key={label as string}
        >
          <h3 aria-hidden="true">{label as string}</h3>
          <div>
            {(items as typeof layouts).map(([layout, name]) => (
              <button
                key={layout}
                role="menuitemradio"
                aria-checked={layout === value}
                onClick={() => onPick(layout)}
              >
                <LayoutGlyph layout={layout} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p>
        Switching to fewer columns moves the extra content into the last column,
        so nothing is lost.
      </p>
    </div>
  );
}
export function BandFieldMenu({
  map,
  page,
  count,
  onPick,
}: {
  map: Record<string, string>;
  page: number;
  count: number;
  onPick: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => search.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const pageFields = [
    { path: "page.number", label: "Page number", value: String(page) },
    { path: "page.count", label: "Page count", value: String(count) },
    {
      path: "page.number+count",
      label: "Page 3 of 9",
      value: `Page ${page} of ${count}`,
    },
  ];
  const groups = [
    { label: "Page", items: pageFields },
    ...["Client", "Proposal", "Sender & workspace", "Totals"].map((label) => ({
      label,
      items: Object.keys(map)
        .filter((path) => fieldGroup(path) === label)
        .map((path) => ({ path, label: fieldLabel(path), value: map[path] })),
    })),
  ].map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      `${i.label} ${i.path}`.toLowerCase().includes(query.toLowerCase()),
    ),
  }));
  return (
    <div className="band-fields-menu" onKeyDown={menuKeys}>
      <input
        ref={search}
        type="search"
        autoFocus
        aria-label="Search band fields"
        placeholder="Search fields"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div role="menu" aria-label="Band fields">
        {groups.map((g) =>
          g.items.length ? (
            <section role="group" aria-label={g.label} key={g.label}>
              <h3 aria-hidden="true">{g.label}</h3>
              {g.items.map((i) => (
                <button
                  role="menuitem"
                  key={i.path}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(i.path)}
                >
                  <strong>{i.label}</strong>
                  <code>
                    {i.path === "page.number+count"
                      ? "{{page.number}} / {{page.count}}"
                      : `{{${i.path}}}`}
                  </code>
                  <small title={i.value}>{i.value || "—"}</small>
                </button>
              ))}
            </section>
          ) : null,
        )}
      </div>
      {!groups.some((g) => g.items.length) && <p>No fields match.</p>}
    </div>
  );
}
