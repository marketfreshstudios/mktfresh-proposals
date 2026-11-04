import icons from "./icons.json";
/** Disclosures use the heavy solid glyph; dropdowns keep their own arrows. */
export function DisclosureChevron({ open }: { open?: boolean }) {
  const icon = icons["chevron-right"];
  return (
    <svg
      aria-hidden="true"
      className="disclosure-chevron"
      data-open={open}
      viewBox={icon.viewBox}
      width="10"
      height="10"
      fill="currentColor"
    >
      <path d={icon.path} />
    </svg>
  );
}
