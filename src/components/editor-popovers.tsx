"use client";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
class Popovers {
  active?: { id: symbol; close: () => void };
  claim(id: symbol, close: () => void) {
    if (this.active?.id !== id) this.active?.close();
    this.active = { id, close };
    return () => {
      if (this.active?.id === id) this.active = undefined;
    };
  }
}
const fallback = new Popovers();
const Context = createContext(fallback);
export function EditorPopoverProvider({ children }: { children: ReactNode }) {
  const manager = useRef<Popovers>(null);
  if (!manager.current) manager.current = new Popovers();
  return (
    <Context.Provider value={manager.current}>{children}</Context.Provider>
  );
}
/** All editor portals keep this scope, so opening a new surface closes its predecessor. */
export function useManagedPopover(open: boolean, close: () => void) {
  const manager = useContext(Context),
    id = useRef(Symbol()),
    latest = useRef(close);
  latest.current = close;
  useLayoutEffect(() => {
    if (open) return manager.claim(id.current, () => latest.current());
  }, [manager, open]);
}
