"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { DisclosureChevron } from "./disclosure-chevron";

const phoneWidth = "(max-width: 699px)";
function subscribe(listener: () => void) {
  const query = window.matchMedia(phoneWidth);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function isPhone() {
  return window.matchMedia(phoneWidth).matches;
}
const serverIsPhone = () => false;

export function useRecordPhone() {
  return useSyncExternalStore(subscribe, isPhone, serverIsPhone);
}

export function RecordDisclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="card record-disclosure">
      <summary>
        <DisclosureChevron />
        <span className="record-disclosure-text">
          <span className="record-disclosure-title">{title}</span>
          {summary && (
            <span className="record-disclosure-caption">{summary}</span>
          )}
        </span>
      </summary>
      {children}
    </details>
  );
}
