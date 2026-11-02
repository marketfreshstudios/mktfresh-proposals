"use client";
import { useManagedPopover } from "./editor-popovers";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import type { Block } from "../lib/model";
import type icons from "./icons.json";
type Option = {
  name: string;
  description: string;
  icon: keyof typeof icons;
  group: string;
  block?: Block;
  image?: boolean;
};
export function BlockMenu({
  anchor,
  hasPricing,
  saved,
  onChoose,
  onClose,
  signatures = false,
}: {
  anchor: HTMLElement | null;
  hasPricing: boolean;
  saved: { id: string; name: string; block: Block }[];
  onChoose: (block: Block) => void;
  onClose: () => void;
  signatures?: boolean;
}) {
  useManagedPopover(true, onClose);
  const [host, setHost] = useState<Element | null>(null),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    file = useRef<HTMLInputElement>(null);
  const fallback = useRef<HTMLElement | null>(null);
  const close = useRef(onClose),
    restoreTrigger = useRef(false);
  close.current = onClose;
  const text = (kind?: string): Block => ({
    type: "paragraph",
    content: {
      type: "doc",
      content: kind
        ? [
            {
              type: kind,
              content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
            },
          ]
        : [{ type: "paragraph" }],
    },
  });
  const allOptions: Option[] = [
    ...([1, 2, 3] as const).map((level) => ({
      group: "Text",
      name: `Heading ${level}`,
      description:
        level === 1 ? "Start a new section" : "Subheading within this section",
      icon: "heading" as const,
      block: {
        type: "heading" as const,
        level,
        text: level === 1 ? "New section" : "Subheading",
      },
    })),
    {
      group: "Text",
      name: "Text",
      description: "A paragraph of rich text",
      icon: "align-left",
      block: text(),
    },
    {
      group: "Text",
      name: "Bulleted list",
      description: "An unordered list",
      icon: "list-ul",
      block: text("bulletList"),
    },
    {
      group: "Text",
      name: "Numbered list",
      description: "A list of steps in order",
      icon: "list-ol",
      block: text("orderedList"),
    },
    {
      group: "Media",
      name: "Image",
      description: "Upload a PNG or JPEG",
      icon: "image",
      image: true,
    },
    ...(!hasPricing
      ? [
          {
            group: "Proposal",
            name: "Pricing table",
            description: "The quote with totals",
            icon: "table" as const,
            block: { type: "pricing_table" as const },
          },
        ]
      : []),
    {
      group: "Proposal",
      name: "Contract",
      description: "Terms and contract clauses",
      icon: "file-contract",
      block: {
        type: "contract",
        text: "Statement of Work & Contract",
        clauses: [],
      },
    },
    {
      group: "Proposal",
      name: "Page break",
      description: "Start the next PDF page",
      icon: "file-lines",
      block: { type: "page_break" },
    },
    ...(signatures
      ? ["client", "company"].map((role) => ({
          group: "Proposal",
          name: role === "client" ? "Client signature" : "Company signature",
          description: "A required signature block",
          icon: "signature" as const,
          block: {
            type: "signature_block" as const,
            role: role as "client" | "company",
          },
        }))
      : []),
    ...saved
      .filter((s) => !(hasPricing && s.block.type === "pricing_table"))
      .map((s) => ({
        group: "Saved blocks",
        name: s.name,
        description: "Saved block",
        icon: "bookmark" as const,
        block: s.block,
      })),
  ];
  const options = allOptions.filter((o) =>
    `${o.name} ${o.description}`.toLowerCase().includes(query.toLowerCase()),
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
    popover.showPopover();
    const place = () => {
      const a = (anchor ?? fallback.current)?.getBoundingClientRect();
      popover.style.maxHeight = "";
      const preferred = popover.getBoundingClientRect();
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
  }, [host, anchor]);
  useEffect(() => {
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
  }, [anchor]);
  const choose = (option: Option) => {
    if (option.image) file.current?.click();
    else if (option.block) {
      onChoose(structuredClone(option.block));
      onClose();
    }
  };
  const focusRow = (at: number) => {
    const n = (at + options.length) % options.length;
    setActive(n);
    ref.current
      ?.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
      [n]?.focus();
  };
  if (!host) return null;
  return createPortal(
    <div
      ref={ref}
      popover="manual"
      role="dialog"
      aria-label="Add a block"
      className="block-popover block-owned-dialog"
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
          choose(options[0]);
        }
      }}
    >
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
                        tabIndex={i === active ? 0 : -1}
                        aria-label={option.name}
                        className={i === active ? "active" : ""}
                        onFocus={() => setActive(i)}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(option)}
                      >
                        <span className="block-menu-icon">
                          <Icon name={option.icon} />
                        </span>
                        <span>
                          <strong>{option.name}</strong>
                          <small>{option.description}</small>
                        </span>
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
    </div>,
    host,
  );
}
