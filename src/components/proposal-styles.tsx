"use client";
import { useEffect, useId, useState } from "react";
import {
  curatedFonts,
  curatedFontFaces,
  type FontChoice,
  type ProposalFont,
} from "../lib/proposal-fonts";
import {
  styleLevels,
  styleLabels,
  resolveStyles,
  documentStyleCss,
  styleFontFaces,
  styleColour,
  type StyleLevel,
  type StyleOverrides,
  type TextStyle,
} from "../lib/proposal-styles";
import type { WorkspaceSettings } from "../lib/workspace";
import { whiteContrast } from "../lib/brand";
import { api, Button } from "./ui";
/** The same controls/resolver power workspace defaults, template and proposal overrides. */
export function ProposalStyles({
  settings,
  inherited,
  value,
  onChange,
  resetLabel = "Reset to defaults",
  onReset,
  availableFonts = [],
}: {
  settings?: WorkspaceSettings | null;
  inherited?: StyleOverrides;
  value?: StyleOverrides;
  onChange: (value: StyleOverrides) => void;
  resetLabel?: string;
  onReset?: () => void;
  availableFonts?: ProposalFont[];
}) {
  const [level, setLevel] = useState<StyleLevel>("title"),
    [phone, setPhone] = useState(false),
    [fonts, setFonts] = useState<ProposalFont[]>([]);
  const id = useId();
  useEffect(() => {
    api<ProposalFont[]>("/api/workspace-fonts")
      .then(setFonts)
      .catch(() => {});
  }, []);
  const styles = resolveStyles(settings, inherited, value),
    selected = styles[level];
  const uploads = [
    ...new Map(
      [
        ...fonts,
        ...availableFonts,
        ...styleLevels
          .map((l) => styles[l].font)
          .filter((f): f is ProposalFont => typeof f !== "string"),
      ].map((f) => [f.id, f]),
    ).values(),
  ];
  const patch = (next: Partial<TextStyle>) =>
    onChange({ ...value, [level]: { ...value?.[level], ...next } });
  const field = (
    name: string,
    key: "size" | "weight" | "letter_spacing" | "space_above" | "space_below",
    min: number,
    max: number,
    step = 1,
  ) => (
    <StyleNumber
      key={`${level}:${key}`}
      name={name}
      ariaLabel={`${styleLabels[level]} ${name.toLowerCase()}`}
      value={selected[key]}
      min={min}
      max={max}
      step={step}
      onChange={(number) => patch({ [key]: number })}
    />
  );
  const contrast = whiteContrast(
    styleColour(selected.colour, settings?.accent_colour),
  );
  return (
    <section className="proposal-styles stack" aria-label="Proposal styles">
      <label className="field">
        Density
        <select
          value={styles.layout!.density}
          onChange={(e) =>
            onChange({
              ...value,
              density: e.target.value as "standard" | "comfortable",
            })
          }
        >
          <option value="standard">Standard</option>
          <option value="comfortable">Comfortable</option>
        </select>
      </label>
      <fieldset className="style-fields">
        <legend>Page margins (inches)</legend>
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <StyleNumber
            key={side}
            name={side[0].toUpperCase() + side.slice(1)}
            ariaLabel={`Page margin ${side}`}
            value={styles.layout!.margins[side]}
            min={0.25}
            max={2}
            step={0.05}
            onChange={(n) =>
              onChange({ ...value, margins: { ...value?.margins, [side]: n } })
            }
          />
        ))}
      </fieldset>
      <label className="field">
        Text level
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as StyleLevel)}
        >
          {styleLevels.map((l) => (
            <option key={l} value={l}>
              {styleLabels[l]}
            </option>
          ))}
        </select>
      </label>
      <div className="style-fields">
        <label className="field">
          Font
          <select
            aria-label={`${styleLabels[level]} font`}
            value={
              typeof selected.font === "string"
                ? selected.font
                : selected.font.id
            }
            onChange={(e) =>
              patch({
                font:
                  uploads.find((f) => f.id === e.target.value) ??
                  (e.target.value as FontChoice),
              })
            }
          >
            {["Serif", "Sans", "Monospace"].map((category) => (
              <optgroup key={category} label={category}>
                {curatedFonts
                  .filter((f) => f.category === category)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            {!!uploads.length && (
              <optgroup label="Uploaded">
                {uploads.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {field("Size (px)", "size", 8, 96)}
        {field("Weight", "weight", 100, 900)}
        <label className="field">
          Colour
          <select
            value={selected.colour.startsWith("#") ? "custom" : selected.colour}
            onChange={(e) =>
              patch({
                colour:
                  e.target.value === "custom"
                    ? "#25241f"
                    : (e.target.value as "ink" | "accent"),
              })
            }
          >
            <option value="ink">Ink</option>
            <option value="accent">Accent</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {selected.colour.startsWith("#") && (
          <label className="field">
            Custom colour
            <input
              type="color"
              value={selected.colour}
              onChange={(e) => patch({ colour: e.target.value })}
            />
          </label>
        )}
        <p
          className={contrast < 4.5 ? "warning" : "muted"}
          role={contrast < 4.5 ? "alert" : undefined}
        >
          {contrast.toFixed(2)}:1 against white paper
          {contrast < 4.5
            ? " — choose at least 4.5:1 to save"
            : " · Passes contrast"}
        </p>
        <label className="field">
          Letter case
          <select
            value={selected.letter_case}
            onChange={(e) =>
              patch({ letter_case: e.target.value as TextStyle["letter_case"] })
            }
          >
            <option value="normal">Normal</option>
            <option value="uppercase">Uppercase</option>
          </select>
        </label>
        {field("Letter spacing (em)", "letter_spacing", -0.1, 0.5, 0.005)}
        {field("Space above (px)", "space_above", 0, 160)}
        {field("Space below (px)", "space_below", 0, 160)}
      </div>
      <Button
        type="button"
        onClick={() => {
          if (confirm(`${resetLabel}?`)) (onReset ?? (() => onChange({})))();
        }}
      >
        {resetLabel}
      </Button>
      <div className="style-preview-heading">
        <strong>Sample page</strong>
        <div role="group" aria-label="Sample page width">
          <button
            type="button"
            aria-pressed={!phone}
            onClick={() => setPhone(false)}
          >
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={phone}
            onClick={() => setPhone(true)}
          >
            Phone
          </button>
        </div>
      </div>
      <div
        className="style-preview-viewport"
        data-width={phone ? "phone" : "desktop"}
      >
        <div id={id} className="proposal-typography style-sample">
          <style>
            {curatedFontFaces(curatedFonts)}
            {styleFontFaces(styles)}
            {documentStyleCss(styles, settings?.accent_colour).replaceAll(
              ".proposal-typography.proposal-typography",
              `[id="${id}"]`,
            )}
          </style>
          <h1>A proposal for your next chapter</h1>
          <h2>Our approach</h2>
          <div className="style-body">
            <p>Clear goals and thoughtful work, shaped around your business.</p>
          </div>
          <h3>Built around you</h3>
          <div className="style-body">
            <p>Each detail supports the outcome we agree on together.</p>
          </div>
          <h4>The next step</h4>
          <div className="style-body">
            <p>Review your proposal and let us know what you think.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Keep incomplete numeric typing local; only valid values enter saved styles. */
function StyleNumber({
  name,
  ariaLabel,
  value,
  min,
  max,
  step,
  onChange,
}: {
  name: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [raw, setRaw] = useState(String(value)),
    [invalid, setInvalid] = useState(false);
  const id = useId();
  useEffect(() => {
    setRaw(String(value));
    setInvalid(false);
  }, [value]);
  return (
    <label className="field">
      {name}
      <input
        type="number"
        aria-label={ariaLabel}
        value={raw}
        min={min}
        max={max}
        step={step}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? id : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          const valid = next !== "" && e.target.validity.valid;
          setInvalid(!valid);
          if (valid) onChange(Number(next));
        }}
      />
      {invalid && (
        <small id={id} role="alert">
          Enter a value from {min} to {max}.
        </small>
      )}
    </label>
  );
}
