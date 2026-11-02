"use client";
import type { usePdfPreview } from "./use-pdf-preview";
export function PageAccuracyNote() {
  return (
    <span className="browser-page-note" role="status">
      Page breaks approximate in this browser · Preview PDF for exact
    </span>
  );
}
/** Page placement belongs to PagedPaper; this output reports the shared renderer result. */
export function DocumentPagination({
  preview,
}: {
  preview: ReturnType<typeof usePdfPreview>;
}) {
  const layout = preview.data?.layout;
  return (
    <output
      className="document-page-count"
      data-page-count={layout ? layout.pages + 1 : undefined}
      data-document-pages={layout?.pages}
    >
      {preview.error
        ? `Page preview unavailable — ${preview.error}`
        : layout
          ? `${layout.pages} document ${layout.pages === 1 ? "page" : "pages"}${preview.approximate ? " · updating" : ""} + completion certificate after signing`
          : "Computing PDF pages…"}
      <PageAccuracyNote />
    </output>
  );
}
