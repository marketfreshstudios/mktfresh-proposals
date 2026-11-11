"use client";

import type { Block } from "../lib/model";
import { ToastSurface } from "./toast-surface";

/**
 * Tells the reader a choice added a clause to the terms, without moving the
 * page. View scrolls to the clause and closes the notice.
 */
export function TermsNotice({
  clause,
  content,
  onView,
  onDismiss,
}: {
  clause: string | null;
  content: Block[];
  onView: (clause: string) => void;
  onDismiss: () => void;
}) {
  if (!clause) return null;
  const heading = content
    .flatMap((block) => block.clauses ?? [])
    .find((item) => item.id === clause)?.heading;
  return (
    <ToastSurface className="terms-notice" onDismiss={onDismiss}>
      {heading ? `Added to the terms: ${heading}` : "Added to the terms."}{" "}
      <button
        type="button"
        onClick={() => {
          onView(clause);
          onDismiss();
        }}
      >
        View
      </button>
    </ToastSurface>
  );
}
