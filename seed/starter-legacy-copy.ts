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
