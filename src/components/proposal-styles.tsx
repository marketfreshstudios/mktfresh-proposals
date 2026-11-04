"use client";
import { Disclosure } from "./ui";
import { sharedPagesLabel } from "../lib/page-count";
import { ToolbarPopover } from "./toolbar-popover";
import { UseSharedConfirm } from "./editor/band-menu";
import type { ResolvedBandPage } from "../lib/band-overrides";
import { ToastSurface } from "./block-controls";
import { useEditorHistory } from "./editor-history";
import { useBandEditing } from "./editor/band-editing";
import type { HeaderFooterSettings } from "../lib/page-bands";
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
  headerFooter,
  onHeaderFooter,
  onResetBands,
  bandsResetLabel = "Reset to template",
  pageCount = 1,
  bandPages,
}: {
  onResetBands?: () => void | Promise<void>;
  bandsResetLabel?: string;
  headerFooter?: HeaderFooterSettings;
  onHeaderFooter?: (value: HeaderFooterSettings) => void;
  pageCount?: number;
  bandPages?: ResolvedBandPage[];
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
      <p className="muted style-scope-note">
        Changes apply to this proposal only. Workspace defaults live in Studio →
        Workspace.
      </p>
      <details className="style-accordion" open={!headerFooter}>
        <Disclosure>Text styles</Disclosure>
        <div className="style-accordion-body">
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
          <div className="style-font-grid">
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
          </div>
          <fieldset className="style-colors">
            <legend>Color</legend>
            <div role="group" aria-label="Color choices">
              {(["ink", "accent", "custom"] as const).map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-pressed={
                    colour === "custom"
                      ? selected.colour.startsWith("#")
                      : selected.colour === colour
                  }
                  onClick={() =>
                    patch({
                      colour:
                        colour === "custom"
                          ? selected.colour.startsWith("#")
                            ? selected.colour
                            : "#25241f"
                          : colour,
                    })
                  }
                >
                  <span
                    className="style-swatch"
                    style={{
                      background: styleColour(
                        colour === "custom"
                          ? selected.colour.startsWith("#")
                            ? selected.colour
                            : "#25241f"
                          : colour,
                        settings?.accent_colour,
                      ),
                    }}
                  />
                  {colour === "ink"
                    ? "Ink"
                    : colour === "accent"
                      ? "Accent"
                      : "Custom"}
                </button>
              ))}
            </div>
          </fieldset>
          {selected.colour.startsWith("#") && (
            <label className="field">
              Custom color
              <input
                type="color"
                value={selected.colour}
                onChange={(e) => patch({ colour: e.target.value })}
              />
            </label>
          )}
          <p
            className={`style-contrast ${contrast < 4.5 ? "warning" : "success"}`}
            role={contrast < 4.5 ? "alert" : undefined}
          >
            {contrast.toFixed(2)}:1 against white paper
            {contrast < 4.5
              ? " — choose at least 4.5:1 to save"
              : " · Passes contrast"}
          </p>
          <div className="style-spacing-grid">
            {field("Weight", "weight", 100, 900)}
            {field("Space above (px)", "space_above", 0, 160)}
            {field("Space below (px)", "space_below", 0, 160)}
          </div>
          <details className="style-typography-details">
            <Disclosure>Typography details</Disclosure>
            <label className="field">
              Letter case
              <select
                value={selected.letter_case}
                onChange={(e) =>
                  patch({
                    letter_case: e.target.value as TextStyle["letter_case"],
                  })
                }
              >
                <option value="normal">Normal</option>
                <option value="uppercase">Uppercase</option>
              </select>
            </label>
            {field("Letter spacing (em)", "letter_spacing", -0.1, 0.5, 0.005)}
          </details>
          <hr />
          <div className="style-preview-heading">
            <strong>Sample</strong>
            <Button
              type="button"
              className="style-reset"
              onClick={() => {
                if (confirm(`${resetLabel}?`))
                  (onReset ?? (() => onChange({})))();
              }}
            >
              {resetLabel}
            </Button>
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
            <div
              id={id}
              className="proposal-typography style-sample"
              data-level={level}
            >
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
              <p className="style-body">
                Clear goals and thoughtful work, shaped around your business.
              </p>
              <h3>Built around you</h3>
              <p className="style-body">
                Each detail supports the outcome we agree on together.
              </p>
              <h4>The next step</h4>
              <p className="style-body">
                Review your proposal and let us know what you think.
              </p>
            </div>
          </div>
        </div>
      </details>
      <details className="style-accordion" open={!headerFooter}>
        <Disclosure>Page &amp; margins</Disclosure>
        <div className="style-accordion-body">
          <fieldset className="style-density">
            <legend>Density</legend>
            <div role="group" aria-label="Density choices">
              {(["standard", "comfortable"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  aria-pressed={styles.layout!.density === density}
                  onClick={() => onChange({ ...value, density })}
                >
                  {density === "standard" ? "Standard" : "Comfortable"}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="style-fields style-margin-grid">
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
                  onChange({
                    ...value,
                    margins: { ...value?.margins, [side]: n },
                  })
                }
              />
            ))}
          </fieldset>
        </div>
      </details>
      {headerFooter && onHeaderFooter && (
        <details className="style-accordion" open>
          <Disclosure>Header &amp; footer</Disclosure>
          <BandSettings
            value={headerFooter}
            onChange={onHeaderFooter}
            pageCount={pageCount}
            pages={bandPages}
            onReset={onResetBands}
            resetLabel={bandsResetLabel}
          />
        </details>
      )}
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

function BandSettings({
  value,
  onChange,
  pageCount,
  onReset,
  resetLabel,
  pages,
}: {
  onReset?: () => void | Promise<void>;
  resetLabel: string;
  pages?: ResolvedBandPage[];
  value: HeaderFooterSettings;
  onChange: (v: HeaderFooterSettings) => void;
  pageCount: number;
}) {
  const id = useId();
  const [confirm, setConfirm] = useState<HTMLElement | null>(null);
  const editing = useBandEditing();
  const history = useEditorHistory();
  const [resetBusy, setResetBusy] = useState(false),
    [resetError, setResetError] = useState(""),
    [resetUndo, setResetUndo] = useState<number | null>(null);
  useEffect(() => {
    if (resetUndo === null) return;
    const timer = setTimeout(() => setResetUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [resetUndo]);
  const toggle = (
    key: "showHeader" | "showFooter" | "showOnCover" | "divider",
    label: string,
    subtitle?: string,
  ) => (
    <label className="band-setting">
      <span>
        <strong>{label}</strong>
        {subtitle && <small id={`${id}-${key}`}>{subtitle}</small>}
      </span>
      <span className="band-switch-hit">
        <input
          className="band-switch-input"
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={subtitle ? `${id}-${key}` : undefined}
          checked={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
        />
      </span>
    </label>
  );
  const own = (pages ?? []).flatMap((p) =>
    (["header", "footer"] as const)
      .filter((kind) => p[kind].source !== "shared")
      .map((kind) => ({ page: p.page, kind, source: p[kind].source })),
  );
  const shared = (kind: "header" | "footer") =>
    value[kind === "header" ? "showHeader" : "showFooter"]
      ? Math.max(
          0,
          pageCount -
            (value.showOnCover ? 0 : 1) -
            own.filter(
              (p) => p.kind === kind && (p.page !== 1 || value.showOnCover),
            ).length,
        )
      : 0;
  const subtitle = (kind: "header" | "footer") => {
    const excluded = own.filter(
      (p) => p.kind === kind && (p.page !== 1 || value.showOnCover),
    );
    return `${sharedPagesLabel(shared(kind))}${(["unique", "hidden"] as const)
      .map((source) => {
        const count = excluded.filter((p) => p.source === source).length;
        return count ? ` · ${count} ${source}` : "";
      })
      .join("")}`;
  };
  return (
    <div className="band-settings">
      {toggle("showHeader", "Header", subtitle("header"))}
      {toggle("showFooter", "Footer", subtitle("footer"))}
      {toggle(
        "showOnCover",
        "Show on cover",
        !value.showOnCover
          ? "Off, because the cover has its own logo and title"
          : undefined,
      )}
      <fieldset className="band-height">
        <legend>Distance from edge</legend>
        <div role="group" aria-label="Distance from edge">
          {([0.25, 0.3, 0.4] as const).map((height) => (
            <button
              key={height}
              type="button"
              aria-pressed={value.distanceIn === height}
              onClick={() =>
                onChange({
                  ...value,
                  bandHeightIn: undefined,
                  distanceIn: height,
                })
              }
            >
              {height} in
            </button>
          ))}
        </div>
        <p>
          Headers and footers sit in the page margins. Page content keeps its
          space. Headers, footers and images are sized to fit their margins.
        </p>
      </fieldset>
      {toggle("divider", "Divider line")}
      <div className="band-style-actions">
        <button
          type="button"
          disabled={!shared("header")}
          onClick={() => editing?.edit("header")}
        >
          Edit shared header
        </button>
        <button
          type="button"
          disabled={!shared("footer")}
          onClick={() => editing?.edit("footer")}
        >
          Edit shared footer
        </button>
      </div>
      {own.length > 0 && (
        <section className="band-own-pages" aria-label="Pages with their own">
          <h4>Pages with their own</h4>
          {own.map((p) => (
            <div key={`${p.page}-${p.kind}`}>
              <span>
                Page {p.page} · {p.kind}
                {p.source === "hidden" ? " hidden" : ""}
              </span>
              <button
                type="button"
                onClick={() => editing?.goTo(p.kind, p.page)}
              >
                Go to
                <span className="sr-only">
                  {" "}
                  page {p.page} {p.kind}
                </span>
              </button>
            </div>
          ))}
          <button type="button" onClick={(e) => setConfirm(e.currentTarget)}>
            Use shared on every page
          </button>
        </section>
      )}
      {confirm && (
        <ToolbarPopover
          className="band-popover band-popover-confirm"
          trigger={confirm}
          close={() => setConfirm(null)}
        >
          <UseSharedConfirm
            all
            kind="header"
            page={0}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              onChange({ ...value, overrides: {} });
              setConfirm(null);
              editing?.announce(
                "Every page now uses the shared header and footer",
              );
            }}
          />
        </ToolbarPopover>
      )}
      {onReset && (
        <div className="band-reset">
          <button
            type="button"
            disabled={resetBusy}
            onClick={async () => {
              setResetBusy(true);
              setResetError("");
              try {
                const before = history?.controller?.engine.past.at(-1)?.id;
                await onReset();
                const after = history?.controller?.engine.past.at(-1)?.id;
                setResetUndo(after !== before ? (after ?? null) : null);
              } catch (e) {
                setResetError(
                  e instanceof Error
                    ? e.message
                    : "Could not reset shared bands. Try again.",
                );
              } finally {
                setResetBusy(false);
              }
            }}
          >
            {resetBusy ? "Resetting…" : resetLabel}
          </button>
          <p>
            {resetLabel === "Reset to default"
              ? "Restores the built-in header and footer."
              : "Restores the template's shared header and footer. Pages with their own keep them."}
          </p>
          {resetError && <p role="alert">{resetError}</p>}
        </div>
      )}
      {resetUndo !== null && (
        <ToastSurface>
          Shared header and footer reset ·{" "}
          <button
            onClick={() => {
              history?.controller?.undo(undefined, resetUndo);
              setResetUndo(null);
            }}
          >
            Undo
          </button>
        </ToastSurface>
      )}
    </div>
  );
}
