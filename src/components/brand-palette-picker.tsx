"use client";
import type { WorkspaceSettings } from "../lib/workspace";
export function BrandPalettePicker({
  settings,
  value,
  onChange,
  disabled = false,
}: {
  settings?: WorkspaceSettings | null;
  value?: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const colors = [
    ...new Set(
      [settings?.accent_colour, ...(settings?.brand_palette ?? [])].filter(
        Boolean,
      ),
    ),
  ] as string[];
  return (
    <div className="brand-palette-swatches" aria-label="Brand palette">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="brand-palette-swatch"
          style={{ background: color }}
          title={color}
          aria-label={`Use brand color ${color}`}
          aria-pressed={value?.toLowerCase() === color.toLowerCase()}
          disabled={disabled}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
