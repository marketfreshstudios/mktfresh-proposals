"use client";
import { useControlLayout } from "./editor/control-layout";
import { useManagedPopover } from "./editor-popovers";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import type { Block } from "../lib/model";
import { blockOptions, type BlockOption as Option } from "./block-options";
export function BlockMenu({
  anchor,
  hasPricing,
  saved,
  onChoose,
  onClose,
  signatureRoles = [],
  variant = "menu",
  onDragStart,
}: {
  anchor: HTMLElement | null;
  hasPricing: boolean;
  saved: { id: string; name: string; block: Block }[];
  onChoose: (block: Block, extra?: Block[]) => void;
  onClose: () => void;
  signatures?: boolean;
  signatureRoles?: string[];
  variant?: "menu" | "panel";
  onDragStart?: () => void;
}) {
  const { desktop, phone } = useControlLayout();
  useManagedPopover(variant === "menu", onClose);
  const [host, setHost] = useState<Element | null>(null),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [error, setError] = useState("");
  const ref = useRef<HTMLElement>(null),
    input = useRef<HTMLInputElement>(null),
    file = useRef<HTMLInputElement>(null);
  const fallback = useRef<HTMLElement | null>(null);
  const close = useRef(onClose),
    restoreTrigger = useRef(false);
  close.current = onClose;
  const allOptions = blockOptions({ hasPricing, saved, signatureRoles });
  const optionName = (option: Option) =>
    variant === "panel"
      ? option.name === "Text"
        ? "Paragraph"
        : option.name === "Pricing table"
          ? "Pricing / Quote"
          : option.name
      : option.name;
  const options = allOptions.filter((o) =>
    `${optionName(o)} ${o.name} ${o.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  useEffect(() => {
    fallback.current = document.activeElement as HTMLElement;
    setHost(
      (anchor ?? fallback.current)?.closest("dialog[open]") ??
        document.querySelector(".staff-foundation") ??
        document.body,
    );
  }, []);
  useLayoutEffect(() => {
    const popover = ref.current;
    if (!host || !popover) return;
    if (variant === "panel") return;
    if (phone) {
      (popover as HTMLDialogElement).showModal();
      input.current?.focus();
      return () => {
        const returnFocus = restoreTrigger.current;
        restoreTrigger.current = false;
        if (returnFocus)
          popover.addEventListener(
            "close",
            () => {
              requestAnimationFrame(() => {
                const button = anchor?.matches("button")
                  ? anchor
                  : fallback.current;
                if (
                  button?.isConnected &&
                  !document.querySelector("dialog:modal")
                )
                  button.focus({ preventScroll: true });
              });
            },
            { once: true },
          );
        (popover as HTMLDialogElement).close();
      };
    }
    popover.showPopover();
    const place = () => {
      const a = (anchor ?? fallback.current)?.getBoundingClientRect();
      popover.style.maxHeight = "";
      const preferred = popover.getBoundingClientRect();
      const edge = anchor?.dataset.insertEdge;
      const frame = anchor
        ?.closest<HTMLElement>(".block-frame")
        ?.getBoundingClientRect();
      if (desktop && edge && frame && a) {
        const y = (edge === "above" ? frame.top : frame.bottom) + 18;
        popover.style.maxHeight = `${Math.max(0, Math.min(420, innerHeight - y - 8))}px`;
        popover.style.left = `${Math.max(8, Math.min(a.left, innerWidth - preferred.width - 8))}px`;
        popover.style.top = `${Math.max(8, y)}px`;
        popover.dataset.placement = edge;
        return;
      }
      const top = a?.bottom ?? 80,
        below = innerHeight - top - 14,
        above = (a?.top ?? top) - 14,
        flip = preferred.height > below && above > below;
      // Scrolling belongs inside the menu when neither side fits its preferred
      // height; clamping its top alone would overlap the trigger/document.
      popover.style.maxHeight = `${Math.max(0, Math.min(preferred.height, flip ? above : below))}px`;
      const box = popover.getBoundingClientRect(),
        y = flip
          ? Math.max(8, (a?.top ?? top) - box.height - 6)
          : Math.min(top + 6, innerHeight - box.height - 8);
      popover.style.left = `${Math.max(8, Math.min(a?.left ?? 16, innerWidth - box.width - 8))}px`;
      popover.style.top = `${Math.max(8, y)}px`;
      popover.dataset.placement = y < (a?.top ?? 0) ? "above" : "below";
    };
    place();
    input.current?.focus({ preventScroll: true });
    const resize = new ResizeObserver(place);
    resize.observe(popover);
    window.addEventListener("resize", place);
    // Pagination can move a trigger without resizing it or scrolling. Keep the
    // open menu attached to its current bounds, including during page updates.
    let frame = 0,
      previous = "";
    const follow = () => {
      const a = (anchor ?? fallback.current)?.getBoundingClientRect(),
        box = popover.getBoundingClientRect(),
        geometry = `${a?.x},${a?.y},${a?.width},${a?.height},${box.width},${box.height}`;
      if (geometry !== previous) {
        previous = geometry;
        place();
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", place);

      popover.hidePopover();
      if (restoreTrigger.current) {
        restoreTrigger.current = false;
        (anchor?.matches("button") ? anchor : fallback.current)?.focus({
          preventScroll: true,
        });
      }
    };
  }, [host, anchor, desktop, phone, variant]);
  useEffect(() => {
    if (variant === "panel") return;
    const outside = (e: PointerEvent) => {
      if (
        !ref.current?.contains(e.target as Node) &&
        !(anchor?.matches("button") && anchor.contains(e.target as Node))
      )
        close.current();
    };
    // A focus/scrollIntoView from the preceding block insertion can have a
    // queued scroll event when this menu opens. Only movement after opening
    // dismisses it; unrelated panels and the menu's own scrolling do not.
    const positions = new Map<Element, { top: number; left: number }>();
    let ancestor: Element | null = anchor ?? fallback.current;
    while (ancestor) {
      positions.set(ancestor, {
        top: ancestor.scrollTop,
        left: ancestor.scrollLeft,
      });
      ancestor = ancestor.parentElement;
    }
    const page = document.scrollingElement;
    if (page)
      positions.set(page, { top: page.scrollTop, left: page.scrollLeft });
    const scroll = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return;
      const element =
        event.target === document
          ? document.scrollingElement
          : (event.target as Element);
      const before = element && positions.get(element);
      if (
        before &&
        (element.scrollTop !== before.top || element.scrollLeft !== before.left)
      )
        close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      restoreTrigger.current = true;
      close.current();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [anchor, variant]);
  const choose = (option: Option) => {
    if (option.disabled) return;
    if (option.image) file.current?.click();
    else if (option.block) {
      onChoose(
        structuredClone(option.block),
        option.extra?.map((b) => structuredClone(b)),
      );
      onClose();
    }
  };
  const focusRow = (at: number) => {
    if (!options.some((option) => !option.disabled)) {
      input.current?.focus();
      return;
    }
    let n = (at + options.length) % options.length;
    const step = at < active ? -1 : 1;
    while (options[n]?.disabled)
      n = (n + step + options.length) % options.length;
    setActive(n);
    ref.current
      ?.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
      [n]?.focus();
  };
  if (!host) return null;
  const Surface = variant === "panel" ? "div" : phone ? "dialog" : "div";
  const render = (content: import("react").ReactNode) =>
    variant === "panel" ? content : createPortal(content, host);
  return render(
    <Surface
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      data-editor-chrome
      popover={phone || variant === "panel" ? undefined : "manual"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (phone && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right)
            onClose();
        }
      }}
      role={variant === "panel" ? "region" : "dialog"}
      aria-label={variant === "panel" ? "Insert blocks" : "Add a block"}
      className={
        variant === "panel"
          ? "blocks-panel block-owned-dialog"
          : `block-popover block-owned-dialog ${phone ? "phone-block-menu" : ""}`
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (options.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          focusRow(
            e.target === input.current
              ? e.key === "ArrowDown"
                ? 0
                : options.length - 1
              : active + (e.key === "ArrowDown" ? 1 : -1),
          );
        } else if (
          e.key === "Enter" &&
          e.target === input.current &&
          options.length
        ) {
          e.preventDefault();
          const first = options.find((o) => !o.disabled);
          if (first) choose(first);
        }
      }}
    >
      {variant === "menu" && (desktop || phone) && (
        <header className="editor-block-menu-heading">
          {phone && (
            <button
              type="button"
              aria-label="Close block menu"
              onClick={onClose}
            >
              Cancel
            </button>
          )}
          <strong>
            {anchor?.dataset.insertEdge === "above" ? "Add above" : "Add below"}
          </strong>
          {!phone && (
            <button
              type="button"
              aria-label="Close block menu"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </header>
      )}
      <input
        ref={input}
        type="search"
        aria-label="Search blocks"
        placeholder="Search blocks…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
      />
      <div className="block-menu-options" role="menu" aria-label="Block types">
        {["Text", "Media", "Proposal", "Saved blocks"].map(
          (group) =>
            options.some((o) => o.group === group) && (
              <section key={group} role="group" aria-label={group}>
                <h3>{group}</h3>
                {options.map(
                  (option, i) =>
                    option.group === group && (
                      <button
                        key={`${i}-${option.name}`}
                        type="button"
                        role="menuitem"
                        disabled={option.disabled}
                        aria-disabled={option.disabled || undefined}
                        tabIndex={i === active ? 0 : -1}
                        aria-label={optionName(option)}
                        className={i === active ? "active" : ""}
                        onFocus={() => setActive(i)}
                        onMouseEnter={() => setActive(i)}
                        draggable={!option.disabled && !!option.block}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/x-yeswell-block",
                            JSON.stringify([
                              option.block,
                              ...(option.extra ?? []),
                            ]),
                          );
                          event.dataTransfer.effectAllowed = "copy";
                          onDragStart?.();
                        }}
                        onClick={() => choose(option)}
                      >
                        <span className="block-menu-icon">
                          <Icon name={option.icon} />
                        </span>
                        <span>
                          <strong>{optionName(option)}</strong>
                          <small>{option.description}</small>
                        </span>
                        {variant === "panel" &&
                          option.group === "Saved blocks" && (
                            <>
                              <span className="saved-block-insert-caption">
                                Insert
                              </span>
                              <span
                                className="saved-block-drag-cue"
                                aria-hidden="true"
                              >
                                ⋮⋮
                              </span>
                            </>
                          )}
                      </button>
                    ),
                )}
              </section>
            ),
        )}
        {!options.length && <p className="muted">No matching blocks</p>}
      </div>
      {error && <p role="alert">{error}</p>}
      <input
        ref={file}
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (!chosen) return;
          if (
            chosen.size > 700000 ||
            !["image/png", "image/jpeg"].includes(chosen.type)
          ) {
            setError("Use a PNG or JPEG smaller than 700 KB");
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            onChoose({
              type: "image",
              src: String(reader.result),
              alt: chosen.name,
            });
          reader.onerror = () =>
            setError("Unable to read image. Try another file.");
          reader.readAsDataURL(chosen);
        }}
      />
    </Surface>,
  );
}
