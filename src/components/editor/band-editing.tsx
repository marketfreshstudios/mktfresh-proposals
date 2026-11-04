"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useEditorHistory } from "../editor-history";
import { useVisibleEditorAction } from "../use-visible-editor-action";
export type BandNotice = {
  key: number;
  text: string;
  step?: number;
  until: number;
};
type BandTarget = {
  source?: "shared" | "unique" | "hidden";
  kind: "header" | "footer";
  page: number;
  element: HTMLElement;
  edit: () => void;
};
const Context = createContext<{
  announce: (text: string, step?: number) => void;
  moves: Record<string, number>;
  setMoves: (moves: Record<string, number>) => void;
  dismissMove: (key: string) => void;
  device: "desktop" | "tablet" | "phone" | null;
  selected: string | null;
  select: (id: string) => void;
  goTo: (kind: "header" | "footer", page: number) => void;
  active: string | null;
  begin: (id: string) => void;
  end: () => void;
  register: (id: string, target: BandTarget) => () => void;
  edit: (kind: "header" | "footer") => void;
} | null>(null);
export const useBandEditing = () => useContext(Context);
export function BandEditingProvider({
  children,
  renderNotices,
}: {
  children: ReactNode;
  renderNotices?: (
    notices: BandNotice[],
    undo: (notice: BandNotice) => void,
  ) => ReactNode;
}) {
  const history = useEditorHistory(),
    afterVisible = useVisibleEditorAction();
  const [notices, setNotices] = useState<BandNotice[]>([]),
    [moves, setMoves] = useState<Record<string, number>>({});
  const serial = useRef(0);
  useEffect(() => {
    if (!notices.length) return;
    const timer = setTimeout(
      () =>
        setNotices((current) => current.filter((n) => n.until > Date.now())),
      Math.max(1, Math.min(...notices.map((n) => n.until)) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [notices]);
  const [active, setActive] = useState<string | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "phone" | null>(
    null,
  );
  useEffect(() => {
    const update = () =>
      setDevice(
        innerWidth < 700 ? "phone" : innerWidth < 960 ? "tablet" : "desktop",
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const targets = useRef(new Map<string, BandTarget>());
  return (
    <Context.Provider
      value={{
        announce: (text, step = history?.controller?.engine.lastId) =>
          setNotices((current) => [
            ...current,
            { key: ++serial.current, text, step, until: Date.now() + 8000 },
          ]),
        moves,
        setMoves,
        dismissMove: (key) =>
          setMoves((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          }),
        device,
        selected,
        select,
        active,
        begin: (id) => {
          select(id);
          setMoves({});
          setActive(id);
        },
        end: () => {
          setActive(null);
          select(null);
        },
        goTo: (kind, page) => {
          const target = [...targets.current.values()].find(
            (t) => t.kind === kind && t.page === page,
          );
          if (target) {
            document
              .querySelector<HTMLDialogElement>("dialog.tools-sheet:modal")
              ?.close();
            afterVisible(target.element, () => {
              target.element.scrollIntoView({ block: "center" });
              target.element.focus({ preventScroll: true });
            });
          }
        },
        register: (id, target) => {
          targets.current.set(id, target);
          return () => {
            targets.current.delete(id);
            queueMicrotask(() => {
              if (!targets.current.has(id))
                setActive((current) => (current === id ? null : current));
            });
          };
        },
        edit: (kind) => {
          const target = [...targets.current.values()]
            .filter(
              (t) => t.kind === kind && (!t.source || t.source === "shared"),
            )
            .sort((a, b) => a.page - b.page)[0];
          if (target) {
            document
              .querySelector<HTMLDialogElement>("dialog.tools-sheet:modal")
              ?.close();
            afterVisible(target.element, () => {
              target.element.scrollIntoView({ block: "center" });
              target.edit();
            });
          }
        },
      }}
    >
      {children}
      {renderNotices?.(notices, (notice) => {
        if (notice.step !== undefined)
          history?.controller?.undo(undefined, notice.step);
        setNotices((current) => current.filter((n) => n.step !== notice.step));
      })}
    </Context.Provider>
  );
}
