"use client";
import { pageBandHtml } from "../../lib/page-band-render";
export function PageBand(props: Parameters<typeof pageBandHtml>[0]) {
  return (
    <div
      data-editor-chrome
      dangerouslySetInnerHTML={{ __html: pageBandHtml(props) }}
    />
  );
}
