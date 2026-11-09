"use client";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { TableRowAction } from "./table-row-action";

export function StaffTable({
  className,
  inline = false,
  density = "standard",
  ...props
}: ComponentProps<"div"> & {
  inline?: boolean;
  density?: "standard" | "compact";
}) {
  return (
    <div
      {...props}
      data-density={density}
      className={`staff-table ${inline ? "staff-table-inline" : "staff-surface"}${className ? ` ${className}` : ""}`}
    />
  );
}

export function StaffNativeTable({
  className,
  ...props
}: ComponentProps<"table">) {
  return (
    <table
      {...props}
      className={`staff-native-table${className ? ` ${className}` : ""}`}
    />
  );
}

export function StaffTableHead({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`staff-table-head${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

export function StaffTableEmpty({ children }: { children: ReactNode }) {
  return <p className="empty-copy">{children}</p>;
}

/** A single keyboard stop opens the record from either the icon or the row. */
export function StaffTableOpen({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <TableRowAction label={label}>
      {(hint) => (
        <a
          className="btn ghost icon-only table-icon-action staff-table-open"
          href={href}
          aria-label={label}
          aria-describedby={hint}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </a>
      )}
    </TableRowAction>
  );
}
