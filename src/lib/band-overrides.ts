import type { Band, HeaderFooterSettings } from "./page-bands";
export type BandKind = "header" | "footer";
export type BandSource = "shared" | "unique" | "hidden";
export function pageBandValue(
  hf: HeaderFooterSettings,
  key: string,
  kind: BandKind,
) {
  return hf.overrides[key]?.[kind] ?? hf.shared[kind];
}
export function pageBandSource(
  hf: HeaderFooterSettings,
  key: string,
  kind: BandKind,
): BandSource {
  const value = hf.overrides[key]?.[kind];
  return value === "hidden" ? "hidden" : value ? "unique" : "shared";
}
export function setBandOverride(
  hf: HeaderFooterSettings,
  key: string,
  kind: BandKind,
  value: Band | "hidden",
): HeaderFooterSettings {
  return {
    ...hf,
    overrides: {
      ...hf.overrides,
      [key]: { ...hf.overrides[key], [kind]: structuredClone(value) },
    },
  };
}
export function removeBandOverride(
  hf: HeaderFooterSettings,
  key: string,
  kind: BandKind,
): HeaderFooterSettings {
  const overrides = structuredClone(hf.overrides);
  if (overrides[key]) {
    delete overrides[key][kind];
    if (!Object.keys(overrides[key]).length) delete overrides[key];
  }
  return { ...hf, overrides };
}
export function emptyBand(shared: Band): Band {
  return {
    layout: shared.layout,
    slots: shared.slots.map(() => ({ type: "doc", content: [] })),
  };
}

import type { PagePlan } from "./page-plan";
export type AnchorBlock = { id?: string; type: string };
export type BandPage = {
  page: number;
  key: string;
  blocks: string[];
};
export type BandPages = {
  pages: BandPage[];
  ids: string[];
  first: Record<string, number>;
};
/** Identity only: consume the existing plan without measuring or changing breaks. */
export function bandPages(
  content: AnchorBlock[],
  plan?: PagePlan,
  assignments?: { block: string; page: number }[],
): BandPages {
  const ids = content.flatMap((b) => (b.id ? [b.id] : [])),
    first: Record<string, number> = Object.create(null);
  const starts = plan?.starts ?? [],
    counts: Record<string, number> = Object.create(null);
  const byBlock = new Map<string, typeof starts>();
  for (const start of starts)
    byBlock.set(start.block, [...(byBlock.get(start.block) ?? []), start]);
  let page = 1;
  for (const block of content) {
    if (!block.id) continue;
    const blockStarts = byBlock.get(block.id) ?? [];
    const at = blockStarts.find(
      (s) => s.explicit || (!s.offset && !s.part && !s.unit),
    );
    if (at) page = at.page;
    first[block.id] = page;
    const continuation = blockStarts.at(-1);
    if (continuation) page = continuation.page;
  }
  for (const a of assignments ?? []) first[a.block] = a.page;
  for (const s of starts) if (s.marker) first[s.marker] = s.page;
  const members = new Map<number, Set<string>>();
  const add = (page: number, id: string) => {
    if (!members.has(page)) members.set(page, new Set());
    members.get(page)!.add(id);
  };
  for (const id of ids) add(first[id], id);
  for (const start of starts) add(start.page, start.block);
  const pages: BandPage[] = Array.from({ length: plan?.pages ?? 1 }, (_, n) => {
    const start = starts[n - 1];
    const base = start?.explicit && start.marker ? start.marker : start?.block;
    const occurrence = base ? (counts[base] = (counts[base] ?? 0) + 1) : 0;
    const key =
      n === 0
        ? "cover"
        : base
          ? `${base}${occurrence > 1 ? `#${occurrence}` : ""}`
          : `page-${n + 1}`;
    return {
      page: n + 1,
      key,
      blocks: [...(members.get(n + 1) ?? [])],
    };
  });
  return { pages, ids, first };
}
export function anchorPage(key: string, state: BandPages): number | undefined {
  const exact = state.pages.find((p) => p.key === key);
  if (exact) return exact.page;
  // A continuation's occurrence disappearing is a removed page, not the first
  // occurrence. An ordinary anchor follows its block even inside a page.
  if (state.ids.includes(key)) return state.first[key];
  return undefined;
}
function anchorOrder(key: string, state: BandPages) {
  const base = state.ids.includes(key) ? key : key.replace(/#\d+$/, "");
  const index = state.ids.indexOf(base);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
export type BandBinding = {
  key: string;
  source: BandSource;
  value: Band | "hidden";
};
export type ResolvedBandPage = BandPage & {
  header: BandBinding;
  footer: BandBinding;
};
export function resolvedBandPages(
  hf: HeaderFooterSettings,
  state: BandPages,
): ResolvedBandPage[] {
  const locations = new Map(
    Object.keys(hf.overrides).map((key) => [key, anchorPage(key, state)]),
  );
  return state.pages.map((p) => {
    const binding = (kind: BandKind): BandBinding => {
      const keys = Object.keys(hf.overrides).filter(
        (key) =>
          hf.overrides[key][kind] !== undefined &&
          locations.get(key) === p.page,
      );
      const key = keys.includes(p.key)
        ? p.key
        : (keys.toSorted(
            (a, b) => anchorOrder(a, state) - anchorOrder(b, state),
          )[0] ?? p.key);
      return {
        key,
        source: pageBandSource(hf, key, kind),
        value: pageBandValue(hf, key, kind),
      };
    };
    return { ...p, header: binding("header"), footer: binding("footer") };
  });
}
export type RemovedBand = { page: number; kind: BandKind; key: string };
/** Apply the owner's lifecycle rule independently to each band. Never alter a plan. */
export function reconcileBandOverrides(
  hf: HeaderFooterSettings,
  current: BandPages,
  previous?: BandPages,
) {
  const next = structuredClone(hf),
    removed: RemovedBand[] = [],
    moved: Record<string, number> = {};
  const candidates: {
    key: string;
    kind: BandKind;
    page: number;
    value: Band | "hidden";
    transfer: boolean;
    oldPage: number;
  }[] = [];
  for (const [key, entry] of Object.entries(hf.overrides))
    for (const kind of ["header", "footer"] as const) {
      const value = entry[kind];
      if (value === undefined) continue;
      const oldPage = previous ? anchorPage(key, previous) : undefined;
      let page = anchorPage(key, current),
        transfer = false;
      if (page === undefined && oldPage !== undefined) {
        const old = previous!.pages[oldPage - 1];
        const surviving = old?.blocks.find((id) => current.ids.includes(id));
        // Missing continuation pages are removed. Only a deleted anchor transfers.
        const base = previous!.ids.includes(key)
          ? key
          : key.replace(/#\d+$/, "");
        if (
          !current.ids.includes(base) &&
          previous!.ids.includes(base) &&
          surviving &&
          current.pages[oldPage - 1]
        ) {
          page = oldPage;
          transfer = true;
        }
      }
      if (page !== undefined)
        candidates.push({
          key,
          kind,
          page,
          value,
          transfer,
          oldPage: oldPage ?? page,
        });
      else if (oldPage !== undefined) {
        delete next.overrides[key][kind];
        removed.push({ page: oldPage, kind, key });
      }
    }
  for (const p of current.pages)
    for (const kind of ["header", "footer"] as const) {
      const entries = candidates.filter(
        (c) => c.page === p.page && c.kind === kind,
      );
      const resident = entries.filter((e) => !e.transfer);
      const exact = resident.find((e) => e.key === p.key);
      const byOrder = (a: { key: string }, b: { key: string }) =>
        anchorOrder(a.key, current) - anchorOrder(b.key, current) ||
        (previous
          ? anchorOrder(a.key, previous) - anchorOrder(b.key, previous)
          : 0);
      const winner =
        exact ??
        (resident.length
          ? resident.toSorted(byOrder)[0]
          : entries.toSorted(byOrder)[0]);
      for (const e of entries) {
        if (e === winner) {
          const rekey = e.transfer || (entries.length > 1 && !exact);
          if (rekey) {
            delete next.overrides[e.key][kind];
            (next.overrides[p.key] ??= {})[kind] = structuredClone(e.value);
            if (e.oldPage !== p.page) moved[`${kind}:${p.key}`] = e.oldPage;
          }
        } else {
          delete next.overrides[e.key][kind];
          removed.push({ page: e.oldPage, kind, key: e.key });
        }
      }
    }
  for (const key of Object.keys(next.overrides))
    if (!Object.keys(next.overrides[key]).length) delete next.overrides[key];
  if (previous)
    for (const [key, entry] of Object.entries(next.overrides)) {
      const before = anchorPage(key, previous),
        after = anchorPage(key, current);
      if (before !== undefined && after !== undefined && before !== after)
        for (const kind of ["header", "footer"] as const)
          if (entry[kind] !== undefined) moved[`${kind}:${key}`] = before;
    }
  return {
    value: next,
    removed,
    moved,
    changed: JSON.stringify(next.overrides) !== JSON.stringify(hf.overrides),
  };
}
