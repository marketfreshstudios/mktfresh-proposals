"use client";
/** The workspace swatch and hex value edit the same saved color. */
export function BrandColorField({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  hexLabel = `${label} hex`,
}: {
  label: string;
  value: string;
  onChange: (value: string, immediate: boolean) => void;
  onBlur?: () => void;
  disabled?: boolean;
  hexLabel?: string;
}) {
  return (
    <div className="brand-color-field">
      <label className="brand-color-swatch">
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value, true)}
        />
      </label>
      <label className="field brand-color-hex">
        <span>{label}</span>
        <input
          aria-label={hexLabel}
          value={value}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value, false)}
          onBlur={onBlur}
        />
      </label>
    </div>
  );
}
