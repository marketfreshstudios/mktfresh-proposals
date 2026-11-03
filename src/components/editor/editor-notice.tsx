"use client";
import type { ReactNode } from "react";
export function EditorNotice({
  kind,
  children,
}: {
  kind: "recovered" | "stale" | "error";
  children: ReactNode;
}) {
  return (
    <div
      className={`editor-notice editor-notice-${kind}`}
      role={kind === "recovered" ? "status" : "alert"}
    >
      {children}
    </div>
  );
}
