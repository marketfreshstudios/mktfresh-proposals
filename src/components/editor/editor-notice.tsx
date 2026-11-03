"use client";
import type { ReactNode } from "react";
export function EditorNotice({
  kind,
  children,
}: {
  kind: "recovered" | "stale";
  children: ReactNode;
}) {
  return (
    <div
      className={`editor-notice editor-notice-${kind}`}
      role={kind === "stale" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
