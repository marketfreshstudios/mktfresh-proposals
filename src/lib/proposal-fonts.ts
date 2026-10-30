import { z } from "zod";
export const FontSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  path: z.string().max(300),
  format: z.enum(["woff2", "ttf"]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ProposalFont = z.infer<typeof FontSchema>;
export const curatedFonts = [
  {
    id: "serif",
    name: "Source Serif 4",
    family: '"Source Serif 4", Georgia, serif',
    file: "SourceSerif4-Variable.woff2",
  },
  {
    id: "sans",
    name: "Instrument Sans",
    family: '"Instrument Sans", system-ui, sans-serif',
    file: "InstrumentSans-Variable.woff2",
  },
  {
    id: "mono",
    name: "IBM Plex Mono",
    family: '"IBM Plex Mono", monospace',
    file: "IBMPlexMono-Regular.woff2",
  },
] as const;
export const fontChoice = z.union([
  z.enum(["serif", "sans", "mono"]),
  FontSchema,
]);
export type FontChoice = z.infer<typeof fontChoice>;
export type FontSettings = {
  proposal_fonts?: { heading: FontChoice; body: FontChoice };
};
export function fontFamily(font: FontChoice = "serif") {
  return typeof font === "string"
    ? curatedFonts.find((f) => f.id === font)!.family
    : `"Proposal-${font.id}", serif`;
}
export function fontCss(
  settings?: FontSettings | null,
  url = (font: ProposalFont) => `/api/workspace-fonts/${font.id}`,
) {
  const choices = settings?.proposal_fonts ?? {
    heading: "serif",
    body: "serif",
  };
  return (
    [
      ...new Map(
        [choices.heading, choices.body]
          .filter((f): f is ProposalFont => typeof f !== "string")
          .map((f) => [f.id, f]),
      ).values(),
    ]
      .map(
        (f) =>
          `@font-face{font-family:"Proposal-${f.id}";src:url("${url(f)}") format("${f.format === "ttf" ? "truetype" : "woff2"}");font-display:swap;}`,
      )
      .join("") +
    `.proposal-typography{--proposal-body:${fontFamily(choices.body)};--proposal-heading:${fontFamily(choices.heading)}}`
  );
}
