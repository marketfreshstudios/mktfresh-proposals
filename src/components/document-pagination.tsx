"use client";
import type { usePdfPreview } from "./use-pdf-preview";
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
          ? `${layout.pages} document ${layout.pages === 1 ? "page" : "pages"}${preview.approximate ? " · approximate" : ""} + completion certificate after signing`
          : "Pages approximate · computing PDF layout…"}
    </output>
  );
}
