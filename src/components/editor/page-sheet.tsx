"use client";
import type { CSSProperties, ReactNode } from "react";
export type SheetBox = { top: number; height: number; gap?: number };
/** Display only. Page numbers and boundaries are supplied by the live PagePlan. */
export function PageSheet({
  number,
  geometry,
  box,
  showLabel,
  children,
  fragments,
  onBackgroundClick,
}: {
  number: number;
  geometry?: ReturnType<typeof import("../../lib/page-bands").pageGeometry>;
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
          style={{ top: box.top - (box.gap ?? 52), height: box.gap ?? 52 }}
          onPointerDown={onBackgroundClick}
        >
          <span>PAGE {number}</span>
        </div>
      )}
      <section
        className="editor-page-sheet page-sheet"
        data-editor-page={number}
        data-content-height={geometry?.content.height}
        data-page-geometry={geometry ? JSON.stringify(geometry) : undefined}
        data-source-fragments={JSON.stringify(fragments ?? [])}
        aria-label={`Page ${number}`}
        style={
          {
            top: box.top,
            height: box.height,
            ...(geometry
              ? {
                  paddingTop: geometry.content.y,
                  paddingBottom: geometry.margins.bottom + geometry.after,
                }
              : {}),
          } as CSSProperties
        }
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onBackgroundClick();
        }}
      >
        {children}
      </section>
    </>
  );
}
