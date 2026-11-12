import type { Template, Block } from "../src/lib/model";
/** Historical comparison only. Never written or rendered as new copy. */
export function preAmericanEnglishStarter(seed: Template): Template {
  return JSON.parse(
    JSON.stringify(seed)
      .replaceAll(
        "can be canceled with 30 days' notice",
        "can be cancelled with 30 days' notice",
      )
      .replaceAll(
        "Your logo, brand colors and any photos",
        "Your logo, brand colours and any photos",
      ),
  );
}

/** Exact historical phrases only; never rewrite arbitrary customer text. */
export function americanStarterContent(content: Block[]): Block[] {
  return JSON.parse(
    JSON.stringify(content)
      .replaceAll(
        "can be cancelled with 30 days' notice",
        "can be canceled with 30 days' notice",
      )
      .replaceAll(
        "Your logo, brand colours and any photos",
        "Your logo, brand colors and any photos",
      ),
  );
}

/** Starters before 12 Nov 2026 placed Terms on its own page just before the
 * signatures. Tests use this to compare historical migrations' payloads. */
export function preTermsMoveStarter(seed: Template): Template {
  const content = structuredClone(seed.content);
  const terms = content.findIndex((b) => b.type === "contract");
  const pricing = content.findIndex((b) => b.type === "pricing_table");
  if (terms < 0 || pricing < 0 || terms < pricing) return seed;
  const start = content[terms - 1]?.type === "page_break" ? terms - 1 : terms;
  const moved = content.splice(start, terms - start + 1);
  const lastBreak = content.findLastIndex((b) => b.type === "page_break");
  content.splice(lastBreak, 0, ...moved);
  return { ...seed, content };
}
