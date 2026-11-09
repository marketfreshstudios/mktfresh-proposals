"use client";
import { useContext } from "react";
import { StaffIconContext, staffIcons } from "./staff-icons";
import icons from "./icons.json";
/** Disclosures use the heavy solid glyph; dropdowns keep their own arrows. */
export function DisclosureChevron({ open }: { open?: boolean }) {
  const staff = useContext(StaffIconContext);
  if (staff) {
    const Chevron = staffIcons["chevron-right"];
    return (
      <Chevron
        aria-hidden="true"
        className="disclosure-chevron"
        data-open={open}
        size={10}
        strokeWidth={3}
      />
    );
  }
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
