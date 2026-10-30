"use client";
import { useState } from "react";
export function ValidityField({
  value,
  defaultValue,
  onChange,
  name = "valid_until",
}: {
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  name?: string;
}) {
  const [local, setLocal] = useState(defaultValue ?? "");
  const current = value === undefined ? local : (value ?? "");
  function update(date: string) {
    const result = date ? date + "T23:59:59.999Z" : null;
    setLocal(result ?? "");
    onChange?.(result);
  }
  return (
    <div className="validity-control">
      <input
        aria-label="Valid until"
        name={name}
        type="date"
        value={current.slice(0, 10)}
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
