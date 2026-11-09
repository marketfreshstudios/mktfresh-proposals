"use client";

import { useState } from "react";
import { accessibleAccent, colorContrast } from "../../lib/brand";
import {
  blockBackground,
  blockSpacing,
  type BlockStyle,
} from "../../lib/block-style";
import { documentBlocks } from "../../lib/columns";
import type { Block } from "../../lib/model";
import { styleColour, type ResolvedStyles } from "../../lib/proposal-styles";
import type { WorkspaceSettings } from "../../lib/workspace";
import { ColorPicker, ContrastNote } from "../color-picker";
import { Select } from "../form-controls";
import { Field } from "../ui";

export type BlockStyleControlProps = {
  value?: BlockStyle;
  onChange?: (style: BlockStyle | undefined) => void;
  settings?: WorkspaceSettings | null;
  styles: ResolvedStyles;
  block?: Block;
  content?: Block[];
};

function spaceOptions(withDefault = false) {
  return (
    <>
      {withDefault && <option value="">Default</option>}
      <option value="none">None</option>
      <option value="s">Small · {blockSpacing.s}px</option>
      <option value="m">Medium · {blockSpacing.m}px</option>
      <option value="l">Large · {blockSpacing.l}px</option>
    </>
  );
}

export function blockStyleTextColor({
  value,
  settings,
  styles,
  block,
  content,
}: BlockStyleControlProps) {
  const accent = settings?.accent_colour ?? "#365c4a";
  const bg = blockBackground(value);
  const members = block?.columns
    ? documentBlocks([block]).slice(1)
    : (content ?? (block ? [block] : []));
  const colors = [undefined, ...members].map((member) => {
    const textStyle =
      member?.type === "heading"
        ? styles[`heading${member.level ?? 1}`]
        : styles.body;
    const color = styleColour(textStyle.colour, accent);
    return textStyle.size < 24 ? accessibleAccent(color) : color;
  });
  if (block?.type === "heading") colors.shift();
  return colors.reduce((lowest, color) =>
    colorContrast(color, bg ?? "#ffffff") <
    colorContrast(lowest, bg ?? "#ffffff")
      ? color
      : lowest,
  );
}

export function BlockStyleControls({
  value = {},
  onChange,
  settings,
  styles,
  block,
  content,
}: BlockStyleControlProps) {
  const accent = settings?.accent_colour ?? "#365c4a";
  const palette = [...new Set([accent, ...(settings?.brand_palette ?? [])])];
  const ink = styleColour("ink");
  const legal = block?.type === "contract" || block?.type === "signature_block";
  const bg = blockBackground(value);
  const textColor = blockStyleTextColor({
    value,
    settings,
    styles,
    block,
    content,
  });
  const [customBackground, setCustomBackground] = useState(false);
  const [customBorder, setCustomBorder] = useState(false);
  const isCustomBackground =
    customBackground ||
    (!!value.background &&
      value.background !== "neutral" &&
      !palette.includes(value.background));
  const borderColor = value.border_color ?? ink;
  const isCustomBorder =
    customBorder || (borderColor !== ink && !palette.includes(borderColor));
  function change<K extends keyof BlockStyle>(key: K, next: BlockStyle[K]) {
    const updated = { ...value, [key]: next };
    if (next === undefined) delete updated[key];
    onChange?.(Object.keys(updated).length ? updated : undefined);
  }
  return (
    <div className="block-style-controls" data-editor-chrome>
      {!legal && (
        <div className="block-background-controls stack">
          <Field label="Background">
            <Select
              value={isCustomBackground ? "custom" : (value.background ?? "")}
              onChange={(e) => {
                const chosen = e.target.value;
                setCustomBackground(chosen === "custom");
                change(
                  "background",
                  chosen === "custom" ? (bg ?? "#ffffff") : chosen || undefined,
                );
              }}
            >
              <option value="">None</option>
              <option value="neutral">Light neutral</option>
              {palette.map((color, n) => (
                <option key={color} value={color}>
                  {n === 0 ? "Primary" : `Color ${n + 1}`} · {color}
                </option>
              ))}
              <option value="custom">Custom hex</option>
            </Select>
          </Field>
          {isCustomBackground && (
            <ColorPicker
              label="Background"
              value={bg ?? "#ffffff"}
              settings={settings}
              contrastAgainst={textColor}
              onChange={(color) => change("background", color)}
            />
          )}
          {bg && <ContrastNote color={bg} against={textColor} />}
        </div>
      )}
      <Field label="Padding">
        <Select
          value={value.padding ?? "none"}
          onChange={(e) =>
            change(
              "padding",
              e.target.value === "none"
                ? undefined
                : (e.target.value as BlockStyle["padding"]),
            )
          }
        >
          {spaceOptions()}
        </Select>
      </Field>
      {(["above", "below"] as const).map((edge) => (
        <Field
          key={edge}
          label={`Margin ${edge}`}
          hint={
            content && edge === "above" ? "Between stacked columns." : undefined
          }
        >
          <Select
            value={value[`margin_${edge}`] ?? ""}
            onChange={(e) =>
              change(
                `margin_${edge}`,
                (e.target.value || undefined) as BlockStyle["margin_above"],
              )
            }
          >
            {spaceOptions(true)}
          </Select>
        </Field>
      ))}
      {!legal && (
        <>
          <Field label="Border">
            <Select
              value={value.border ?? ""}
              onChange={(e) =>
                change(
                  "border",
                  (e.target.value || undefined) as BlockStyle["border"],
                )
              }
            >
              <option value="">None</option>
              <option value="thin">Thin · 1px</option>
              <option value="medium">Medium · 2px</option>
            </Select>
          </Field>
          {value.border && (
            <Field label="Border color">
              <Select
                value={isCustomBorder ? "custom" : borderColor}
                onChange={(e) => {
                  const chosen = e.target.value;
                  setCustomBorder(chosen === "custom");
                  change(
                    "border_color",
                    chosen === "custom" ? borderColor : chosen,
                  );
                }}
              >
                <option value={ink}>Ink</option>
                <option value={accent}>Accent</option>
                {palette
                  .slice(1)
                  .filter((color) => color !== ink)
                  .map((color) => (
                    <option value={color} key={color}>
                      {color}
                    </option>
                  ))}
                <option value="custom">Custom hex</option>
              </Select>
            </Field>
          )}
          {value.border && isCustomBorder && (
            <ColorPicker
              label="Border"
              value={borderColor}
              settings={settings}
              onChange={(color) => change("border_color", color)}
            />
          )}
          {(value.border || bg) && (
            <Field label="Corner radius">
              <Select
                value={value.radius ?? ""}
                onChange={(e) =>
                  change(
                    "radius",
                    (e.target.value || undefined) as BlockStyle["radius"],
                  )
                }
              >
                <option value="">None</option>
                <option value="s">Small · 4px</option>
                <option value="m">Medium · 8px</option>
              </Select>
            </Field>
          )}
        </>
      )}
    </div>
  );
}
