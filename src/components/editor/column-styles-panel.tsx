"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  blockBackground,
  blockNeutral,
  blockRadius,
  blockSpacing,
  type BlockStyle,
} from "../../lib/block-style";
import {
  changeColumnLayout,
  columnGaps,
  columnTracks,
  type Columns,
} from "../../lib/columns";
import type { ResolvedStyles } from "../../lib/proposal-styles";
import type { WorkspaceSettings } from "../../lib/workspace";
import { useBlockSelection } from "../block-controls";
import { ColorPicker, ContrastNote } from "../color-picker";
import { Button } from "../ui";
import {
  BlockStyleControls,
  blockStyleTextColor,
} from "./block-style-controls";
import {
  columnStyleKey,
  sameStyle,
  styleTarget,
  useStyleClipboard,
  type StyleDocument,
  type StyleTarget,
} from "./style-clipboard";

type Option<T extends string> = {
  value: T;
  label: string;
  content?: ReactNode;
  color?: string;
  disabled?: boolean;
};
type Choice<T extends string> = readonly [T, string];

function StyleChoices<T extends string>({
  label,
  value,
  options,
  change,
  kind = "segments",
}: {
  label: string;
  value: T;
  options: Option<T>[];
  change: (value: T) => void;
  kind?: "segments" | "layout" | "swatches";
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`column-choices column-choices-${kind}`}
    >
      {options.map((option) => (
        <label
          key={option.value}
          title={option.label}
          data-active={option.value === value}
        >
          <input
            className="sr-only"
            type="radio"
            name={name}
            aria-label={option.label}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => change(option.value)}
          />
          <span
            aria-hidden="true"
            style={option.color ? { background: option.color } : undefined}
            data-empty={(kind === "swatches" && !option.color) || undefined}
          >
            {option.content ?? (kind === "swatches" ? "" : option.label)}
          </span>
        </label>
      ))}
    </div>
  );
}
const choices = <T extends string>(items: readonly Choice<T>[]): Option<T>[] =>
  items.map(([value, label]) => ({ value, label }));
const sizes = [
  ["s", "S"],
  ["m", "M"],
  ["l", "L"],
] as const;
const spacing = choices([["none", "None"], ...sizes] as const);
const phoneSpacing = choices([["", "Auto"], ["none", "0"], ...sizes] as const);
const layouts = Object.keys(columnTracks) as Columns["layout"][];
const layoutLabel = (layout: Columns["layout"]) =>
  layout.replaceAll("-", " / ");
const gapLabel = { s: "small", m: "medium", l: "large" };

function StyleRow({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="column-style-row">
      <span>
        {label}
        {detail !== undefined && <small>{detail}</small>}
      </span>
      {children}
    </div>
  );
}

function LayoutControls({
  value,
  change,
}: {
  value: Columns;
  change: (columns: Columns) => void;
}) {
  return (
    <div className="column-layout-controls">
      <strong>Layout</strong>
      <StyleChoices
        label="Column layout"
        value={value.layout}
        change={(layout) => change(changeColumnLayout(value, layout))}
        kind="layout"
        options={layouts.map((layout) => ({
          value: layout,
          label: layoutLabel(layout),
          content: (
            <>
              <span
                className="column-layout-preview"
                style={{ gridTemplateColumns: columnTracks[layout] }}
              >
                {layout.split("-").map((_, n) => (
                  <i key={n} />
                ))}
              </span>
              {layoutLabel(layout)}
            </>
          ),
        }))}
      />
      <StyleRow label="Gap" detail={`${columnGaps[value.gap]}px`}>
        <StyleChoices
          label="Column gap"
          value={value.gap}
          options={choices(sizes)}
          change={(gap) => change({ ...value, gap })}
        />
      </StyleRow>
      <StyleRow label="Align columns">
        <StyleChoices
          label="Align columns"
          value={value.align}
          options={choices([
            ["top", "Top"],
            ["center", "Center"],
          ] as const)}
          change={(align) => change({ ...value, align })}
        />
      </StyleRow>
    </div>
  );
}

const palette = (settings?: WorkspaceSettings | null) => [
  ...new Set([
    settings?.accent_colour ?? "#365c4a",
    ...(settings?.brand_palette ?? []),
  ]),
];
const namedColors = (settings?: WorkspaceSettings | null): Option<string>[] =>
  palette(settings).map((color, n) => ({
    value: color,
    color,
    label: n === 0 ? "Primary" : `Color ${n + 1}`,
  }));

function ColorRow({
  label,
  value,
  options,
  fallback,
  change,
  settings,
  against,
}: {
  label: "Background" | "Border color";
  value: string;
  options: Option<string>[];
  fallback: string;
  change: (color: string) => void;
  settings?: WorkspaceSettings | null;
  against?: string;
}) {
  const custom = !!value && !options.some((option) => option.value === value);
  const active = options.find((option) => option.value === value)?.label;
  return (
    <div className="column-color-row">
      <div className="column-style-label">
        <strong>{label}</strong>
        <small>{custom ? value.toUpperCase() : active}</small>
      </div>
      <div className="column-color-options">
        <StyleChoices
          label={label}
          kind="swatches"
          value={value}
          options={
            custom
              ? [
                  ...options,
                  {
                    value,
                    color: value,
                    label: `Custom ${value.toUpperCase()}`,
                  },
                ]
              : options
          }
          change={change}
        />
        <ColorPicker
          label={label === "Background" ? label : "Border"}
          value={custom ? value : fallback}
          triggerText="Custom"
          onChange={change}
          settings={settings}
          contrastAgainst={against}
        />
      </div>
    </div>
  );
}

function BoxControls({
  target,
  styles,
  settings,
  phone,
}: {
  target: StyleTarget;
  styles: ResolvedStyles;
  settings?: WorkspaceSettings | null;
  phone: boolean;
}) {
  const actions = useStyleClipboard()!;
  const style = target.style ?? {};
  const bg = blockBackground(style);
  const ink = "#25241f";
  const against = blockStyleTextColor({
    styles,
    settings,
    value: style,
    block: target.column ? undefined : target.block,
    content: target.column?.content,
  });
  const change = <K extends keyof BlockStyle>(key: K, value: BlockStyle[K]) => {
    const next = { ...style };
    if (value === undefined) delete next[key];
    else next[key] = value;
    actions.update(target.key, next);
  };
  const edges = (["above", "below"] as const).map((edge) => {
    const label = edge === "above" ? "Above" : "Below";
    const key = `margin_${edge}` as const;
    return (
      <StyleRow key={edge} label={label}>
        <StyleChoices
          label={target.column ? label : `Margin ${edge}`}
          value={style[key] ?? ""}
          options={phoneSpacing}
          change={(value) => change(key, value || undefined)}
        />
      </StyleRow>
    );
  });
  const more = (
    <>
      {phone && (
        <div className="column-style-actions">
          <Button onClick={() => actions.copy(target.key)}>Copy style</Button>
          <Button onClick={() => actions.reset(target.key)}>Reset</Button>
        </div>
      )}
      <StyleRow label="Border">
        <StyleChoices
          label="Border"
          value={style.border ?? ""}
          options={choices([
            ["", "None"],
            ["thin", "Thin"],
            ["medium", "Medium"],
          ] as const)}
          change={(value) => change("border", value || undefined)}
        />
      </StyleRow>
      {style.border && (
        <ColorRow
          label="Border color"
          value={style.border_color ?? ink}
          fallback={style.border_color ?? ink}
          options={[
            { value: ink, color: ink, label: "Ink" },
            ...namedColors(settings).filter((option) => option.value !== ink),
          ]}
          change={(value) => change("border_color", value)}
          settings={settings}
        />
      )}
      {(bg || style.border) && (
        <StyleRow
          label="Corner radius"
          detail={`${style.radius ? blockRadius[style.radius] : 0}px`}
        >
          <StyleChoices
            label="Corner radius"
            value={style.radius ?? ""}
            options={choices([
              ["", "None"],
              ["s", "S"],
              ["m", "M"],
            ] as const)}
            change={(value) => change("radius", value || undefined)}
          />
        </StyleRow>
      )}
      <section className="column-stack-options">
        <h3>
          {target.column
            ? "When columns stack on a phone"
            : "Spacing around the group"}
        </h3>
        {target.column && (
          <p>
            Space around this column when the columns sit one above another.
          </p>
        )}
        {edges}
      </section>
    </>
  );
  return (
    <div className="column-box-controls">
      <ColorRow
        label="Background"
        value={style.background ?? ""}
        fallback={bg ?? "#ffffff"}
        options={[
          { value: "", label: "None" },
          { value: "neutral", color: blockNeutral, label: "Light neutral" },
          ...namedColors(settings),
        ]}
        settings={settings}
        against={against}
        change={(value) => change("background", value || undefined)}
      />
      {bg && <ContrastNote color={bg} against={against} />}
      <StyleRow
        label="Padding"
        detail={`${blockSpacing[style.padding ?? "none"]}px`}
      >
        <StyleChoices
          label="Padding"
          value={style.padding ?? "none"}
          options={spacing}
          change={(value) =>
            change("padding", value === "none" ? undefined : value)
          }
        />
      </StyleRow>
      {phone ? (
        <details className="column-more-options">
          <summary>
            More options <ChevronRight size={16} aria-hidden="true" />
          </summary>
          {more}
        </details>
      ) : (
        more
      )}
    </div>
  );
}

function styleSummary(style?: BlockStyle, settings?: WorkspaceSettings | null) {
  const colors = namedColors(settings);
  const background =
    style?.background === "neutral"
      ? "Light neutral"
      : (colors.find((color) => color.value === style?.background)?.label ??
        style?.background?.toUpperCase());
  return (
    [
      background,
      style?.padding && `padding ${blockSpacing[style.padding]}px`,
      style?.border && `${style.border} border`,
      style?.radius && `corners ${blockRadius[style.radius]}px`,
      (style?.margin_above || style?.margin_below) && "stacking space",
    ]
      .filter(Boolean)
      .join(" · ") || "No style"
  );
}

export function PasteStyleButton({
  children = "Paste style",
  onClick,
  empty,
  main = false,
}: {
  children?: ReactNode;
  onClick: () => void;
  empty: boolean;
  main?: boolean;
}) {
  return (
    <span
      className="style-paste-button"
      title={empty ? "Copy a style first" : undefined}
    >
      <button
        type="button"
        className={main ? "btn studio-primary" : "btn"}
        disabled={empty}
        title={empty ? "Copy a style first" : undefined}
        onClick={onClick}
      >
        {children}
      </button>
    </span>
  );
}

function ColumnTabs({
  columns,
  current,
  choose,
}: {
  columns: Columns;
  current: string;
  choose: (id: string) => void;
}) {
  const clipboard = useStyleClipboard()!;
  return (
    <div className="column-style-tabs" role="tablist" aria-label="Columns">
      {columns.items.map((column, n) => (
        <button
          key={column.id}
          type="button"
          role="tab"
          aria-label={`Column ${n + 1}${clipboard.sourceKey === columnStyleKey(column.id) ? " · style copied" : ""}`}
          aria-selected={column.id === current}
          aria-controls="column-style-tab-panel"
          tabIndex={column.id === current ? 0 : -1}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const size = columns.items.length;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? size - 1
                  : (n + (event.key === "ArrowLeft" ? -1 : 1) + size) % size;
            (
              event.currentTarget.parentElement?.children[next] as HTMLElement
            )?.focus();
            choose(columns.items[next].id);
          }}
          onClick={() => choose(column.id)}
        >
          <span className="column-tab-main">
            <span>
              <span className="column-tab-long">Column </span>
              {n + 1}
            </span>
            {Object.keys(column.style ?? {}).length > 0 && (
              <i aria-hidden="true" />
            )}
          </span>
          {clipboard.sourceKey === columnStyleKey(column.id) && (
            <small className="column-copy-label"> · style copied</small>
          )}
        </button>
      ))}
    </div>
  );
}

export function SelectionStyles({
  document,
  settings,
  styles,
  children,
  phone,
  locked = false,
  template = false,
}: {
  document: StyleDocument;
  settings?: WorkspaceSettings | null;
  styles: ResolvedStyles;
  children: ReactNode;
  phone: boolean;
  locked?: boolean;
  template?: boolean;
}) {
  const selection = useBlockSelection();
  const clipboard = useStyleClipboard()!;
  const [scopeOverride, setScopeOverride] = useState<{
    key: string;
    scope: "document" | "selection";
  }>();
  const target =
    !locked && selection.ids.length === 1
      ? styleTarget(document, selection.selected)
      : undefined;
  const requestKey = target ? `${target.key}/${selection.styleRequest}` : null;
  useEffect(() => {
    if (!requestKey) setScopeOverride(undefined);
  }, [requestKey]);
  const scope =
    scopeOverride?.key === requestKey
      ? scopeOverride.scope
      : target?.block.columns
        ? "selection"
        : "document";
  const active = scope === "selection" ? target : undefined;
  const columns = active?.block.columns;
  const isColumn = !!active?.column;
  const clip = clipboard.styleClipboard;
  const groupKey = columns ? `${document.prefix}${active?.block.id}` : "";
  const choose = (key: string) => {
    setScopeOverride(undefined);
    selection.selectStyle(key);
  };
  const patch = (value: Columns) => {
    if (!active) return;
    document.onChange(
      document.content.map((block) =>
        block.id === active.block.id ? { ...block, columns: value } : block,
      ),
    );
    if (
      active.column &&
      !value.items.some((item) => item.id === active.column?.id)
    )
      choose(columnStyleKey(value.items.at(-1)!.id));
  };
  return (
    <div
      className="selection-styles"
      data-preserve-block-selection
      data-column-phone={(phone && isColumn) || undefined}
    >
      {!(phone && isColumn) && (
        <StyleChoices
          label="Styles scope"
          value={active ? "selection" : "document"}
          options={[
            {
              value: "document",
              label: template ? "This template" : "This proposal",
            },
            { value: "selection", label: "Selection", disabled: !target },
          ]}
          change={(value) => {
            if (requestKey) setScopeOverride({ key: requestKey, scope: value });
          }}
        />
      )}
      {!active ? (
        <>{children}</>
      ) : columns && isColumn ? (
        <>
          <section className="column-layout-card">
            <button
              type="button"
              aria-expanded={clipboard.layoutOpen}
              onClick={() => clipboard.setLayoutOpen(!clipboard.layoutOpen)}
            >
              <span>
                <strong>Columns layout</strong>
                <small>
                  {layoutLabel(columns.layout)} · {gapLabel[columns.gap]} gap ·{" "}
                  {columns.align}
                </small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            {clipboard.layoutOpen && (
              <LayoutControls value={columns} change={patch} />
            )}
          </section>
          <div className="column-style-breadcrumb">
            <button
              type="button"
              className="column-text-action"
              onClick={() => choose(groupKey)}
            >
              <span>Columns</span>
            </button>
            <ChevronRight size={12} aria-hidden="true" />
            <strong>{active.label}</strong>
          </div>
          <ColumnTabs
            columns={columns}
            current={active.column!.id}
            choose={(id) => choose(columnStyleKey(id))}
          />
          <div
            id="column-style-tab-panel"
            role="tabpanel"
            aria-label={active.label}
          >
            <div
              className="column-style-actions"
              data-main-paste={(phone && !!clip) || undefined}
            >
              <Button onClick={() => clipboard.copy(active.key)}>
                Copy style
              </Button>
              <PasteStyleButton
                empty={!clip}
                main={phone && !!clip}
                onClick={() => clipboard.paste(active.key)}
              >
                {phone && clip
                  ? `Paste style from ${clip.source}`
                  : "Paste style"}
              </PasteStyleButton>
              {!phone && (
                <Button
                  variant="ghost"
                  onClick={() => clipboard.reset(active.key)}
                >
                  Reset
                </Button>
              )}
            </div>
            {clip && (
              <div className="column-clipboard-card">
                <div>
                  <strong>Copied from {clip.source}</strong>
                  <small>{styleSummary(clip.style, settings)}</small>
                </div>
                <Button
                  className={phone ? "column-text-action" : undefined}
                  onClick={() => clipboard.pasteAll(active.block.id!)}
                >
                  <span>Paste to all columns</span>
                </Button>
                {clipboard.sourceKey !== active.key &&
                  sameStyle(active.style, clip.style) && (
                    <small>Matches {clip.source}</small>
                  )}
              </div>
            )}
            <BoxControls
              key={active.key}
              target={active}
              styles={styles}
              settings={settings}
              phone={phone}
            />
          </div>
        </>
      ) : columns ? (
        <>
          <section className="columns-overview">
            <h2>Columns</h2>
            <p>Layout for the whole group. Style each column below.</p>
            <LayoutControls value={columns} change={patch} />
          </section>
          <section className="column-style-list">
            <header>
              <h3>Column styles</h3>
              <Button
                onClick={() =>
                  clipboard.pasteAll(
                    active.block.id!,
                    columnStyleKey(columns.items[0].id),
                  )
                }
              >
                Match all to Column 1
              </Button>
            </header>
            {columns.items.map((column, n) => (
              <div className="column-style-list-row" key={column.id}>
                <i
                  aria-hidden="true"
                  style={{ background: blockBackground(column.style) }}
                />
                <span>
                  <strong>Column {n + 1}</strong>
                  <small>{styleSummary(column.style, settings)}</small>
                </span>
                <Button onClick={() => choose(columnStyleKey(column.id))}>
                  Edit<span className="sr-only"> Column {n + 1}</span>
                </Button>
                {clip && clipboard.sourceKey !== columnStyleKey(column.id) && (
                  <Button
                    onClick={() => clipboard.paste(columnStyleKey(column.id))}
                  >
                    Paste<span className="sr-only"> into Column {n + 1}</span>
                  </Button>
                )}
              </div>
            ))}
          </section>
          <GroupBox
            target={active}
            styles={styles}
            settings={settings}
            phone={phone}
          />
          {columns.items.length === 3 && (
            <p className="column-layout-note">
              Switching to two columns moves Column 3’s blocks to the end of
              Column 2. Its style is dropped. Undo restores it.
            </p>
          )}
        </>
      ) : (
        <>
          <h2>{active.label} style</h2>
          <div className="column-style-actions">
            <Button onClick={() => clipboard.copy(active.key)}>
              Copy style
            </Button>
            <PasteStyleButton
              empty={!clip}
              onClick={() => clipboard.paste(active.key)}
            />
            <Button variant="ghost" onClick={() => clipboard.reset(active.key)}>
              Reset
            </Button>
          </div>
          {clip && (
            <p className="column-clipboard-card">
              <strong>Copied from {clip.source}</strong>
              <small>{styleSummary(clip.style, settings)}</small>
            </p>
          )}
          <BlockStyleControls
            key={active.key}
            block={active.block}
            value={active.style}
            settings={settings}
            styles={styles}
            onChange={(style) => clipboard.update(active.key, style)}
          />
        </>
      )}
    </div>
  );
}

function GroupBox(props: Parameters<typeof BoxControls>[0]) {
  const [open, setOpen] = useState(false);
  return (
    <section className="column-group-box">
      <header>
        <span>
          <strong>Group box</strong>
          <small>Background or border around the whole group</small>
        </span>
        <Button aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Done" : props.target.style ? "Edit" : "Add"}
        </Button>
      </header>
      {open && <BoxControls {...props} />}
    </section>
  );
}
