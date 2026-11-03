import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorHeader } from "../src/components/editor-header";
it("renders Live and Locked header props without production state wiring or unpublished states", () => {
  const base = {
    title: "Example proposal",
    backLabel: "Proposals",
    backHref: "/proposals",
    save: async () => true,
    dirty: false,
    saving: false,
    error: "",
    offline: false,
    lastSaved: null,
    retry: () => {},
    onReviewSend: () => {},
    locked: false,
    published: "live" as const,
  };
  const live = renderToStaticMarkup(createElement(EditorHeader, base));
  expect(live).toContain("Live · Saved");
  expect(live).not.toMatch(/Send update|Unpublished changes/);
  const locked = renderToStaticMarkup(
    createElement(EditorHeader, { ...base, locked: true }),
  );
  expect(locked).toContain("Signed · locked");
  expect(locked).toContain("Duplicate as new draft");
  expect(locked).toMatch(/disabled=""[^>]*>Duplicate as new draft/);
  const offline = renderToStaticMarkup(
    createElement(EditorHeader, { ...base, offline: true }),
  );
  expect(offline).toContain("Offline · saved on this device");
  expect(offline).toMatch(
    /disabled="" title="Reconnect to send">Review &amp; send/,
  );
});
