"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BlockStyle } from "../../lib/block-style";
import {
  documentBlocks,
  transformBlocks,
  type Columns,
} from "../../lib/columns";
import type { Block } from "../../lib/model";
import { useEditorHistory } from "../editor-history";
import { ToastSurface } from "../toast-surface";

export const columnStyleKey = (id: string) => `column-style:${id}`;
export const isColumnStyleKey = (key: string) =>
  key.startsWith("column-style:");

export type StyleDocument = {
  content: Block[];
  prefix: string;
  onChange: (blocks: Block[]) => void;
  onOpenStyles?: () => void;
};
type Column = Columns["items"][number];
export type StyleTarget = {
  key: string;
  block: Block;
  label: string;
  column?: Column;
  style?: BlockStyle;
};

export function styleTarget(
  doc: Pick<StyleDocument, "content" | "prefix">,
  key: string | null,
): StyleTarget | undefined {
  if (!key) return;
  if (isColumnStyleKey(key)) {
    for (const block of doc.content) {
      const index =
        block.columns?.items.findIndex(
          (item) => columnStyleKey(item.id) === key,
        ) ?? -1;
      const column = block.columns?.items[index];
      if (column)
        return {
          key,
          block,
          column,
          label: `Column ${index + 1}`,
          style: column.style,
        };
    }
    return;
  }
  const block = documentBlocks(doc.content).find(
    (item) => `${doc.prefix}${item.id}` === key,
  );
  if (!block || block.type === "page_break") return;
  const label =
    block.type === "columns"
      ? "Columns"
      : block.type === "signature_block"
        ? "Signatures"
        : block.type === "contract"
          ? "Contract"
          : "Block";
  return { key, block, label, style: block.style };
}

export function sameStyle(a?: BlockStyle, b?: BlockStyle) {
  const first = Object.entries(a ?? {});
  return (
    first.length === Object.keys(b ?? {}).length &&
    first.every(([key, value]) => b?.[key as keyof BlockStyle] === value)
  );
}

type Clipboard = { style: BlockStyle; source: string };
type ClipboardContext = {
  styleClipboard: Clipboard | null;
  sourceKey: string | null;
  layoutOpen: boolean;
  setLayoutOpen: (open: boolean) => void;
  copy: (key: string) => void;
  paste: (key: string) => void;
  pasteAll: (blockId: string, sourceKey?: string) => void;
  reset: (key: string) => void;
  update: (key: string, style?: BlockStyle) => void;
};
const Context = createContext<ClipboardContext | null>(null);
export const useStyleClipboard = () => useContext(Context);

export function StyleClipboardProvider({
  children,
  binding,
  selected,
  locked,
}: {
  children: ReactNode;
  binding: { current: StyleDocument | null };
  selected: string | null;
  locked: boolean;
}) {
  const history = useEditorHistory();
  const [styleClipboard, setClipboard] = useState<Clipboard | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(true);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void }>();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const copy = (key: string) => {
    const target =
      !locked && binding.current && styleTarget(binding.current, key);
    if (!target) return;
    setClipboard({
      style: structuredClone(target.style ?? {}),
      source: target.label,
    });
    setSourceKey(key);
  };
  const write = (
    targets: StyleTarget[],
    style?: BlockStyle,
    feedback?: string,
  ) => {
    const doc = binding.current;
    if (locked || !doc || !targets.length) return;
    const controller = history?.controller;
    const before = controller?.engine.lastId;
    const changes = new Map(
      targets.map((target) => {
        const next = structuredClone(style ?? {});
        if (
          target.block.type === "contract" ||
          target.block.type === "signature_block"
        ) {
          delete next.background;
          delete next.border;
          delete next.border_color;
          delete next.radius;
        }
        return [
          target.key,
          Object.keys(next).length ? next : undefined,
        ] as const;
      }),
    );
    const changed = targets.some((target) => {
      const next = changes.get(target.key);
      return next === undefined
        ? target.style !== undefined
        : !sameStyle(target.style, next);
    });
    if (changed) {
      const next = transformBlocks(doc.content, (block) => {
        const key = `${doc.prefix}${block.id}`;
        const columns = block.columns;
        return [
          {
            ...block,
            ...(changes.has(key) ? { style: changes.get(key) } : {}),
            ...(columns
              ? {
                  columns: {
                    ...columns,
                    items: columns.items.map((column) => {
                      const key = columnStyleKey(column.id);
                      return changes.has(key)
                        ? { ...column, style: changes.get(key) }
                        : column;
                    }),
                  },
                }
              : {}),
          },
        ];
      });
      doc.onChange(next);
    }
    if (!feedback) return;
    const id = controller?.engine.lastId;
    // The editor may reject the write, for example when it asks to copy a starter.
    if (changed && controller && id === before) return;
    setNotice({
      text: feedback,
      undo:
        id !== undefined && id !== before
          ? () => controller?.undo(undefined, id)
          : undefined,
    });
  };
  const update = (key: string, style?: BlockStyle) => {
    const target = binding.current && styleTarget(binding.current, key);
    if (target) write([target], style);
  };
  const paste = (key: string) => {
    const target = binding.current && styleTarget(binding.current, key);
    if (!target || !styleClipboard) return;
    const legal =
      target.block.type === "contract"
        ? "contracts"
        : target.block.type === "signature_block"
          ? "signatures"
          : undefined;
    const excluded =
      legal &&
      ["background", "border", "border_color", "radius"].some(
        (field) => field in styleClipboard.style,
      );
    write(
      [target],
      styleClipboard.style,
      `Style pasted to ${target.label}${
        excluded ? `. Background and border don't apply to ${legal}.` : ""
      }`,
    );
  };
  const pasteAll = (blockId: string, ownSource?: string) => {
    const doc = binding.current;
    if (!doc) return;
    const block = doc.content.find((item) => item.id === blockId);
    const source = ownSource ? styleTarget(doc, ownSource) : undefined;
    const clip = source ? { style: source.style } : styleClipboard;
    if (!clip || !block?.columns) return;
    const targets = block.columns.items.flatMap((column) => {
      const key = columnStyleKey(column.id);
      const target = styleTarget(doc, key);
      return target && key !== (ownSource ?? sourceKey) ? [target] : [];
    });
    const names = new Intl.ListFormat("en", { style: "long" }).format(
      targets.map((target) => target.label),
    );
    write(targets, clip.style, `Style pasted to ${names}`);
  };
  const shortcuts = useRef({ copy, paste, selected, locked });
  shortcuts.current = { copy, paste, selected, locked };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const { copy, paste, selected, locked } = shortcuts.current;
      if (
        locked ||
        !selected ||
        !binding.current ||
        !styleTarget(binding.current, selected) ||
        !event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.shiftKey ||
        !["KeyC", "KeyV"].includes(event.code) ||
        (event.target as Element | null)?.closest(
          "input:not([type=radio]),select,dialog:not(.tools-sheet),.block-popover",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      (event.code === "KeyC" ? copy : paste)(selected);
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [binding]);

  return (
    <Context.Provider
      value={{
        styleClipboard,
        sourceKey,
        layoutOpen,
        setLayoutOpen,
        copy,
        paste,
        pasteAll,
        update,
        reset: (key) => update(key),
      }}
    >
      {children}
      {notice && (
        <ToastSurface onDismiss={() => setNotice(undefined)}>
          <span>{notice.text}</span>
          {notice.undo && (
            <button
              type="button"
              onClick={() => {
                notice.undo?.();
                setNotice(undefined);
              }}
            >
              Undo
            </button>
          )}
        </ToastSurface>
      )}
    </Context.Provider>
  );
}
