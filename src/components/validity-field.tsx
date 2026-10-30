"use client";
import { calendarDate, endOfDay } from "../lib/validity";
import { useState } from "react";
export function ValidityField({
  value,
  defaultValue,
  onChange,
  name = "valid_until",
  timezone = "UTC",
}: {
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  name?: string;
  timezone?: string;
}) {
  const [local, setLocal] = useState(defaultValue ?? "");
  const current = value === undefined ? local : (value ?? "");
  function update(date: string) {
    const result = date ? endOfDay(date, timezone) : null;
    setLocal(result ?? "");
    onChange?.(result);
  }
  return (
    <div className="validity-control">
      <input type="hidden" name={name} value={current} />
      <input
        aria-label="Valid until"
        type="date"
        value={current ? calendarDate(current, timezone) : ""}
        onChange={(e) => update(e.target.value)}
      />
      <button
        type="button"
        className="btn ghost"
        aria-label="Clear valid until; never expires"
        disabled={!current}
        onClick={() => update("")}
      >
        ×
      </button>
      <small>
        {current
          ? "The link expires on this date."
          : "Never expires. You can close it by marking it lost or archiving it."}
      </small>
    </div>
  );
}
