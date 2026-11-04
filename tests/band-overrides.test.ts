import { it, expect } from "vitest";
import { defaultHeaderFooter, pageGeometry } from "../src/lib/page-bands";
import { pageBandHtml } from "../src/lib/page-band-render";
import {
  pageBandValue,
  pageBandSource,
  setBandOverride,
  removeBandOverride,
  emptyBand,
} from "../src/lib/band-overrides";
it("unique edits and use-shared preserve the other band and never mutate shared content", () => {
  const original = defaultHeaderFooter(),
    before = structuredClone(original);
  let hf = setBandOverride(original, "section", "footer", "hidden");
  hf = setBandOverride(hf, "section", "header", hf.shared.header);
  hf.overrides.section.header = emptyBand(hf.shared.header);
  expect(pageBandSource(hf, "section", "header")).toBe("unique");
  expect(pageBandSource(hf, "section", "footer")).toBe("hidden");
  const edited = structuredClone(hf);
  hf = removeBandOverride(hf, "section", "header");
  expect(hf.overrides.section).toEqual({ footer: "hidden" });
  expect(pageBandValue(hf, "section", "header")).toEqual(
    original.shared.header,
  );
  expect(edited.overrides.section.header).toEqual(
    emptyBand(original.shared.header),
  );
  expect(original).toEqual(before);
});
it("hidden rendering removes only the band content, preserving its reserved geometry", () => {
  const hf = defaultHeaderFooter();
  const geometry = pageGeometry(undefined, hf, 2);
  const hidden = setBandOverride(hf, "section", "header", "hidden");
  expect(pageGeometry(undefined, hidden, 2)).toEqual(geometry);
  expect(
    pageBandHtml({
      hf: hidden,
      kind: "header",
      page: 2,
      pageCount: 3,
      values: {},
      band: "hidden",
    }),
  ).toBe("");
  const unique = emptyBand(hf.shared.header);
  unique.slots[0].content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Unique page note" }],
    },
  ];
  expect(
    pageBandHtml({
      hf,
      kind: "header",
      page: 2,
      pageCount: 3,
      values: {},
      band: unique,
      print: true,
    }),
  ).toContain("Unique page note");
});

import {
  bandPages,
  resolvedBandPages,
  reconcileBandOverrides,
} from "../src/lib/band-overrides";
import type { PagePlan } from "../src/lib/page-plan";
const blocks = (...ids: string[]) =>
  ids.map((id) => ({
    id,
    type: id.startsWith("break") ? "page_break" : "paragraph",
  }));
const plan = (
  starts: { block: string; marker?: string; offset?: number }[],
): PagePlan => ({
  format: 1,
  pages: starts.length + 1,
  starts: starts.map((s, n) => ({
    page: n + 2,
    block: s.block,
    offset: s.offset ?? 0,
    explicit: !!s.marker,
    ...(s.marker ? { marker: s.marker } : {}),
  })),
});
it("page keys use cover, explicit separators, and numbered continuation starts without changing the plan", () => {
  const content = blocks("intro", "break-a", "long", "next");
  const p = plan([
      { block: "long", marker: "break-a" },
      { block: "long", offset: 100 },
      { block: "long", offset: 200 },
      { block: "long", offset: 300 },
    ]),
    before = structuredClone(p);
  expect(bandPages(content, p).pages.map((p) => p.key)).toEqual([
    "cover",
    "break-a",
    "long",
    "long#2",
    "long#3",
  ]);
  const twice = plan([
    { block: "long", offset: 100 },
    { block: "long", offset: 200 },
  ]);
  expect(bandPages(content, twice).pages.map((p) => p.key)).toEqual([
    "cover",
    "long",
    "long#2",
  ]);
  expect(p).toEqual(before);
});
it("overrides follow a surviving anchor into its new page and emit a note only for that pass", () => {
  const c = blocks("intro", "anchor", "tail"),
    old = bandPages(c, plan([{ block: "anchor" }]));
  const hf = setBandOverride(
    defaultHeaderFooter(),
    "anchor",
    "header",
    defaultHeaderFooter().shared.header,
  );
  const current = bandPages(
    c,
    plan([{ block: "intro", offset: 100 }, { block: "anchor" }]),
  );
  const result = reconcileBandOverrides(hf, current, old);
  expect(result.changed).toBe(false);
  expect(result.moved).toEqual({ "header:anchor": 2 });
  expect(resolvedBandPages(result.value, current)[2].header.source).toBe(
    "unique",
  );
  expect(reconcileBandOverrides(hf, current, current).moved).toEqual({});
});
it("a deleted anchor transfers to the new page start; a disappeared page drops its own bands", () => {
  const c = blocks("intro", "anchor", "replacement", "break-b", "last");
  const old = bandPages(
    c,
    plan([{ block: "anchor" }, { block: "last", marker: "break-b" }]),
  );
  let hf = setBandOverride(
    defaultHeaderFooter(),
    "anchor",
    "header",
    defaultHeaderFooter().shared.header,
  );
  hf = setBandOverride(hf, "break-b", "footer", "hidden");
  const next = blocks("intro", "replacement", "break-b", "last");
  const current = bandPages(
    next,
    plan([{ block: "replacement" }, { block: "last", marker: "break-b" }]),
  );
  const moved = reconcileBandOverrides(hf, current, old);
  expect(moved.value.overrides.replacement?.header).toEqual(
    hf.overrides.anchor.header,
  );
  expect(moved.value.overrides.anchor).toBeUndefined();
  expect(moved.removed).toEqual([]);
  const removed = reconcileBandOverrides(
    hf,
    bandPages(blocks("intro"), plan([])),
    old,
  );
  expect(removed.value.overrides).toEqual({});
  expect(removed.removed.map((r) => [r.page, r.kind])).toEqual([
    [2, "header"],
    [3, "footer"],
  ]);
  expect(hf.overrides.anchor.header).toBeDefined();
});
it("collision resolution is independent per band: exact first, otherwise earliest and re-key", () => {
  const c = blocks("intro", "first", "second", "third");
  const old = bandPages(
    c,
    plan([{ block: "first" }, { block: "second" }, { block: "third" }]),
  );
  let hf = setBandOverride(defaultHeaderFooter(), "second", "header", "hidden");
  hf = setBandOverride(
    hf,
    "first",
    "header",
    defaultHeaderFooter().shared.header,
  );
  hf = setBandOverride(
    hf,
    "third",
    "footer",
    defaultHeaderFooter().shared.footer,
  );
  hf = setBandOverride(hf, "second", "footer", "hidden");
  const current = bandPages(c, plan([{ block: "first" }]));
  const result = reconcileBandOverrides(hf, current, old);
  expect(result.value.overrides).toEqual({
    first: { header: hf.overrides.first.header, footer: "hidden" },
  });
  expect(result.removed.map((r) => [r.key, r.kind])).toEqual([
    ["second", "header"],
    ["third", "footer"],
  ]);
  expect(result.moved).toEqual({ "footer:first": 3 });
});
it("a transfer never replaces an existing destination override", () => {
  const old = bandPages(
    blocks("intro", "removed", "next", "tail"),
    plan([{ block: "removed" }]),
  );
  const current = bandPages(
    blocks("intro", "next", "tail"),
    plan([{ block: "next" }]),
  );
  let hf = setBandOverride(
    defaultHeaderFooter(),
    "removed",
    "header",
    "hidden",
  );
  hf = setBandOverride(
    hf,
    "next",
    "header",
    defaultHeaderFooter().shared.header,
  );
  const result = reconcileBandOverrides(hf, current, old);
  expect(result.value.overrides).toEqual({
    next: { header: hf.shared.header },
  });
  expect(result.removed).toEqual([{ page: 2, kind: "header", key: "removed" }]);
});

import { setup, staff } from "./helpers";
import { versionHash } from "../src/lib/content";
it("published override content is part of the version hash on the same client link", async () => {
  const f = await setup();
  let p = await f.service.send(f.draft.id, staff);
  const original = structuredClone(p.versions.at(-1)!),
    token = p.token;
  const hf = setBandOverride(
    p.header_footer ?? defaultHeaderFooter(),
    p.content[0].id!,
    "footer",
    "hidden",
  );
  p = await f.service.edit(
    p.id,
    { revision: p.revision, header_footer: hf },
    staff,
  );
  expect(p.token).toBe(token);
  expect(p.versions.at(-1)!.header_footer?.overrides).toEqual(hf.overrides);
  expect(p.versions.at(-1)!.content_hash).not.toBe(original.content_hash);
  expect(versionHash(original)).toBe(original.content_hash);
});
