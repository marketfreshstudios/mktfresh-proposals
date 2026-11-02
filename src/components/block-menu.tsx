"use client";
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
  const [host, setHost] = useState<Element | null>(null),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    file = useRef<HTMLInputElement>(null);
  const fallback = useRef<HTMLElement | null>(null);
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
    {
      group: "Text",
      name: "Heading",
      description: "Start a new section",
      icon: "heading",
      block: { type: "heading", text: "New section" },
    },
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
      const box = popover.getBoundingClientRect();
      const top = a?.bottom ?? 80,
        below = innerHeight - top - 12;
      const y =
        box.height > below && (a?.top ?? 0) > below
          ? Math.max(8, (a?.top ?? top) - box.height - 6)
          : Math.min(top + 6, innerHeight - box.height - 8);
      popover.style.left = `${Math.max(8, Math.min(a?.left ?? 16, innerWidth - box.width - 8))}px`;
      popover.style.top = `${Math.max(8, y)}px`;
      popover.dataset.placement = y < (a?.top ?? 0) ? "above" : "below";
    };
    place();
    input.current?.focus();
    const resize = new ResizeObserver(place);
    resize.observe(popover);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      popover.hidePopover();
    };
  }, [host, anchor]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (
        !ref.current?.contains(e.target as Node) &&
        !anchor?.contains(e.target as Node)
      )
        onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [anchor, onClose]);
  const choose = (option: Option) => {
    if (option.image) file.current?.click();
    else if (option.block) onChoose(structuredClone(option.block));
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
