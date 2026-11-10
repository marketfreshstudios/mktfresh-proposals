"use client";
import { PanelHeading } from "./editor/panel-heading";
import { Select, Switch } from "./form-controls";
import { CoverSettings } from "./cover-settings";
import { ColorPicker } from "./color-picker";
import type { Cover } from "../lib/cover";
import { confirmDialog } from "./dialog-actions";
import { SpacingInput } from "./editor/spacing-input";
import {
  boundedBandSettings,
  bandOnCover,
  bandDivider,
  bandSpacing,
  bandSpacingLimit,
  pageGeometry,
} from "../lib/page-bands";
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
  textLineHeight,
  marginPresets,
  styleLevels,
  styleLabels,
  resolveStyles,
  documentStyleCss,
  styleFontFaces,
  styleColour,
  legacyQuoteNeutrals,
  harborQuoteNeutrals,
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
  onChange: saveStyles,
  resetLabel = "Reset to defaults",
  onReset,
  availableFonts = [],
  headerFooter,
  onHeaderFooter,
  onResetBands,
  bandsResetLabel = "Reset to template",
  pageCount = 1,
  bandPages,
  scope,
  hidePageMargins = false,
  cover,
  onCover,
}: {
  cover?: Cover;
  onCover?: (cover: Cover) => void;
  scope?: "workspace" | "template";
  hidePageMargins?: boolean;
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
  function onChange(next: StyleOverrides) {
    saveStyles(
      !next.quote_neutrals && styles.layout?.quote_neutrals
        ? { ...next, quote_neutrals: {} }
        : next,
    );
  }
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
    <section
      className="proposal-styles stack"
      aria-label={
        scope === "workspace" ? "Text and page styles" : "Proposal styles"
      }
    >
      {onCover && (
        <CoverSettings value={cover} onChange={onCover} settings={settings} />
      )}
      <p className="muted style-scope-note">
        {scope === "workspace"
          ? "Defaults for new proposals. Sent and signed documents keep their saved styles."
          : scope === "template"
            ? "Changes apply to new proposals made from this template."
            : "Changes apply to this proposal only. Workspace defaults live in Studio → Workspace."}
      </p>
      <details className="style-accordion">
        <Disclosure>Quote colors</Disclosure>
        <div className="style-accordion-body">
          <p className="muted">
            These colors appear in the editor, client page, and PDF.
          </p>
          {(
            [
              ["group_fill", "Choice group background"],
              ["group_border", "Choice group border"],
              ["dividers", "Quote dividers"],
              ["shaded_fill", "Quote header and totals background"],
            ] as const
          ).map(([key, label]) => {
            const palette =
              styles.layout?.quote_neutrals ?? legacyQuoteNeutrals;
            return (
              <ColorPicker
                key={key}
                label={label}
                value={palette[key]}
                settings={settings}
                onChange={(color) =>
                  onChange({
                    ...value,
                    quote_neutrals: styles.layout?.quote_neutrals
                      ? { ...value?.quote_neutrals, [key]: color }
                      : { ...palette, [key]: color },
                  })
                }
              />
            );
          })}
          <Button
            onClick={() =>
              onChange({ ...value, quote_neutrals: harborQuoteNeutrals })
            }
          >
            Use Harbor defaults
          </Button>
        </div>
      </details>
      <details className="style-accordion" open={!headerFooter}>
        <Disclosure>Text styles</Disclosure>
        <div className="style-accordion-body">
          <label className="field">
            Text level
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value as StyleLevel)}
            >
              {styleLevels.map((l) => (
                <option key={l} value={l}>
                  {styleLabels[l]}
                </option>
              ))}
            </Select>
          </label>
          <div className="style-font-grid">
            <label className="field">
              Font
              <Select
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
              </Select>
            </label>
            {field(
              "Size (px)",
              "size",
              level === "body" ? 14 : 8,
              level === "body" ? 18 : 96,
            )}
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
            <div className="field">
              <span>Custom color</span>
              <ColorPicker
                label="Custom"
                value={selected.colour}
                settings={settings}
                onChange={(colour) => patch({ colour })}
              />
            </div>
          )}
          <p
            className={`style-contrast ${contrast < 4.5 ? "warning" : "success"}`}
            role={contrast < 4.5 ? "alert" : undefined}
          >
            {contrast.toFixed(2)}:1 against white paper
            {contrast < 4.5
              ? " — small text uses a darker readable shade"
              : " · Passes contrast"}
          </p>
          <div className="style-spacing-grid">
            {field("Weight", "weight", 100, 900)}
            <SpacingInput
              label="Space above (px)"
              ariaLabel={`${styleLabels[level]} space above (px)`}
              value={selected.space_above}
              max={Math.max(
                0,
                pageGeometry(styles, headerFooter, 1).content.height -
                  selected.size * textLineHeight(styles, level) -
                  selected.space_below,
              )}
              inputStep="any"
              onChange={(space_above) => patch({ space_above })}
            />
            <SpacingInput
              label="Space below (px)"
              ariaLabel={`${styleLabels[level]} space below (px)`}
              value={selected.space_below}
              max={Math.max(
                0,
                pageGeometry(styles, headerFooter, 1).content.height -
                  selected.size * textLineHeight(styles, level) -
                  selected.space_above,
              )}
              inputStep="any"
              onChange={(space_below) => patch({ space_below })}
            />
          </div>
          <details className="style-typography-details">
            <Disclosure>Typography details</Disclosure>
            <label className="field">
              Letter case
              <Select
                value={selected.letter_case}
                onChange={(e) =>
                  patch({
                    letter_case: e.target.value as TextStyle["letter_case"],
                  })
                }
              >
                <option value="normal">Normal</option>
                <option value="uppercase">Uppercase</option>
              </Select>
            </label>
            {field("Letter spacing (em)", "letter_spacing", -0.1, 0.5, 0.005)}
          </details>
          <hr />
          <div className="style-preview-heading">
            <strong>Sample</strong>
            <Button
              type="button"
              className="style-reset"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: `${resetLabel}?`,
                    confirmLabel: resetLabel,
                  })
                )
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
                {documentStyleCss(
                  styles,
                  settings?.accent_colour,
                  undefined,
                  "type-sample",
                ).replaceAll(
                  ".proposal-typography.proposal-typography",
                  `[id="${id}"]`,
                )}
              </style>
              <div data-sample-heading="1">
                A proposal for your next chapter
              </div>
              <div data-sample-heading="2">Our approach</div>
              <p className="style-body">
                Clear goals and thoughtful work, shaped around your business.
              </p>
              <div data-sample-heading="3">Built around you</div>
              <p className="style-body">
                Each detail supports the outcome we agree on together.
              </p>
              <div data-sample-heading="4">The next step</div>
              <p className="style-body">
                Review your proposal and let us know what you think.
              </p>
            </div>
          </div>
        </div>
      </details>
      <details className="style-accordion" open={!headerFooter}>
        <Disclosure>
          {hidePageMargins ? "Density" : "Page & margins"}
        </Disclosure>
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
          {!hidePageMargins && (
            <ProposalLayoutOptions
              styles={styles}
              value={value}
              onChange={onChange}
            />
          )}
          {!hidePageMargins && (
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
          )}
        </div>
      </details>
      {scope === "template" && (
        <div className="template-band-heading">
          <PanelHeading>Header & footer</PanelHeading>
          <p>
            Editing the header here makes it unique to this template. Proposals
            made from it start with this version.
          </p>
        </div>
      )}
      {headerFooter && onHeaderFooter && (
        <BandSettings
          styles={styles}
          value={headerFooter}
          onChange={onHeaderFooter}
          pageCount={pageCount}
          pages={bandPages}
          onReset={onResetBands}
          resetLabel={bandsResetLabel}
        />
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
  styles,
  value,
  onChange,
  pageCount,
  onReset,
  resetLabel,
  pages,
}: {
  styles: ReturnType<typeof resolveStyles>;
  onReset?: () => void | Promise<void>;
  resetLabel: string;
  pages?: ResolvedBandPage[];
  value: HeaderFooterSettings;
  onChange: (v: HeaderFooterSettings) => void;
  pageCount: number;
}) {
  const geometry = pageGeometry(styles, value, 1);
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
        <Switch
          className="band-switch-input"

          aria-label={label}
          aria-describedby={subtitle ? `${id}-${key}` : undefined}
          checked={value[key]}
          onChange={(e) =>
            onChange(
              boundedBandSettings(
                styles,
                { ...value, [key]: e.target.checked },
                key === "showHeader" ? "header" : "footer",
              ),
            )
          }
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
            (bandOnCover(value, kind) ? 0 : 1) -
            own.filter(
              (p) =>
                p.kind === kind && (p.page !== 1 || bandOnCover(value, kind)),
            ).length,
        )
      : 0;
  const subtitle = (kind: "header" | "footer") => {
    const excluded = own.filter(
      (p) => p.kind === kind && (p.page !== 1 || bandOnCover(value, kind)),
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
      {(["header", "footer"] as const).map((kind) => {
        const spacing = bandSpacing(value, kind),
          title = kind === "header" ? "Header" : "Footer";
        const update = (patch: Partial<typeof spacing>) =>
          onChange(
            boundedBandSettings(
              styles,
              {
                ...value,
                [kind === "header" ? "headerSpacing" : "footerSpacing"]: {
                  ...spacing,
                  ...patch,
                },
              },
              kind,
            ),
          );
        return (
          <details className="style-accordion band-section" key={kind} open>
            <Disclosure>{title}</Disclosure>
            <div className="style-accordion-body band-spacing-settings">
              {toggle(
                kind === "header" ? "showHeader" : "showFooter",
                title,
                subtitle(kind),
              )}
              <label className="band-setting">
                <span>
                  <strong>Show on cover</strong>
                </span>
                <span className="band-switch-hit">
                  <Switch
                    className="band-switch-input"
                    aria-label={`${title} show on cover`}
                    checked={bandOnCover(value, kind)}
                    onChange={(e) => update({ showOnCover: e.target.checked })}
                  />
                </span>
              </label>
              <fieldset className="band-height">
                <legend>Distance from edge</legend>
                <div role="group" aria-label={`${title} distance from edge`}>
                  {([0.25, 0.3, 0.4, 0.5] as const).map((distanceIn) => (
                    <button
                      type="button"
                      key={distanceIn}
                      aria-pressed={spacing.distanceIn === distanceIn}
                      onClick={() => update({ distanceIn })}
                    >
                      {distanceIn} in
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="band-height">
                <legend>Height</legend>
                <div role="group" aria-label={`${title} height`}>
                  {(
                    [
                      ["Small", 0.25],
                      ["Medium", 0.4],
                      ["Large", 0.6],
                      ["X-Large", 0.8],
                    ] as const
                  ).map(([name, heightIn]) => (
                    <button
                      type="button"
                      key={name}
                      aria-pressed={spacing.heightIn === heightIn}
                      onClick={() => update({ heightIn })}
                    >
                      {name}
                      <small>{heightIn} in</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <SpacingInput
                label={
                  kind === "header"
                    ? "Spacing below header"
                    : "Spacing above footer"
                }
                value={spacing.spaceToContent}
                max={bandSpacingLimit(styles, value, kind, "spaceToContent")}
                onChange={(spaceToContent) => update({ spaceToContent })}
              />
              <label className="band-setting">
                <span>
                  <strong>Divider line</strong>
                </span>
                <span className="band-switch-hit">
                  <Switch
                    className="band-switch-input"
                    aria-label={`${title} divider line`}
                    checked={bandDivider(value, kind)}
                    onChange={(e) => update({ divider: e.target.checked })}
                  />
                </span>
              </label>
              {bandDivider(value, kind) && (
                <SpacingInput
                  label={
                    kind === "header"
                      ? "Spacing above line"
                      : "Spacing below line"
                  }
                  value={spacing.spaceByLine}
                  max={bandSpacingLimit(styles, value, kind, "spaceByLine")}
                  onChange={(spaceByLine) => update({ spaceByLine })}
                />
              )}
              <p className="band-margin-note" role="status">
                {(() => {
                  const edge = kind === "header" ? "top" : "bottom",
                    label = kind === "header" ? "Top" : "Bottom",
                    effective = geometry.margins[edge],
                    base = geometry.baseMargins[edge],
                    inches = Number((effective / 96).toFixed(2));
                  return effective > base
                    ? `${label} margin grows to ${inches} in to fit the ${kind}`
                    : `${label} margin: ${inches} in (fits)`;
                })()}
              </p>
            </div>
          </details>
        );
      })}
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
          <h3>Pages with their own</h3>
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
        <ToastSurface onDismiss={() => setResetUndo(null)}>
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

export function ProposalLayoutOptions({
  styles,
  value,
  onChange,
  workspace = false,
}: {
  styles: ReturnType<typeof resolveStyles>;
  value?: StyleOverrides;
  onChange: (value: StyleOverrides) => void;
  workspace?: boolean;
}) {
  const margins = styles.layout!.margins;
  const preset =
    Object.entries(marginPresets).find(([, n]) =>
      Object.values(margins).every((v) => v === n),
    )?.[0] ?? "current";
  const row = (name: string, description: string, control: React.ReactNode) =>
    workspace ? (
      <div className="workspace-setting-row workspace-style-option">
        <div>
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
        <div className="field">{control}</div>
      </div>
    ) : (
      <label className="field">
        {name}
        {control}
      </label>
    );
  return (
    <div className="proposal-layout-options">
      {workspace &&
        row(
          "Body size",
          "Default text size. Existing sent documents keep their saved size.",
          <StyleNumber
            name="Body size (px)"
            ariaLabel="Body size (px)"
            value={styles.body.size}
            min={14}
            max={18}
            step={1}
            onChange={(size) =>
              onChange({ ...value, body: { ...value?.body, size } })
            }
          />,
        )}
      {row(
        "Page margins",
        "Letter paper. Current/custom margins are preserved until you pick a preset.",
        <Select
          aria-label="Page margin preset"
          value={preset}
          onChange={(e) => {
            const n =
              marginPresets[e.target.value as keyof typeof marginPresets];
            if (n)
              onChange({
                ...value,
                margins: { top: n, right: n, bottom: n, left: n },
              });
          }}
        >
          <option value="current">
            Current ·{" "}
            {Object.values(margins).every((n) => n === margins.top)
              ? `${margins.top} in`
              : "Custom"}
          </option>
          <option value="narrow">Narrow · 0.6 in</option>
          <option value="normal">Normal · 0.9 in</option>
          <option value="wide">Wide · 1.1 in</option>
        </Select>,
      )}
      {row(
        "Quote layout",
        "The same layout is used in the editor, client page and PDF.",
        <Select
          aria-label="Quote layout"
          value={styles.layout?.quote_layout ?? "cards"}
          onChange={(e) =>
            onChange({
              ...value,
              quote_layout: e.target.value as "cards" | "table",
            })
          }
        >
          <option value="cards">Cards</option>
          <option value="table">Table</option>
        </Select>,
      )}
    </div>
  );
}
