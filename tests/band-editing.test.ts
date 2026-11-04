import { expect, it } from "vitest";
import {
  defaultHeaderFooter,
  defaultTemplateBands,
} from "../src/lib/page-bands";
import { resetBandSettings } from "../src/components/editor/reset-band-settings";
it("resets shared template presentation while retaining switches and per-page overrides", () => {
  const current = defaultHeaderFooter();
  current.showHeader = false;
  current.showFooter = false;
  current.overrides.cover = { footer: "hidden" };
  const template = defaultTemplateBands();
  template.shared.header.slots[0].content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Current saved template" }],
    },
  ];
  template.divider = false;
  template.bandHeightIn = 0.75;
  template.showOnCover = true;
  const reset = resetBandSettings(current, template);
  expect(reset.shared).toEqual(template.shared);
  expect(reset).toMatchObject({
    showHeader: false,
    showFooter: false,
    divider: false,
    bandHeightIn: 0.75,
    showOnCover: true,
    overrides: current.overrides,
  });
  expect(current.shared).not.toEqual(template.shared);
  reset.shared.header.slots[0].content = [];
  expect(template.shared.header.slots[0].content).not.toEqual([]);
});
it("falls back to built-in shared bands if the template has been deleted or has no saved bands", () => {
  const current = defaultHeaderFooter();
  current.divider = false;
  expect(resetBandSettings(current).shared).toEqual(
    defaultTemplateBands().shared,
  );
  expect(resetBandSettings(current).divider).toBe(true);
});
