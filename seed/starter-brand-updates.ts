import { isDeepStrictEqual } from "node:util";
import oldBands from "./starter-bands-v83.json" with { type: "json" };
import previousCovers from "./starter-covers-pr-a.json" with { type: "json" };
import { starterTemplates } from "./starter-templates";
import type { Item, Template } from "../src/lib/model";
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
/** Compare the entire saved seed, not just branding; any owner edit is protected. */
export function starterBrandUpdates(
  workspace: string,
  catalog: Item[],
  saved: Template[],
) {
  return starterTemplates(workspace, { marketfresh: true, catalog }).map(
    (after) => {
      const before = structuredClone(after);
      before.cover = structuredClone(
        previousCovers[after.starter_key as keyof typeof previousCovers],
      ) as Template["cover"];
      const previous = structuredClone(before);
      before.header_footer = oldBands as Template["header_footer"];
      delete before.cover!.logo_mode;
      const current = saved.find(
        (t) => t.id === after.id && t.starter_key === after.starter_key,
      );
      const baseline = [before, previous].find(
        (candidate) =>
          current && isDeepStrictEqual(plain(current), plain(candidate)),
      );
      const eligible = !!baseline;
      return {
        name: after.name,
        before: current,
        after,
        eligible,
        reason: !current
          ? "not present"
          : eligible
            ? `identical to ${baseline === before ? "PR #83" : "PR A"} seed`
            : "edited or already updated — kept",
      };
    },
  );
}
