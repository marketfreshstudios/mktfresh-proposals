"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { TextStyleControl } from "../lib/editor-document";
import { ToolbarPopover } from "./toolbar-popover";
const styles = ["Paragraph", "Heading 1", "Heading 2", "Heading 3"];
/** Select-only combobox using the same managed, dismissible surface as other tools. */
export function TextStylePicker({ value }: { value: TextStyleControl | null }) {
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
    setOpen(false);
    value?.change(n as 0 | 1 | 2 | 3);
  };
  useLayoutEffect(() => {
    if (open) list.current?.focus({ preventScroll: true });
  }, [open]);
  return (
    <div className="formatting-group format-style-control">
      <button
        ref={trigger}
        id="document-text-style"
        type="button"
        role="combobox"
        className="select-compact"
        aria-label="Text style"
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        title={`Text style · ${styles[value?.value ?? 0]}`}
        disabled={!value}
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
        {styles[value?.value ?? 0]}
      </button>
      {open && (
        <ToolbarPopover
          className="text-style-popover"
          trigger={trigger.current}
          close={() => setOpen(false)}
        >
          <div
            ref={list}
            role="listbox"
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
                role="option"
                tabIndex={-1}
                aria-selected={value?.value === n}
                data-active={active === n}
                onPointerMove={() => setActive(n)}
                onClick={() => choose(n)}
              >
                {name}
              </button>
            ))}
          </div>
        </ToolbarPopover>
      )}
    </div>
  );
}
