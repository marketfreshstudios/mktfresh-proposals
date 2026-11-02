import { documentQuoteCss } from "./document-quote";
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
    density: z.enum(["standard", "comfortable"]).optional(),
    margins: z
      .object({
        top: z.number().min(0.25).max(2).optional(),
        right: z.number().min(0.25).max(2).optional(),
        bottom: z.number().min(0.25).max(2).optional(),
        left: z.number().min(0.25).max(2).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type StyleOverrides = z.infer<typeof StyleOverridesSchema>;
export type DocumentLayout = {
  density: "standard" | "comfortable";
  margins: { top: number; right: number; bottom: number; left: number };
};
export type ResolvedStyles = Record<StyleLevel, TextStyle> & {
  layout?: DocumentLayout;
};
/** Missing layout means an older frozen style map; preserve its print metrics. */
export function documentLayout(styles?: ResolvedStyles): DocumentLayout {
  return (
    styles?.layout ?? {
      density: "comfortable",
      margins: {
        top: 18 / 25.4,
        right: 18 / 25.4,
        bottom: 18 / 25.4,
        left: 18 / 25.4,
      },
    }
  );
}
export function pageMetrics(styles?: ResolvedStyles) {
  const { margins } = documentLayout(styles);
  return {
    width: 816,
    height: 1056,
    margins,
    contentWidth: 816 - 96 * (margins.left + margins.right),
    contentHeight: 1056 - 96 * (margins.top + margins.bottom),
  };
}
type Settings = {
  proposal_fonts?: { heading: FontChoice; body: FontChoice };
  proposal_styles?: StyleOverrides;
  accent_colour?: string;
};
export function defaultStyles(
  fonts?: Settings["proposal_fonts"],
  density: DocumentLayout["density"] = "standard",
): ResolvedStyles {
  const base: TextStyle = {
    font: fonts?.heading ?? "serif",
    size: 25,
    weight: 600,
    colour: "ink",
    letter_case: "normal",
    letter_spacing: -0.015,
    space_above: density === "standard" ? 27.5 : 28,
    space_below: density === "standard" ? 8.75 : 12,
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
      space_above: density === "standard" ? 18.7 : 16,
      space_below: density === "standard" ? 5.95 : 16,
    },
    heading3: {
      ...base,
      size: 15,
      letter_spacing: 0,
      space_above: density === "standard" ? 16.5 : 12,
      space_below: density === "standard" ? 5.25 : 8,
    },
    body: {
      ...base,
      font: fonts?.body ?? "serif",
      size: 16,
      weight: 400,
      letter_spacing: 0,
      space_above: density === "standard" ? 0 : 10,
      space_below: density === "standard" ? 9.6 : 10,
    },
  };
}
/** Draft precedence; callers must use a version's stored result after sending. */
export function resolveStyles(
  settings?: Settings | null,
  template?: StyleOverrides,
  proposal?: StyleOverrides,
): ResolvedStyles {
  const density =
    proposal?.density ??
    template?.density ??
    settings?.proposal_styles?.density ??
    "standard";
  const defaults = defaultStyles(settings?.proposal_fonts, density);
  const text = Object.fromEntries(
    styleLevels.map((level) => [
      level,
      {
        ...defaults[level],
        ...settings?.proposal_styles?.[level],
        ...template?.[level],
        ...proposal?.[level],
      },
    ]),
  ) as unknown as ResolvedStyles;
  text.layout = {
    density,
    margins: {
      top: 0.75,
      right: 0.75,
      bottom: 0.75,
      left: 0.75,
      ...settings?.proposal_styles?.margins,
      ...template?.margins,
      ...proposal?.margins,
    },
  };
  return text;
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
  return (
    styleLevels
      .map((level) => {
        const s = styles[level],
          lh =
            level === "title"
              ? 1.15
              : level === "heading1"
                ? 1.25
                : level === "body"
                  ? documentLayout(styles).density === "standard"
                    ? 1.5
                    : 1.65
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
      .join("") +
    (styles.layout ? documentQuoteCss : "") +
    (documentLayout(styles).density === "standard"
      ? `${scope} li{margin-block:.25em}${scope} ul,${scope} ol{margin-block:.6em}${scope} .print-atom,${scope} .draft-block,${scope} .studio-block-card{padding-top:0}${scope} .flow-quote-line{padding-block:12px;margin-block:4px}${scope} .flow-quote-line p{font-size:.9em;line-height:1.5;margin-block:.35em}${scope} .print-pricing-unit{margin:0!important}${scope} .print-choice-group{margin:4px 0!important}${scope} .print-pricing-card p{font-size:.9em;line-height:1.5;margin-block:.35em}`
      : styles.layout
        ? `${scope} .flow-quote-line{padding-block:20px;margin-block:12px}`
        : "")
  );
}
