import {
  defaultTemplateBands,
  type HeaderFooterSettings,
  type TemplateBands,
} from "../../lib/page-bands";
/** Reset shared presentation only: visibility switches and page overrides are independent. */
export function resetBandSettings(
  current: HeaderFooterSettings,
  saved?: TemplateBands,
): HeaderFooterSettings {
  const template = saved ?? defaultTemplateBands();
  return {
    ...current,
    ...structuredClone({
      shared: template.shared,
      divider: template.divider,
      bandHeightIn: template.bandHeightIn,
      showOnCover: template.showOnCover,
    }),
  };
}
