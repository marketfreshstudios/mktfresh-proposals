"use client";
import type { CSSProperties, ReactNode } from "react";
export type SheetBox = { top: number; height: number };
/** Display only. Page numbers and boundaries are supplied by the live PagePlan. */
export function PageSheet({
  number,
  box,
  showLabel,
  children,
  fragments,
  onBackgroundClick,
}: {
  number: number;
  box: SheetBox;
  showLabel: boolean;
  children?: ReactNode;
  fragments?: unknown[];
  onBackgroundClick(): void;
}) {
  return (
    <>
      {showLabel && (
        <div
          className="editor-sheet-gap"
          data-editor-chrome
          data-page-label={number}
          style={{ top: box.top - 52 }}
          onPointerDown={onBackgroundClick}
        >
          <span>PAGE {number}</span>
        </div>
      )}
      <section
        className="editor-page-sheet page-sheet"
        data-editor-page={number}
        data-source-fragments={JSON.stringify(fragments ?? [])}
        aria-label={`Page ${number}`}
        style={{ top: box.top, height: box.height } as CSSProperties}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onBackgroundClick();
        }}
      >
        {children}
      </section>
    </>
  );
}
