"use client";
import { useEffect, useState, useId } from "react";
export function SpacingInput({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
  step = 4,
  ariaLabel = label,
  inputStep = step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  inputStep?: number | "any";
}) {
  const id = useId();
  const [raw, setRaw] = useState(String(value));
  const invalid =
    raw === "" ||
    !Number.isFinite(Number(raw)) ||
    Number(raw) < min ||
    Number(raw) > max;
  useEffect(() => setRaw(String(value)), [value]);
  const change = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    setRaw(String(v));
    onChange(v);
  };
  return (
    <div className="field spacing-field">
      <label htmlFor={id}>{label}</label>
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
          id={id}
          aria-label={ariaLabel}
          min={min}
          max={max}
          step={inputStep}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
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
      {invalid && (
        <small id={`${id}-error`} role="alert">
          Enter a value from {min} to {max}.
        </small>
      )}
    </div>
  );
}
