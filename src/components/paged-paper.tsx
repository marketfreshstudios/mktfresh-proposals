"use client";
import {
  bandPages,
  resolvedBandPages,
  reconcileBandOverrides,
  type BandPages,
} from "../lib/band-overrides";
import {
  bandOnCover,
  pageGeometry,
  type HeaderFooterSettings,
} from "../lib/page-bands";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useBandEditing } from "./editor/band-editing";
import { CoverBandPill } from "./editor/cover-band-pill";
import { PageBand } from "./editor/page-band";
import { pageBandCss } from "../lib/page-band-render";
import { PageSheet, type SheetBox } from "./editor/page-sheet";
import { projectPageSheets } from "./editor/project-page-sheets";
import { useBlockSelection } from "./block-controls";
import type { Block } from "../lib/model";
import { pageMetrics, type ResolvedStyles } from "../lib/proposal-styles";
import { paginateBrowser, type BrowserPages } from "./browser-pagination";
import { fontFamily } from "../lib/proposal-fonts";
export type { BrowserPages } from "./browser-pagination";
// Prefer settled metrics initially, but a failed or stalled asset cannot block editing.
const ASSET_WAIT_MS = 1000;
/** Browser pagination owns both the sheets and the saved print break points. */
export function PagedPaper({
  paper,
  content,
  styles,
  enabled = true,
  sheets = false,
  contentKey,
  onPagination,
  headerFooter,
  onHeaderFooter,
  onBandReflow,
  allowOverrides = true,
  values = {},
  logo,
  logoIcon,
}: {
  onHeaderFooter?: (hf: HeaderFooterSettings) => void;
  onBandReflow?: (
    hf: HeaderFooterSettings,
    withContentEdit: boolean,
  ) => number | undefined;
  allowOverrides?: boolean;
  headerFooter?: HeaderFooterSettings;
  values?: Record<string, string>;
  logo?: string;
  logoIcon?: string;
  paper: RefObject<HTMLElement | null>;
  content: Block[];
  styles: ResolvedStyles;
  enabled?: boolean;
  sheets?: boolean;
  contentKey: string;
  onPagination: (value: BrowserPages, contentKey: string) => void;
}) {
  const bandEditing = useBandEditing();
  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    if (bandEditing?.active) el.dataset.bandEditing = bandEditing.active;
    else delete el.dataset.bandEditing;
    return () => {
      delete el.dataset.bandEditing;
    };
  }, [bandEditing?.active, paper]);
  const surface = useRef<HTMLDivElement>(null);
  const selection = useBlockSelection();
  const [boxes, setBoxes] = useState<SheetBox[]>([{ top: 0, height: 320 }]);
  const metrics = pageMetrics(styles),
    [pages, setPages] = useState(1);
  const [measuredKey, setMeasuredKey] = useState("");
  const [sources, setSources] = useState<BrowserPages | null>(null);
  // Sheet backgrounds are a separate visual layer. Keep their keyboard stops
  // in reading order with the existing block focus stops, without reparenting text.
  useEffect(() => {
    const el = paper.current;
    if (!el || !onHeaderFooter) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== "Tab" ||
        event.defaultPrevented ||
        bandEditing?.active ||
        !matchMedia("(min-width:700px)").matches
      )
        return;
      const target = event.target as HTMLElement;
      const band = target.closest<HTMLElement>("[data-band-frame]");
      const block = target.closest<HTMLElement>(".block-frame");
      const assignment =
        block &&
        sources?.assignments.find(
          (a) =>
            block.dataset.blockId === `block-${a.block}` ||
            block.dataset.blockId === `template-${a.block}`,
        );
      const number = band ? Number(band.dataset.bandPage) : assignment?.page;
      if (!number) return;
      const visible = (b: HTMLElement) =>
        b.tabIndex >= 0 &&
        !!b.getClientRects().length &&
        getComputedStyle(b).visibility !== "hidden";
      const blocksOn = (page: number) => {
        const ids =
          sources?.assignments
            .filter((a) => a.page === page)
            .map((a) => a.block) ?? [];
        return [...el.querySelectorAll<HTMLElement>(".block-frame")]
          .filter((b) =>
            ids.some(
              (id) =>
                b.dataset.blockId === `block-${id}` ||
                b.dataset.blockId === `template-${id}`,
            ),
          )
          .filter(visible);
      };
      const bandOn = (kind: "header" | "footer", page: number) =>
        el.querySelector<HTMLElement>(
          `[data-band-frame=${kind}][data-band-page="${page}"][tabindex="0"]`,
        );
      const outside = (backward: boolean) => {
        const candidates = [
          ...document.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"],[contenteditable="true"]',
          ),
        ].filter((b) => !el.contains(b) && visible(b));
        return backward
          ? candidates
              .filter(
                (b) =>
                  !!(
                    el.compareDocumentPosition(b) &
                    Node.DOCUMENT_POSITION_PRECEDING
                  ),
              )
              .at(-1)
          : candidates.find(
              (b) =>
                !!(
                  el.compareDocumentPosition(b) &
                  Node.DOCUMENT_POSITION_FOLLOWING
                ),
            );
      };
      const blocks = blocksOn(number),
        header = bandOn("header", number),
        footer = bandOn("footer", number);
      let next: HTMLElement | null | undefined;
      if (band && target === band) {
        if (band.dataset.bandFrame === "header")
          next = event.shiftKey
            ? (bandOn("footer", number - 1) ??
              blocksOn(number - 1).at(-1) ??
              outside(true))
            : (blocks[0] ??
              footer ??
              bandOn("header", number + 1) ??
              outside(false));
        else
          next = event.shiftKey
            ? (blocks.at(-1) ?? header ?? outside(true))
            : (bandOn("header", number + 1) ??
              blocksOn(number + 1)[0] ??
              outside(false));
      } else if (block) {
        const stops = [
          block,
          ...block.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"],[contenteditable="true"]',
          ),
        ].filter(
          (b) =>
            b.tabIndex >= 0 &&
            b.getClientRects().length &&
            getComputedStyle(b).visibility !== "hidden",
        );
        if (event.shiftKey && block === blocks[0] && target === stops[0])
          next = header ?? bandOn("footer", number - 1);
        if (
          !event.shiftKey &&
          block === blocks.at(-1) &&
          target === stops.at(-1)
        )
          next = footer ?? bandOn("header", number + 1);
      }
      if (next) {
        event.preventDefault();
        next.focus();
      }
    };
    el.addEventListener("keydown", key);
    return () => el.removeEventListener("keydown", key);
  }, [sources, bandEditing?.active, !!onHeaderFooter]);
  const previousBands = useRef<BandPages | undefined>(undefined);
  const previousBandContentKey = useRef<string | undefined>(undefined);
  const bandState = bandPages(content, sources?.plan, sources?.assignments);
  const bindings = headerFooter
    ? resolvedBandPages(headerFooter, bandState)
    : [];
  useEffect(() => {
    if (
      !allowOverrides ||
      !sources ||
      measuredKey !== contentKey ||
      !headerFooter ||
      !onHeaderFooter
    )
      return;
    const current = bandPages(content, sources.plan, sources.assignments);
    const withContentEdit =
      previousBandContentKey.current !== undefined &&
      previousBandContentKey.current !== contentKey;
    previousBandContentKey.current = contentKey;
    // Restoring a band with Undo is not another reflow. Reconcile identities
    // when content/order/page starts change, not again for the cleanup itself.
    if (JSON.stringify(previousBands.current) === JSON.stringify(current))
      return;
    const result = reconcileBandOverrides(
      headerFooter,
      current,
      previousBands.current,
    );
    previousBands.current = current;
    if (Object.keys(result.moved).length)
      bandEditing?.setMoves({ ...bandEditing.moves, ...result.moved });
    if (result.changed) {
      const step = onBandReflow?.(result.value, withContentEdit);
      if (!onBandReflow) onHeaderFooter(result.value);
      for (const removed of result.removed)
        bandEditing?.announce(
          `Page ${removed.page}'s ${removed.kind} was removed`,
          step,
        );
    }
  }, [
    sources,
    measuredKey,
    contentKey,
    headerFooter,
    !!onHeaderFooter,
    allowOverrides,
  ]);
  const latest = useRef({
    content,
    headerFooter,
    styles,
    onPagination,
    enabled,
    sheets,
    contentKey,
  });
  latest.current = {
    content,
    headerFooter,
    styles,
    onPagination,
    enabled,
    sheets,
    contentKey,
  };
  useLayoutEffect(() => {
    const root = surface.current?.parentElement;
    if (!root) return;
    let frame = 0,
      stopped = false,
      running = false;
    let readyAssets = "",
      waitingAssets = "",
      fallbackAssets = "",
      completedAssets = "";
    let assetRequest = 0,
      assetsWaitStarted: number | null = null,
      assetsTimer: ReturnType<typeof setTimeout> | undefined;
    let width = root.parentElement?.clientWidth ?? root.clientWidth;
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(
              r.target instanceof Element ? r.target : r.target.parentElement
            )?.closest(
              "[data-editor-chrome],.editor-page-sheets,.document-page-count",
            ),
        )
      )
        schedule();
    });
    const observe = () =>
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    function update() {
      if (stopped || running) return;
      cancelAnimationFrame(frame);
      frame = 0;
      running = true;
      observer.disconnect();
      try {
        const v = latest.current;
        if (v.sheets) {
          const available = root!.parentElement!.clientWidth;
          const contentWidth = pageMetrics(v.styles).contentWidth;
          const desktop = window.innerWidth >= 700;
          const spare = Math.max(116, Math.min(176, available - contentWidth));
          const left = Math.max(64, Math.min(88, spare / 2));
          root!.style.setProperty(
            "--editor-sheet-width",
            `${desktop && v.headerFooter && available >= metrics.width ? metrics.width : desktop ? Math.min(available, contentWidth + 176) : available}px`,
          );
          root!.style.setProperty(
            "--editor-sheet-left",
            `${desktop && v.headerFooter && available >= metrics.width ? pageGeometry(v.styles, v.headerFooter, 1).margins.left : desktop ? left : 40}px`,
          );
          root!.style.setProperty(
            "--editor-sheet-right",
            `${desktop && v.headerFooter && available >= metrics.width ? pageGeometry(v.styles, v.headerFooter, 1).margins.right : desktop ? spare - left : 36}px`,
          );
        }
        if (v.headerFooter && v.enabled) {
          const g = pageGeometry(v.styles, v.headerFooter, 1);
          root!.style.setProperty(
            "padding-top",
            `${g.content.y}px`,
            "important",
          );
          root!.style.setProperty(
            "padding-bottom",
            `${g.margins.bottom + g.after}px`,
            "important",
          );
        } else {
          root!.style.removeProperty("padding-top");
          root!.style.removeProperty("padding-bottom");
        }
        // Give initial font/logo metrics a bounded grace period. After that,
        // measure what's available and refresh when the pending batch settles.
        const images = Array.from(
          root!.querySelectorAll<HTMLImageElement>("img"),
        );
        const fonts = [
          "title",
          "heading1",
          "heading2",
          "heading3",
          "body",
        ] as const;
        const assets = JSON.stringify([
          fonts.map((level) => {
            const style = v.styles[level];
            return `${style.weight} ${style.size}px ${fontFamily(style.font)}`;
          }),
          images.map((image) => image.src),
        ]);
        // Accept completion only against this render's current asset signature.
        // Returning to a cached signature invalidates an obsolete pending batch.
        if (
          readyAssets === assets &&
          waitingAssets &&
          waitingAssets !== assets
        ) {
          ++assetRequest;
          clearTimeout(assetsTimer);
          waitingAssets = "";
          completedAssets = "";
          assetsWaitStarted = null;
        }
        if (completedAssets === assets) {
          readyAssets = assets;
          completedAssets = "";
          waitingAssets = "";
          assetsWaitStarted = null;
        }
        if (v.enabled && readyAssets !== assets) {
          if (waitingAssets !== assets) {
            waitingAssets = assets;
            fallbackAssets = "";
            completedAssets = "";
            const request = ++assetRequest;
            assetsWaitStarted ??= performance.now();
            clearTimeout(assetsTimer);
            assetsTimer = setTimeout(
              () => {
                if (
                  stopped ||
                  assetRequest !== request ||
                  readyAssets === assets
                )
                  return;
                fallbackAssets = assets;
                schedule();
              },
              Math.max(
                0,
                ASSET_WAIT_MS - (performance.now() - assetsWaitStarted),
              ),
            );
            Promise.allSettled([
              ...fonts.map((level) =>
                Promise.resolve().then(() => {
                  const style = v.styles[level];
                  return document.fonts.load(
                    `${style.weight} ${style.size}px ${fontFamily(style.font)}`,
                  );
                }),
              ),
              ...images.map((image) =>
                Promise.resolve().then(() => image.decode()),
              ),
            ]).then(() => {
              if (stopped || assetRequest !== request) return;
              clearTimeout(assetsTimer);
              completedAssets = assets;
              schedule();
            });
          }
          if (fallbackAssets !== assets) {
            root!.dataset.layoutAssetsReady = "false";
            root!.dataset.layoutAssetsState = "pending";
            setMeasuredKey("");
            return;
          }
        }
        root!.dataset.layoutAssetsReady = "true";
        root!.dataset.layoutAssetsState =
          v.enabled && readyAssets !== assets ? "fallback" : "settled";
        if (
          Array.from(root!.querySelectorAll(".field-editor")).some(
            (el) => !el.querySelector(".tiptap"),
          )
        ) {
          setMeasuredKey("");
          schedule();
          return;
        }
        if (!v.enabled) {
          root!
            .querySelectorAll<HTMLElement>("[data-layout-space]")
            .forEach((el) => {
              el.style.removeProperty("margin-top");
              delete el.dataset.layoutSpace;
            });
          root!
            .querySelectorAll<HTMLElement>(".field-editor,[data-source-text]")
            .forEach((el) =>
              el.dispatchEvent(
                new CustomEvent("editor-source-spacers", { detail: [] }),
              ),
            );
          root!.style.removeProperty("--page-sheets-height");
        }
        // The existing engine still chooses every source break. Its old painting
        // is used on phone; desktop projects that same plan into responsive sheets.
        const value = paginateBrowser(
          root!,
          v.content,
          v.styles,
          v.enabled && !v.sheets,
          false,
          v.headerFooter,
        );
        if (v.enabled && v.sheets)
          setBoxes(
            projectPageSheets(
              root!,
              v.content,
              value.plan,
              v.styles,
              v.headerFooter,
            ),
          );
        setPages(value.plan.pages);
        setMeasuredKey(v.contentKey);
        setSources(value);
        root!.dataset.pagination = JSON.stringify(value.plan);
        root!.dataset.pageAssignments = JSON.stringify(value.assignments);
        v.onPagination(value, v.contentKey);
      } finally {
        running = false;
        observe();
      }
    }
    // iOS holds a tap as a hover preview when the page changes between the
    // touch and its click. A touch can itself prompt a layout pass (Safari
    // resizes its toolbar), so passes wait until the tap's click has fired.
    let touching = false,
      deferred = false,
      releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const touchStart = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      touching = true;
      clearTimeout(releaseTimer);
    };
    const touchRelease = () => {
      clearTimeout(releaseTimer);
      if (!touching) return;
      touching = false;
      if (deferred) {
        deferred = false;
        schedule();
      }
    };
    // A tap's click releases at once; a press with no click releases after
    // the window iOS watches for changes.
    const touchEnd = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || !touching) return;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(touchRelease, 800);
    };
    const touchClick = () => {
      if (touching) setTimeout(touchRelease, 0);
    };
    window.addEventListener("pointerdown", touchStart, true);
    window.addEventListener("pointerup", touchEnd, true);
    window.addEventListener("pointercancel", touchRelease, true);
    window.addEventListener("click", touchClick, true);
    function schedule() {
      if (stopped || frame) return;
      if (touching) {
        deferred = true;
        return;
      }
      frame = requestAnimationFrame(() => {
        if (touching) {
          frame = 0;
          deferred = true;
          return;
        }
        flushSync(update);
      });
    }
    const flush = () => flushSync(update);
    root.addEventListener("pagination-flush", flush);
    root.addEventListener("pagination-layout-change", schedule);
    root.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    const resize = new ResizeObserver(() => {
      const available = root.parentElement?.clientWidth ?? root.clientWidth;
      if (latest.current.sheets && available !== width) {
        width = available;
        schedule();
      }
    });
    resize.observe(root.parentElement ?? root);
    observe();
    queueMicrotask(() => {
      if (!stopped) flushSync(update);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(assetsTimer);
      clearTimeout(releaseTimer);
      window.removeEventListener("pointerdown", touchStart, true);
      window.removeEventListener("pointerup", touchEnd, true);
      window.removeEventListener("pointercancel", touchRelease, true);
      window.removeEventListener("click", touchClick, true);
      observer.disconnect();
      resize.disconnect();
      root.removeEventListener("pagination-flush", flush);
      root.removeEventListener("pagination-layout-change", schedule);
      root.removeEventListener("load", schedule, true);
      window.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [enabled, sheets]);
  useLayoutEffect(() => {
    surface.current?.parentElement?.dispatchEvent(
      new Event("pagination-layout-change"),
    );
  }, [contentKey, JSON.stringify(styles), JSON.stringify(headerFooter)]);
  if (!enabled) return <div ref={surface} hidden />;
  return (
    <div
      ref={surface}
      className="editor-page-sheets"
      aria-label="Document pages"
      data-sheet-view={sheets}
      data-layout-settled={!!sources && measuredKey === contentKey}
      data-approximate={!sources || measuredKey !== contentKey}
      data-layout-mode="browser"
      data-layout-max-error="0"
      style={{
        height: sheets
          ? (boxes.at(-1)?.top ?? 0) + (boxes.at(-1)?.height ?? 320)
          : pages * (metrics.height + 24) - 24,
      }}
    >
      <style>{pageBandCss}</style>
      {sheets
        ? boxes.map((box, n) => (
            <PageSheet
              key={n}
              number={n + 1}
              geometry={pageGeometry(styles, headerFooter, n + 1)}
              box={box}
              fragments={[
                ...(sources?.assignments ?? []).filter((v) => v.page === n + 1),
                ...(sources?.plan.starts ?? []).filter((v) => v.page === n + 1),
              ]}
              showLabel={n > 0}
              onBackgroundClick={selection.clear}
            >
              {n === 0 &&
                headerFooter &&
                onHeaderFooter &&
                (["header", "footer"] as const).map((kind) => (
                  <CoverBandPill
                    key={`cover-${kind}`}
                    kind={kind}
                    hf={headerFooter}
                    onChange={onHeaderFooter}
                    height={
                      pageGeometry(styles, headerFooter, 1).margins[
                        kind === "header" ? "top" : "bottom"
                      ]
                    }
                  />
                ))}
              {(["header", "footer"] as const).map((kind) => (
                <PageBand
                  key={kind}
                  anchor={bindings[n]?.[kind].key}
                  source={bindings[n]?.[kind].source}
                  band={bindings[n]?.[kind].value}
                  allowOverrides={allowOverrides}
                  sharedCount={
                    bindings.filter(
                      (p) =>
                        p[kind].source === "shared" &&
                        (bandOnCover(headerFooter, kind) || p.page !== 1),
                    ).length
                  }
                  movedFrom={
                    bandEditing?.moves[`${kind}:${bindings[n]?.[kind].key}`]
                  }
                  onDismissMove={() =>
                    bandEditing?.dismissMove(
                      `${kind}:${bindings[n]?.[kind].key}`,
                    )
                  }
                  hf={headerFooter}
                  onChange={onHeaderFooter}
                  kind={kind}
                  page={n + 1}
                  pageCount={pages}
                  values={values}
                  styles={styles}
                  logo={logo}
                  logoIcon={logoIcon}
                />
              ))}
            </PageSheet>
          ))
        : Array.from({ length: pages }, (_, n) => (
            <section
              key={n}
              className="editor-page-sheet page-sheet"
              data-editor-page={n + 1}
              data-source-fragments={JSON.stringify([
                ...(sources?.assignments ?? []).filter((v) => v.page === n + 1),
                ...(sources?.plan.starts ?? []).filter((v) => v.page === n + 1),
              ])}
              style={{
                top: n * (metrics.height + 24),
                width: metrics.width,
                height: metrics.height,
              }}
              aria-label={`Page ${n + 1}${n === 0 ? " · Cover" : ""}`}
            >
              <small>
                Page {n + 1}
                {n === 0 ? " · Cover" : ""}
              </small>
            </section>
          ))}
    </div>
  );
}
