import type { Cover, CoverElement } from "./cover";

import { whiteContrast } from "./brand";
export const coverLayouts = [
  "editorial",
  "split",
  "bold",
  "photo",
  "centered",
] as const;
export const coverLayoutNames = {
  editorial: "Editorial",
  split: "Split panel",
  bold: "Full color",
  photo: "Photo / uploaded design",
  centered: "Centered minimal",
};
export { coverPatterns, defaultCoverBackground } from "./cover-background";
import { defaultCoverBackground } from "./cover-background";
export function coverTextColor(color: string) {
  return whiteContrast(color) >= 4.5
    ? "#ffffff"
    : whiteContrast("#1b1f1d") / whiteContrast(color) >= 4.5
      ? "#1b1f1d"
      : "#000000";
}
export function coverMeta(e: CoverElement) {
  return (
    e.label !== undefined ||
    e.kind === "prepared_for" ||
    e.kind === "byline" ||
    ["date", "validity"].includes(e.id)
  );
}
export function coverGroups(
  elements: CoverElement[],
  layout?: Cover["layout"],
) {
  const brand = (e: CoverElement) =>
    ["logo", "workspace"].includes(e.kind) ||
    (layout === "bold" && e.kind === "eyebrow");
  const main = (e: CoverElement) =>
    !brand(e) &&
    (e.kind === "title" ||
      e.kind === "eyebrow" ||
      (["split", "bold", "centered"].includes(layout ?? "") &&
        e.kind === "prepared_for"));
  return [
    elements.filter(brand),
    elements.filter(main),
    elements.filter((e) => !brand(e) && !main(e)),
  ];
}
export function visibleCoverElement(
  e: CoverElement,
  cover: Cover,
  map: Record<string, string>,
) {
  return (
    !e.hidden &&
    !(
      cover.layout &&
      cover.layout !== "custom" &&
      e.meta === "valid_until" &&
      !map["proposal.valid_until"]
    )
  );
}
