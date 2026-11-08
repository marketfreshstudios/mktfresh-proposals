import type { Item, Template } from "../src/lib/model";
import { workspaceStarterTemplates } from "./starter-templates";
import { sameStarterState } from "../src/lib/starter-template-state";
import {
  preAmericanEnglishStarter,
  americanStarterContent,
} from "./starter-legacy-copy";

/** Only exact shipped content is eligible. Name/availability remain workspace choices. */
export function starterEnglishUpdates(
  workspace: string,
  catalog: Item[],
  saved: Template[],
  historical: Template[] = [],
) {
  const seeds = workspaceStarterTemplates(workspace, catalog);
  return saved.flatMap((before) => {
    const current = seeds.find((s) => s.starter_key === before.starter_key);
    if (!current) return [];
    const prior = preAmericanEnglishStarter(current);
    const history = historical.filter(
      (s) => s.starter_key === before.starter_key,
    );
    const candidates = [
      prior,
      ...history,
      ...history.map((s) => ({
        ...prior,
        cover: s.cover,
        header_footer: s.header_footer,
      })),
    ];
    if (
      !candidates.some(
        (s) =>
          s.description === before.description && sameStarterState(s, before),
      )
    )
      return [];
    const content = americanStarterContent(before.content);
    if (JSON.stringify(content) === JSON.stringify(before.content)) return [];
    return [{ before, after: { ...before, content } }];
  });
}
