"use client";
import { useEffect, useState } from "react";
export function SpacingInput({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
  step = 4,
  ariaLabel = label,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const change = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    setRaw(String(v));
    onChange(v);
  };
  return (
    <label className="field spacing-field">
      <span>{label}</span>
      <span className="spacing-stepper">
        <button
          type="button"
          aria-label={`Decrease ${ariaLabel}`}
          disabled={value <= min}
          onClick={() => change(value - step)}
        >
          −
        </button>
        <input
          type="number"
          aria-label={ariaLabel}
          min={min}
          max={max}
          step={step}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            const n = Number(e.target.value);
            if (
              e.target.value !== "" &&
              Number.isFinite(n) &&
              n >= min &&
              n <= max
            )
              onChange(n);
          }}
          onBlur={() => setRaw(String(value))}
        />
        <button
          type="button"
          aria-label={`Increase ${ariaLabel}`}
          disabled={value >= max}
          onClick={() => change(value + step)}
        >
          +
        </button>
      </span>
    </label>
  );
}
