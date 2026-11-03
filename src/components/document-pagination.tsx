"use client";
import type { PagePlan } from "../lib/page-plan";
export function DocumentPagination({ pagination }: { pagination?: PagePlan }) {
  const pages = pagination?.pages ?? 1;
  return (
    <output
      className="document-page-count"
      data-page-count={pagination ? pages + 1 : undefined}
      data-document-pages={pagination ? pages : undefined}
    >
      {pages} document {pages === 1 ? "page" : "pages"} + completion certificate
      after signing
    </output>
  );
}
