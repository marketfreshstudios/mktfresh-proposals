"use client";
import { Icon } from "../ui";
export type Alignment = "left" | "center" | "right";
export function CoverAlignMenu({
  align,
  onAlign,
  onAll,
}: {
  align: Alignment;
  onAlign: (a: Alignment) => void;
  onAll: (a: Alignment) => void;
}) {
  return (
    <>
      {(["left", "center", "right"] as const).map((a) => (
        <button
          type="button"
          key={a}
          aria-pressed={align === a}
          onClick={() => onAlign(a)}
        >
          <Icon name={`align-${a}`} /> Align {a}
          <span className="menu-check" aria-hidden="true">
            {align === a ? "✓" : ""}
          </span>
        </button>
      ))}
      <hr />
      <small className="menu-group-label">All cover items</small>
      {(["left", "center", "right"] as const).map((a) => (
        <button type="button" key={a} onClick={() => onAll(a)}>
          <Icon name={`align-${a}`} /> {a[0].toUpperCase() + a.slice(1)}
        </button>
      ))}
    </>
  );
}
