"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
type BandTarget = {
  kind: "header" | "footer";
  page: number;
  element: HTMLElement;
  edit: () => void;
};
const Context = createContext<{
  active: string | null;
  begin: (id: string) => void;
  end: () => void;
  register: (id: string, target: BandTarget) => () => void;
  edit: (kind: "header" | "footer") => void;
} | null>(null);
export const useBandEditing = () => useContext(Context);
export function BandEditingProvider({ children }: { children: ReactNode }) {
  const [active, begin] = useState<string | null>(null);
  const targets = useRef(new Map<string, BandTarget>());
  return (
    <Context.Provider
      value={{
        active,
        begin,
        end: () => begin(null),
        register: (id, target) => {
          targets.current.set(id, target);
          return () => {
            targets.current.delete(id);
            begin((current) => (current === id ? null : current));
          };
        },
        edit: (kind) => {
          const target = [...targets.current.values()]
            .filter((t) => t.kind === kind)
            .sort((a, b) => a.page - b.page)[0];
          target?.element.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
          target?.edit();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
