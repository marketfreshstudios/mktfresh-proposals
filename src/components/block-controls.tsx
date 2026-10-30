"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
const ToolbarTarget = createContext<HTMLElement | null | undefined>(undefined);
export const useBlockToolbar = () => useContext(ToolbarTarget);
const Selection = createContext({
  active: null as string | null,
  selected: null as string | null,
  hover: (_id: string | null) => {},
  select: (_id: string) => {},
  clear: () => {},
});
export function useBlockSelection() {
  return useContext(Selection);
}
export function BlockScope({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null);
  const clear = () => {
    setSelected(null);
    setHovered(null);
  };
  return (
    <Selection.Provider
      value={{
        active: selected ?? hovered,
        selected,
        hover: setHovered,
        select: setSelected,
        clear,
      }}
    >
      <div
        className="block-scope"
        onPointerLeave={() => setHovered(null)}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") {
            clear();
            if ((e.target as Element).closest(".block-frame")) {
              (e.target as HTMLElement).blur();
            }
          }
        }}
      >
        {children}
      </div>
    </Selection.Provider>
  );
}
export function BlockAction({
  children,
  variant: _variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  const selection = useBlockSelection();
  const label =
    props["aria-label"] ??
    (typeof children === "string" ? children.trim() : "Block action");
  const icon = /up/i.test(label)
    ? "↑"
    : /down/i.test(label)
      ? "↓"
      : /remove/i.test(label)
        ? "×"
        : /reviewed/i.test(label)
          ? "✓"
          : /save|reuse/i.test(label)
            ? "▣"
            : "⚙";
  return (
    <button
      {...props}
      type="button"
      className="block-action"
      aria-label={label}
      title={label}
      onClick={(e) => {
        props.onClick?.(e);
        if (/move|remove/i.test(label)) selection.clear();
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{children}</span>
    </button>
  );
}
export function BlockFrame({
  id,
  label,
  children,
  tools,
  className = "",
  ai = false,
  onReviewed,
}: {
  id: string;
  label: string;
  children: ReactNode;
  tools: ReactNode;
  className?: string;
  ai?: boolean;
  onReviewed?: () => void;
}) {
  const selection = useBlockSelection();
  const [toolbar, setToolbar] = useState<HTMLSpanElement | null>(null);
  return (
    <ToolbarTarget.Provider value={toolbar}>
      <div
        className={`block-frame ${className}`}
        data-block-id={id}
        data-active={selection.active === id}
        data-selected={selection.selected === id}
        data-ai={ai}
        tabIndex={0}
        role="group"
        aria-label={label}
        onPointerOver={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.hover(id);
        }}
        onPointerDownCapture={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.select(id);
        }}
        onFocusCapture={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.select(id);
        }}
      >
        <div
          className="block-tools"
          role="toolbar"
          aria-label={`${label} actions`}
        >
          {ai && (
            <>
              <span className="block-ai-marker">AI-written · review</span>
              <BlockAction aria-label="Mark reviewed" onClick={onReviewed}>
                Mark reviewed
              </BlockAction>
            </>
          )}
          {tools}
          <span className="block-formatting-target" ref={setToolbar} />
        </div>
        <div className="block-content">{children}</div>
      </div>
    </ToolbarTarget.Provider>
  );
}
