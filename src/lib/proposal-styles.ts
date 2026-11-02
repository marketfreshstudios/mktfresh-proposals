import { AppError } from "./model";
import { z } from "zod";
import {
  fontChoice,
  fontFamily,
  type FontChoice,
  type ProposalFont,
} from "./proposal-fonts";
import { whiteContrast } from "./brand";
export const styleLevels = [
  "title",
  "heading1",
  "heading2",
  "heading3",
  "body",
] as const;
export type StyleLevel = (typeof styleLevels)[number];
export const styleLabels: Record<StyleLevel, string> = {
  title: "Title",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  body: "Body",
};
export const StyleEntrySchema = z.object({
  font: fontChoice,
  size: z.number().min(8).max(96),
  weight: z.number().int().min(100).max(900),
  colour: z.union([
    z.enum(["accent", "ink"]),
    z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .refine(
        (v) => whiteContrast(v) >= 4.5,
        "Colour needs at least 4.5:1 contrast against white paper",
      ),
  ]),
  letter_case: z.enum(["normal", "uppercase"]),
  letter_spacing: z.number().min(-0.1).max(0.5),
  space_above: z.number().min(0).max(160),
  space_below: z.number().min(0).max(160),
});
export type TextStyle = z.infer<typeof StyleEntrySchema>;
export const StyleOverridesSchema = z
  .object({
    title: StyleEntrySchema.partial().optional(),
    heading1: StyleEntrySchema.partial().optional(),
    heading2: StyleEntrySchema.partial().optional(),
    heading3: StyleEntrySchema.partial().optional(),
    body: StyleEntrySchema.partial().optional(),
  })
  .strict();
export type StyleOverrides = z.infer<typeof StyleOverridesSchema>;
export type ResolvedStyles = Record<StyleLevel, TextStyle>;
type Settings = {
  proposal_fonts?: { heading: FontChoice; body: FontChoice };
  proposal_styles?: StyleOverrides;
  accent_colour?: string;
};
export function defaultStyles(
  fonts?: Settings["proposal_fonts"],
): ResolvedStyles {
  const base: TextStyle = {
    font: fonts?.heading ?? "serif",
    size: 25,
    weight: 600,
    colour: "ink",
    letter_case: "normal",
    letter_spacing: -0.015,
    space_above: 28,
    space_below: 12,
  };
  return {
    title: {
      ...base,
      size: 40,
      letter_spacing: -0.025,
      space_above: 12,
      space_below: 20,
    },
    heading1: { ...base },
    heading2: {
      ...base,
      size: 17,
      letter_spacing: 0,
      space_above: 16,
      space_below: 16,
    },
    heading3: {
      ...base,
      size: 15,
      letter_spacing: 0,
      space_above: 12,
      space_below: 8,
    },
    body: {
      ...base,
      font: fonts?.body ?? "serif",
      size: 16,
      weight: 400,
      letter_spacing: 0,
      space_above: 10,
      space_below: 10,
    },
  };
}
/** Draft precedence; callers must use a version's stored result after sending. */
export function resolveStyles(
  settings?: Settings | null,
  template?: StyleOverrides,
  proposal?: StyleOverrides,
): ResolvedStyles {
  const defaults = defaultStyles(settings?.proposal_fonts);
  return Object.fromEntries(
    styleLevels.map((level) => [
      level,
      {
        ...defaults[level],
        ...settings?.proposal_styles?.[level],
        ...template?.[level],
        ...proposal?.[level],
      },
    ]),
  ) as ResolvedStyles;
}
export function styleColour(value: string, accent = "#365c4a") {
  return value === "ink" ? "#25241f" : value === "accent" ? accent : value;
}
export function freezeStyles(
  settings?: Settings | null,
  template?: StyleOverrides,
  proposal?: StyleOverrides,
) {
  const styles = resolveStyles(settings, template, proposal);
  for (const level of styleLevels)
    styles[level].colour = styleColour(
      styles[level].colour,
      settings?.accent_colour,
    );
  return styles;
}
export function validateStyleContrast(styles: ResolvedStyles, accent?: string) {
  for (const level of styleLevels)
    if (whiteContrast(styleColour(styles[level].colour, accent)) < 4.5)
      throw new AppError(
        400,
        `${styleLabels[level]} colour needs 4.5:1 contrast against white paper`,
      );
}
export function styleFonts(styles?: ResolvedStyles) {
  return styles ? styleLevels.map((level) => styles[level].font) : [];
}
export function styleFontFaces(
  styles?: ResolvedStyles,
  url = (font: ProposalFont) => `/api/workspace-fonts/${font.id}`,
) {
  return [
    ...new Map(
      styleFonts(styles)
        .filter((f): f is ProposalFont => typeof f !== "string")
        .map((f) => [f.id, f]),
    ).values(),
  ]
    .map(
      (f) =>
        `@font-face{font-family:"Proposal-${f.id}";src:url("${url(f)}") format("${f.format === "ttf" ? "truetype" : "woff2"}");font-display:swap;}`,
    )
    .join("");
}
/** Shared screen/print rules. Scope excludes the PDF completion certificate and app chrome. */
export function documentStyleCss(styles?: ResolvedStyles, accent = "#365c4a") {
  if (!styles) return "";
  const scope = ".proposal-typography.proposal-typography";
  const roots = [".document-reading", ".print-root", ".style-sample"];
  const selector = (level: StyleLevel) => {
    const tags =
      level === "title"
        ? ["h1"]
        : level === "body"
          ? [
              ".block-content",
              "[data-document-block]",
              ".print-atom",
              ".style-body",
              ".field-editor-content",
            ]
          : [level === "heading1" ? "h2" : level === "heading2" ? "h3" : "h4"];
    return roots
      .flatMap((root) =>
        tags.map((tag) => `${scope}${root} ${tag},${scope} ${root} ${tag}`),
      )
      .join(",");
  };
  return styleLevels
    .map((level) => {
      const s = styles[level],
        lh =
          level === "title"
            ? 1.15
            : level === "heading1"
              ? 1.25
              : level === "body"
                ? 1.65
                : 1.35;
      const declaration = `font-family:${fontFamily(s.font)};font-size:${s.size}px;font-weight:${s.weight};line-height:${lh};color:${styleColour(s.colour, accent)};text-transform:${s.letter_case === "normal" ? "none" : "uppercase"};letter-spacing:${s.letter_spacing}em;`;
      return (
        `${selector(level)}{${declaration}${level === "body" ? "" : `margin-top:${s.space_above}px;margin-bottom:${s.space_below}px;`}}` +
        (level === "body"
          ? roots
              .map((root) => `${scope}${root} p,${scope} ${root} p`)
              .join(",") +
            `{margin-top:${s.space_above}px;margin-bottom:${s.space_below}px}`
          : "")
      );
    })
    .join("");
}
