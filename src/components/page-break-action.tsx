"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import type { Block } from "../lib/model";
import { useBlockSelection } from "./block-controls";
import { Icon } from "./ui";
type Config = { content: Block[]; change: (v: Block[]) => void };
const PageActions = createContext<{
  config: import("react").RefObject<Config | null>;
  refresh: () => void;
  version: number;
} | null>(null);
export function PageBreakProvider({ children }: { children: ReactNode }) {
  const config = useRef<Config | null>(null),
    [version, setVersion] = useState(0);
  return (
    <PageActions.Provider
      value={{ config, version, refresh: () => setVersion((n) => n + 1) }}
    >
      {children}
    </PageActions.Provider>
  );
}
export function PageBreakController({
  content,
  onChange,
}: {
  content: Block[];
  onChange: (v: Block[]) => void;
}) {
  const context = useContext(PageActions)!;
  useLayoutEffect(() => {
    context.config.current = { content, change: onChange };
    context.refresh();
  }, [content]);
  useLayoutEffect(
    () => () => {
      context.config.current = null;
    },
    [],
  );
  return null;
}
export function PageBreakAction({ block }: { block?: string }) {
  const actions = useContext(PageActions)?.config.current,
    selection = useBlockSelection();
  if (!actions || !actions.content.length) return null;
  const id = (block ?? selection.selected ?? "").replace(
    /^(block-|template-)/,
    "",
  );
  const index = actions.content.findIndex((b) => b.id === id);
  if (block && index < 0) return null;
  const remove = index > 0 && actions.content[index - 1].type === "page_break";
  const label = remove ? "Remove page break" : "Start on next page";
  return (
    <button
      type="button"
      className="formatting-button block-page-action"
      aria-label={label}
      title={label}
      disabled={index < 0 || actions.content[index]?.type === "page_break"}
      onClick={() => {
        const next = [...actions.content];
        if (remove) next.splice(index - 1, 1);
        else
          next.splice(index, 0, {
            id: crypto.randomUUID(),
            type: "page_break",
          });
        actions.change(next);
      }}
    >
      <Icon name="file-lines" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
