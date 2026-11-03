import type { Block } from "../src/lib/model";
import fixture from "./editor-alignment-fixture.json" with { type: "json" };
/** Owner-provided TEST 3: neutral identities; original rich-text/list structure and lengths. */
export function test3Content(): Block[] {
  return structuredClone(fixture.content) as Block[];
}
export const test3Fonts = fixture.proposal_fonts as {
  heading: "montserrat";
  body: "dm-sans";
};
export const test3Styles = fixture.style_overrides;
export const test3Title = fixture.title;
