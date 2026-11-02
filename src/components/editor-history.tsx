"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { EditorHistory } from "../lib/editor-history";
type Controller = {
  engine: EditorHistory<any>;
  undo: (scope?: string, id?: number) => void;
  redo: (scope?: string) => void;
};
type Context = {
  controller: Controller | null;
  bind: (controller: Controller | null) => void;
  scope: { current: string | undefined };
  inScope: (scope: string, action: () => void) => void;
};
const HistoryContext = createContext<Context | null>(null);
export const useEditorHistory = () => useContext(HistoryContext);
export function textHistoryScope(element: Element | null) {
  const block = element?.closest<HTMLElement>(
    ".block-frame,[data-history-block]",
  );
  return `text:${block?.dataset.blockId ?? block?.dataset.historyBlock ?? "title"}`;
}
export function EditorHistoryProvider({ children }: { children: ReactNode }) {
  const [controller, bind] = useState<Controller | null>(null);
  const scope = useRef<string | undefined>(undefined);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        !["z", "y"].includes(event.key.toLowerCase())
      )
        return;
      const target = event.target as HTMLElement;
      const form = target.closest<HTMLInputElement | HTMLTextAreaElement>(
        "input,textarea",
      );
      const nativeText =
        form &&
        (form.tagName === "TEXTAREA" ||
          !["checkbox", "radio", "button", "submit"].includes(
            (form as HTMLInputElement).type,
          ));
      if (nativeText && !target.closest("[data-document-text]")) return;
      if (
        !controller ||
        target.closest(
          ".block-dialog,.block-popover,.subject-field,[data-history-independent]",
        )
      )
        return;
      const redo = event.key.toLowerCase() === "y" || event.shiftKey;
      const local = target.closest(".field-editor,[data-document-text]")
        ? textHistoryScope(target)
        : undefined;
      event.preventDefault();
      event.stopPropagation();
      (redo ? controller.redo : controller.undo)(local);
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [controller]);
  return (
    <HistoryContext.Provider
      value={{
        controller,
        bind,
        scope,
        inScope: (next, action) => {
          const old = scope.current;
          scope.current = next;
          try {
            action();
          } finally {
            scope.current = old;
          }
        },
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}
const noopSubscribe = () => () => {};
export function useHistoryStatus() {
  const history = useEditorHistory(),
    controller = history?.controller;
  useSyncExternalStore(
    controller?.engine.subscribe ?? noopSubscribe,
    controller?.engine.snapshot ?? (() => 0),
    () => 0,
  );
  return {
    controller,
    canUndo: !!controller?.engine.past.length,
    canRedo: !!controller?.engine.future.length,
  };
}
/** History contains editable values only; applying it always uses the owner's normal save path. */
export function useSessionHistory<T>(
  key: string,
  apply: (value: T) => void,
  get: () => T,
) {
  const context = useEditorHistory();
  const latest = useRef({ key, apply, get });
  latest.current = { key, apply, get };
  const controller = useMemo<Controller>(() => {
    const engine = new EditorHistory<T>();
    return {
      engine,
      undo: (scope, id) => {
        if (latest.current.key !== key) return;
        const current = latest.current.get(),
          next = engine.undo(current, scope, id);
        if (next !== current) latest.current.apply(next);
      },
      redo: (scope) => {
        if (latest.current.key !== key) return;
        const current = latest.current.get(),
          next = engine.redo(current, scope);
        if (next !== current) latest.current.apply(next);
      },
    };
  }, [key]);
  useEffect(() => {
    context?.bind(controller);
    return () => context?.bind(null);
  }, [controller]);
  return {
    record: (before: T, after: T) =>
      controller.engine.record(before, after, context?.scope.current),
    controller,
  };
}
