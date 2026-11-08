import { preAmericanEnglishStarter } from "./starter-legacy-copy";
import { sameStarterState } from "../src/lib/starter-template-state";
import oldBands from "./starter-bands-v83.json" with { type: "json" };
import previousCovers from "./starter-covers-pr-a.json" with { type: "json" };
import { starterTemplates } from "./starter-templates";
import type { Item, Template } from "../src/lib/model";
/** Compare the entire saved seed, not just branding; any owner edit is protected. */
export function starterBrandUpdates(
  workspace: string,
  catalog: Item[],
  saved: Template[],
) {
  return starterTemplates(workspace, { marketfresh: true, catalog })
    .filter((t) => t.starter_key! in previousCovers)
    .map((after) => {
      const before = structuredClone(after);
      const oldCover =
        previousCovers[after.starter_key as keyof typeof previousCovers];
      before.cover = structuredClone(oldCover) as Template["cover"];
      const previous = structuredClone(before);
      before.header_footer = oldBands as Template["header_footer"];
      delete before.cover!.logo_mode;
      const current = saved.find(
        (t) => t.id === after.id && t.starter_key === after.starter_key,
      );
      const legacyBefore = preAmericanEnglishStarter(before);
      const baseline = [
        before,
        previous,
        legacyBefore,
        preAmericanEnglishStarter(previous),
      ].find((candidate) => current && sameStarterState(current, candidate));
      const eligible = !!baseline;
      const replacement = {
        ...current,
        ...after,
        name: current?.name ?? after.name,
        active: current?.active ?? after.active,
      };
      delete replacement.pagination;
      return {
        name: after.name,
        before: current,
        after: replacement,
        eligible,
        reason: !current
          ? "not present"
          : eligible
            ? `identical to ${baseline === before || baseline === legacyBefore ? "PR #83" : "PR A"} seed`
            : current &&
                (sameStarterState(current, after) ||
                  sameStarterState(current, preAmericanEnglishStarter(after)))
              ? "unchanged — already updated"
              : "edited — kept",
      };
    });
}
