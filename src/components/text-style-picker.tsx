"use client";
import { Icon } from "./ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { TextStyleControl } from "../lib/editor-document";
import { ToolbarPopover } from "./toolbar-popover";
const styles = ["Paragraph", "Heading 1", "Heading 2", "Heading 3"];
/** Select-only combobox using the same managed, dismissible surface as other tools. */
export function TextStylePicker({
  value,
  edit = false,
  compact = false,
  listKind,
}: {
  value: TextStyleControl | null;
  edit?: boolean;
  compact?: boolean;
  listKind?: "bullet" | "numbered";
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId();
  const show = () => {
    setActive(value?.value ?? 0);
    setOpen(true);
  };
  const choose = (n: number) => {
    const blockId =
      trigger.current?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
    setOpen(false);
    value?.change(n as 0 | 1 | 2 | 3, () => {
      // Conversion may remount the editor and trigger. Let its focus restoration
      // finish first, then return to the corresponding live menu trigger.
      requestAnimationFrame(() => {
        const button = blockId
          ? document.querySelector<HTMLButtonElement>(
              `[data-block-id="${CSS.escape(blockId)}"] [aria-label="Text style"]`,
            )
          : trigger.current;
        button?.focus({ preventScroll: true });
      });
    });
  };
  useLayoutEffect(() => {
    if (open) list.current?.focus({ preventScroll: true });
  }, [open]);
  return (
    <div
      className={
        edit ? "edit-style-control" : "formatting-group format-style-control"
      }
    >
      <button
        ref={trigger}
        id="document-text-style"
        type="button"
        role={edit ? undefined : "combobox"}
        className="select-compact"
        aria-label="Text style"
        aria-haspopup={edit ? "menu" : "listbox"}
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        title={`Text style · ${styles[value?.value ?? 0]}`}
        disabled={!value}
        onMouseDown={edit ? (e) => e.preventDefault() : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            show();
            if (e.key === "Home") setActive(0);
            if (e.key === "End") setActive(3);
          }
        }}
      >
        <span className="text-style-label">
          {edit && listKind
            ? compact
              ? listKind === "bullet"
                ? "•"
                : "1."
              : listKind === "bullet"
                ? "Bulleted list"
                : "Numbered list"
            : edit && compact
              ? value?.value
                ? `H${value.value}`
                : "¶"
              : styles[value?.value ?? 0]}
        </span>
        {edit && (
          <span className="text-style-caret" aria-hidden="true">
            <Icon name="chevron-down" className="disclosure-icon" />
          </span>
        )}
      </button>
      {open && (
        <ToolbarPopover
          className={
            edit ? "text-style-popover edit-dark-menu" : "text-style-popover"
          }
          trigger={trigger.current}
          close={() => setOpen(false)}
        >
          <div
            ref={list}
            role={edit ? "menu" : "listbox"}
            aria-label="Text styles"
            id={id}
            tabIndex={-1}
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={(e) => {
              if (
                ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(
                  e.key,
                )
              ) {
                e.preventDefault();
                if (e.key === "ArrowDown") setActive((n) => (n + 1) % 4);
                if (e.key === "ArrowUp") setActive((n) => (n + 3) % 4);
                if (e.key === "Home") setActive(0);
                if (e.key === "End") setActive(3);
                if (e.key === "Enter" || e.key === " ") choose(active);
              } else if (e.key === "Tab") setOpen(false);
            }}
          >
            {styles.map((name, n) => (
              <button
                key={name}
                id={`${id}-${n}`}
                type="button"
                role={edit ? "menuitemradio" : "option"}
                aria-label={name}
                tabIndex={-1}
                aria-selected={edit ? undefined : value?.value === n}
                aria-checked={edit ? value?.value === n : undefined}
                data-level={n}
                data-active={active === n}
                onPointerMove={() => setActive(n)}
                onClick={() => choose(n)}
              >
                <span className="text-style-check" aria-hidden="true">
                  {value?.value === n ? "✓" : ""}
                </span>
                <span>{name}</span>
                {edit && <kbd>⌥{n}</kbd>}
              </button>
            ))}
          </div>
        </ToolbarPopover>
      )}
    </div>
  );
}
