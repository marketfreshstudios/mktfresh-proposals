"use client";
import type { ReactNode } from "react";
import { ToolbarPopover } from "../toolbar-popover";
import { BandSheet } from "./band-sheet";
export function BandPopover({
  phone,
  mode,
  kind,
  page,
  subtitle,
  trigger,
  close,
  onEscape,
  children,
}: {
  phone: boolean;
  mode: string;
  kind: string;
  page: number;
  subtitle: string;
  trigger: HTMLElement | null;
  close: () => void;
  onEscape?: () => void;
  children: ReactNode;
}) {
  if (phone && (mode === "more" || mode === "confirm"))
    return (
      <BandSheet
        title={`${kind === "header" ? "Header" : "Footer"} on page ${page}`}
        subtitle={subtitle}
        showCancel={mode !== "confirm"}
        trigger={trigger}
        close={close}
        onEscape={onEscape}
      >
        {children}
      </BandSheet>
    );
  return (
    <ToolbarPopover
      className={`band-popover band-popover-${mode}`}
      trigger={trigger}
      close={close}
      onEscape={onEscape}
      visualViewport={phone}
    >
      {children}
    </ToolbarPopover>
  );
}
