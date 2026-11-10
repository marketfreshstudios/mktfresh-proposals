"use client";

import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
} from "react";

export const PanelDialogContext = createContext(false);

/** A tool section sits below the dialog title when the panel is a drawer or sheet. */
export function PanelHeading({
  nested = false,
  ...props
}: ComponentPropsWithoutRef<"h2"> & { nested?: boolean }) {
  const inDialog = useContext(PanelDialogContext);
  const Tag = inDialog ? (nested ? "h4" : "h3") : nested ? "h3" : "h2";
  return <Tag {...props} />;
}
