"use client";
import { bandOnCover, bandSpacing } from "../../lib/page-bands";
import type { HeaderFooterSettings } from "../../lib/page-bands";
import { useBandEditing } from "./band-editing";
/** Margin-only chrome. Enabling cover bands uses the ordinary settings history. */
export function CoverBandPill({
  kind,
  height,
  onChange,
  hf,
}: {
  kind: "header" | "footer";
  height: number;
  hf: HeaderFooterSettings;
  onChange: (value: HeaderFooterSettings) => void;
}) {
  const editing = useBandEditing();
  if (
    bandOnCover(hf, kind) ||
    !hf[kind === "header" ? "showHeader" : "showFooter"]
  )
    return null;
  return (
    <div
      data-editor-chrome
      data-cover-band={kind}
      className="cover-band-zone"
      style={{ height, ...(kind === "header" ? { top: 0 } : { bottom: 0 }) }}
    >
      <button
        type="button"
        onClick={() => {
          onChange({
            ...hf,
            [kind === "header" ? "headerSpacing" : "footerSpacing"]: {
              ...bandSpacing(hf, kind),
              showOnCover: true,
            },
          });
          editing?.announce(
            `${kind === "header" ? "Header" : "Footer"} shown on cover`,
          );
        }}
      >
        Use shared {kind}
      </button>
    </div>
  );
}
