"use client";
import { useEffect, useState, useId, useRef } from "react";
import { useEditorHistory } from "../editor-history";
/** One page-bounded spacing control, shared by cover, bands and typography. */
export function SpacingInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  ariaLabel = label,
  inputStep = "any",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max: number;
  step?: number;
  ariaLabel?: string;
  inputStep?: number | "any";
}) {
  const id = useId(),
    history = useEditorHistory(),
    [raw, setRaw] = useState(String(value)),
    [clamped, setClamped] = useState(false);
  const dragging = useRef(false),
    engine = history?.controller?.engine;
  const limit = Math.max(min, Math.floor(max));
  useEffect(() => setRaw(String(value)), [value]);
  useEffect(() => () => engine?.endGroup(id), [engine, id]);
  const change = (n: number) => {
    const v = Math.max(min, Math.min(limit, n));
    setRaw(String(v));
    setClamped(n > limit);
    onChange(v);
  };
  const finish = () => {
    dragging.current = false;
    engine?.endGroup(id);
  };
  return (
    <div className="field spacing-field">
      <label htmlFor={id}>{label}</label>
      <div className="spacing-slider-row">
        <input
          type="range"
          aria-label={`${ariaLabel} slider`}
          min={min}
          max={limit}
          step={1}
          value={Math.min(value, limit)}
          onPointerDown={() => {
            dragging.current = true;
            engine?.beginGroup(id);
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onBlur={finish}
          onKeyDown={(e) => {
            if (
              ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              change(
                value +
                  (["ArrowLeft", "ArrowDown"].includes(e.key) ? -1 : 1) *
                    (e.shiftKey ? 10 : 1),
              );
            }
          }}
          onChange={(e) => change(Number(e.target.value))}
        />
        <span className="spacing-number">
          <input
            type="number"
            id={id}
            aria-label={ariaLabel}
            min={min}
            max={limit}
            step={inputStep}
            value={raw}
            aria-describedby={clamped ? `${id}-limit` : undefined}
            onChange={(e) => {
              setRaw(e.target.value);
              if (
                e.target.value !== "" &&
                Number.isFinite(Number(e.target.value))
              )
                change(Number(e.target.value));
            }}
            onBlur={() => setRaw(String(value))}
          />
          <span aria-hidden="true">px</span>
        </span>
      </div>
      {clamped && (
        <small id={`${id}-limit`} role="status">
          Max {limit} px on this page
        </small>
      )}
    </div>
  );
}
