"use client";
import { useId, type ReactNode } from "react";

export function TableRowAction({
  label,
  children,
}: {
  label: string;
  children: (hintId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <span className="table-row-action">
      {children(id)}
      <span id={id} className="table-row-tooltip" role="tooltip">
        {label}
      </span>
    </span>
  );
}
