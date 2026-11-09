import { z } from "zod";
import type { Block } from "./model";

const hex = z.string().regex(/^#[\da-fA-F]{6}$/);
const spacing = z.enum(["none", "s", "m", "l"]);
export const blockStyleSchema = z
  .object({
    background: z.union([z.literal("neutral"), hex]).optional(),
    padding: spacing.optional(),
    margin_above: spacing.optional(),
    margin_below: spacing.optional(),
    border: z.enum(["thin", "medium"]).optional(),
    border_color: hex.optional(),
    radius: z.enum(["s", "m"]).optional(),
  })
  .strict();

export type BlockStyle = z.infer<typeof blockStyleSchema>;
export const blockSpacing = { none: 0, s: 12, m: 24, l: 40 } as const;
export const blockBorderWidth = { thin: 1, medium: 2 } as const;
export const blockRadius = { s: 4, m: 8 } as const;
export const blockNeutral = "#f3f0ea";

export function blockBackground(style?: BlockStyle) {
  return style?.background === "neutral" ? blockNeutral : style?.background;
}

/** Keep rendering opt-in so unstyled documents retain their original markup. */
export function blockBoxStyle(raw?: BlockStyle) {
  if (!raw) return undefined;
  const style = blockStyleSchema.parse(raw);
  const backgroundColor = blockBackground(style);
  const padding = style.padding ? blockSpacing[style.padding] : 0;
  const border = style.border
    ? `${blockBorderWidth[style.border]}px solid ${style.border_color ?? "#25241f"}`
    : undefined;
  if (!backgroundColor && !padding && !border) return undefined;
  return {
    ...(backgroundColor
      ? { backgroundColor, printColorAdjust: "exact" as const }
      : {}),
    ...(padding ? { padding: `${padding}px` } : {}),
    ...(border ? { border } : {}),
    ...(style.radius ? { borderRadius: `${blockRadius[style.radius]}px` } : {}),
  };
}

export function cssDeclarations(style: Record<string, string>) {
  return Object.entries(style)
    .map(
      ([key, value]) =>
        `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value};`,
    )
    .join("");
}

export const blockBoxCss = (style?: BlockStyle) =>
  cssDeclarations(blockBoxStyle(style) ?? {});

export function columnBoxStyle(style?: BlockStyle) {
  return {
    display: "flow-root",
    ...blockBoxStyle(style),
    ...(style?.margin_above !== undefined
      ? { "--column-space-above": `${blockSpacing[style.margin_above]}px` }
      : {}),
    ...(style?.margin_below !== undefined
      ? { "--column-space-below": `${blockSpacing[style.margin_below]}px` }
      : {}),
  };
}

/** Trim only the content edges of boxes. Inter-block spacing still comes from documentSpacing. */
export function blockContentCss(content?: Block[]) {
  if (
    !content?.some(
      (block) => block.type === "columns" || blockBoxStyle(block.style),
    )
  )
    return "";
  const box =
    ".proposal-typography.proposal-typography.proposal-typography :is([data-block-box],.column-document-block,.editor-column .block-content)";
  const parents = [
    box,
    `${box} > .field-editor > .field-editor-content > .tiptap`,
    `${box} > :is(.editor-investment,.contract-editor,.contract)`,
  ];
  const edge = (child: "first" | "last") =>
    parents
      .map(
        (parent) =>
          `${parent} > :is(h2,h3,h4,p,ul,ol,blockquote,pre,hr):${child}-child`,
      )
      .join(",");
  return `${edge("first")}{margin-top:0}${edge("last")}{margin-bottom:0}
.flow-document .document-column:not(:first-child){margin-top:var(--column-space-above,0px)}
.flow-document .document-column:not(:last-child){margin-bottom:var(--column-space-below,0px)}
@media(max-width:699px){
  .document-reading:not([data-page-measurement]) .editor-column:not(:first-child){margin-top:var(--column-space-above,0px)}
  .document-reading:not([data-page-measurement]) .editor-column:not(:last-child){margin-bottom:var(--column-space-below,0px)}
}`;
}
