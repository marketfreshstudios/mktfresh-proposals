"use client";
import type { PagePlan } from "../lib/page-plan";
export function DocumentPagination({ pagination }: { pagination?: PagePlan }) {
  const pages = pagination?.pages ?? 1;
  return (
    <output
      className="document-page-count"
      data-page-count={pages + 1}
      data-document-pages={pages}
    >
      {pages} document {pages === 1 ? "page" : "pages"} + completion certificate
      after signing
    </output>
  );
}
