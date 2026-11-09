"use client";
import { useEffect, useRef, useState } from "react";
import { ToolbarPopover } from "./toolbar-popover";
import { Button } from "./ui";
import { hexToHsv, hsvToHex, validHex } from "../lib/color-picker";
import { colorContrast, whiteContrast } from "../lib/brand";
import type { WorkspaceSettings } from "../lib/workspace";
export function ContrastNote({
  color,
  against,
}: {
  color: string;
  against?: string;
}) {
  const ratio = against ? colorContrast(against, color) : whiteContrast(color);
  return (
    <p
      className={`color-contrast ${ratio < 4.5 ? "warning" : "success"}`}
      role="status"
    >
      {against
        ? `${ratio >= 4.5 ? "✓ " : ""}${ratio.toFixed(1)}:1 with block text${ratio < 4.5 ? " · below 4.5:1. Text may be hard to read." : ""}`
        : ratio >= 4.5
          ? `✓ ${ratio.toFixed(1)}:1 on white`
          : `${ratio.toFixed(1)}:1 on white — fine for backgrounds and large text; small text in this color may be hard to read.`}
    </p>
  );
}
export function ColorPicker({
  label,
  value,
  onChange,
  settings,
  disabled = false,
  primary = false,
  variant = "compact",
  onRemove,
  onClose,
  initialOpen = false,
  contrastAgainst,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  settings?: WorkspaceSettings | null;
  disabled?: boolean;
  primary?: boolean;
  variant?: "compact" | "brand";
  onRemove?: () => void;
  onClose?: () => void;
  initialOpen?: boolean;
  contrastAgainst?: string;
}) {
  const [open, setOpen] = useState(false),
    [raw, setRaw] = useState(value),
    [hsv, setHsv] = useState(() => hexToHsv(value));
  const trigger = useRef<HTMLButtonElement>(null),
    hex = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen]);
  useEffect(() => {
    if (open) hex.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    setRaw(value);
    setHsv((old) =>
      hsvToHex(old).toLowerCase() === value.toLowerCase()
        ? old
        : hexToHsv(value),
    );
  }, [value]);
  const colors = [
    ...new Set(
      [settings?.accent_colour, ...(settings?.brand_palette ?? [])].filter(
        Boolean,
      ),
    ),
  ] as string[];
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  const choose = (next: typeof hsv) => {
    setHsv(next);
    const color = hsvToHex(next);
    setRaw(color);
    onChange(color);
  };
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    choose({
      ...hsv,
      s: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
      v: 1 - Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
    });
  };
  return (
    <div
      className={`color-choice color-choice-${variant} ${primary ? "primary" : ""}`}
    >
      <button
        ref={trigger}
        type="button"
        className="color-picker-trigger"
        aria-label={
          label.startsWith("Color ")
            ? `Edit ${label.toLowerCase()}`
            : `Edit ${label.toLowerCase()} color`
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else {
            setRaw(value);
            setOpen(true);
          }
        }}
      >
        <span className="color-trigger-swatch" style={{ background: value }} />
        {variant === "compact" && (
          <span>
            {label} · {value.toUpperCase()}
          </span>
        )}
      </button>
      {variant === "brand" && (
        <>
          <span className="color-choice-label">{label}</span>
          <code>{value.toUpperCase()}</code>
        </>
      )}
      {open && !disabled && (
        <ToolbarPopover
          className="color-picker-menu"
          trigger={trigger.current}
          placementAnchor={
            variant === "brand"
              ? (trigger.current?.closest<HTMLElement>(
                  ".workspace-color-row",
                ) ?? undefined)
              : undefined
          }
          preferredSide={variant === "brand" ? "right" : "below"}
          close={close}
        >
          <section role="dialog" aria-label={`${label} color picker`}>
            {!!colors.length && (
              <div className="picker-brand-colors">
                <strong>Brand colors</strong>
                <div>
                  {colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Use brand color ${color}`}
                      title={color}
                      aria-pressed={value.toLowerCase() === color.toLowerCase()}
                      style={{ background: color }}
                      onClick={() => onChange(color)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div
              className="color-saturation"
              tabIndex={0}
              role="slider"
              aria-label="Saturation and brightness"
              aria-description="Left and right adjust saturation; up and down adjust brightness. Hold Shift for ten-percent steps."
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hsv.s * 100)}
              aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
              style={{
                background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent),hsl(${hsv.h},100%,50%)`,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.focus();
                e.currentTarget.setPointerCapture(e.pointerId);
                point(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) point(e);
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.01;
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  choose({
                    ...hsv,
                    s: Math.max(
                      0,
                      Math.min(
                        1,
                        hsv.s +
                          (e.key === "ArrowLeft"
                            ? -step
                            : e.key === "ArrowRight"
                              ? step
                              : 0),
                      ),
                    ),
                    v: Math.max(
                      0,
                      Math.min(
                        1,
                        hsv.v +
                          (e.key === "ArrowDown"
                            ? -step
                            : e.key === "ArrowUp"
                              ? step
                              : 0),
                      ),
                    ),
                  });
                }
              }}
            >
              <span
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                }}
              />
            </div>
            <input
              className="color-hue"
              aria-label="Hue"
              type="range"
              min={0}
              max={360}
              step={1}
              value={hsv.h}
              onChange={(e) => choose({ ...hsv, h: Number(e.target.value) })}
            />
            <label className="field">
              Hex color
              <input
                ref={hex}
                aria-label="Hex color"
                maxLength={7}
                spellCheck={false}
                value={raw}
                aria-invalid={!validHex(raw)}
                onChange={(e) => {
                  const value = e.target.value;
                  setRaw(value);
                  if (validHex(value)) {
                    setHsv(hexToHsv(value));
                    onChange(value);
                  }
                }}
              />
            </label>
            {!validHex(raw) && (
              <p className="warning">
                Enter a six-digit hex color, such as #EA4E26.
              </p>
            )}
            <ContrastNote
              color={validHex(raw) ? raw : value}
              against={contrastAgainst}
            />
            <footer>
              {onRemove && (
                <Button
                  variant="ghost"
                  className="danger"
                  onClick={() => {
                    close();
                    onRemove();
                  }}
                >
                  Remove color
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  close();
                  trigger.current?.focus();
                }}
              >
                Done
              </Button>
            </footer>
          </section>
        </ToolbarPopover>
      )}
    </div>
  );
}
