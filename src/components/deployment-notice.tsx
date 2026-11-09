"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { appBuildId, buildPollMs, buildSnoozeMs } from "../lib/app-build";
import { ToastSurface } from "./toast-surface";
import { Button } from "./ui";
import { useReloadSafety } from "./reload-safety";
export function DeploymentNotice({
  enabled,
  navigationKey,
}: {
  enabled: boolean;
  navigationKey: string;
}) {
  const [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    { prepare, blocked, revision } = useReloadSafety(),
    snooze = useRef(0),
    hiddenOnPage = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!blocked) setFailed(false);
  }, [blocked, revision]);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      checking = false,
      newer = false,
      queued = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const key = `yeswell-update-later:${appBuildId}`;
    try {
      snooze.current = Number(sessionStorage.getItem(key)) || 0;
    } catch {}
    hiddenOnPage.current = Date.now() < snooze.current;
    const show = () => active && setAvailable(newer && !hiddenOnPage.current);
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = setTimeout(() => void check(), buildPollMs);
    };
    const check = async () => {
      if (!active || document.visibilityState !== "visible") return;
      show();
      if (checking) {
        queued = true;
        return;
      }
      checking = true;
      try {
        const response = await fetch("/api/staff-build", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          newer =
            typeof data.buildId === "string" &&
            data.buildId.length > 0 &&
            data.buildId !== appBuildId;
          show();
        }
      } catch {
        /* A failed/offline build check never interrupts staff work. */
      } finally {
        checking = false;
        if (active && queued && document.visibilityState === "visible") {
          queued = false;
          void check();
        } else if (active) schedule();
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") void check();
    };
    const focus = () => void check();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    void check();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
    };
  }, [enabled, navigationKey]);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = matchMedia("(max-width: 699px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !available || mobile) return;
    const watched = new Set<Element>();
    const resize = new ResizeObserver(() => place());
    const place = () => {
      const region =
        document.querySelector<HTMLElement>(
          ".editor-document-region,.studio-template-main",
        ) ?? document.querySelector<HTMLElement>("#workspace-content");
      const box = region?.getBoundingClientRect();
      const left = Math.max(0, box?.left ?? 0),
        right = Math.min(innerWidth, box?.right ?? innerWidth);
      const width = Math.max(0, Math.min(560, right - left - 32));
      let top = 16;
      for (const header of document.querySelectorAll<HTMLElement>(
        ".editor-document-header,.template-editor-header,.page-header,.home-intro,.report-header,.report-filterbar,.shell-tablet-header",
      )) {
        const r = header.getBoundingClientRect();
        if (r.height > 0 && r.width > 0 && r.bottom > 0 && r.top < 180)
          top = Math.max(top, r.bottom + 16);
        if (!watched.has(header)) {
          watched.add(header);
          resize.observe(header);
        }
      }
      if (region && !watched.has(region)) {
        watched.add(region);
        resize.observe(region);
      }
      const next = { left: left + (right - left - width) / 2, top, width };
      setPosition((old) =>
        old &&
        old.left === next.left &&
        old.top === next.top &&
        old.width === next.width
          ? old
          : next,
      );
    };
    place();
    const mutation = new MutationObserver(place);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [enabled, available, mobile]);
  if (!enabled || !available) return null;
  const contents = (
    <>
      <div>
        <strong>A new version of Yeswell is available.</strong>
        <p>
          {blocked || failed
            ? "Save your changes first."
            : "Your work is saved first, then the page reloads."}
        </p>
      </div>
      <div className="deployment-notice-actions">
        <Button
          variant="secondary"
          className="notice-later"
          disabled={busy}
          onClick={() => {
            hiddenOnPage.current = true;
            snooze.current = Date.now() + buildSnoozeMs;
            try {
              sessionStorage.setItem(
                `yeswell-update-later:${appBuildId}`,
                String(snooze.current),
              );
            } catch {}
            setAvailable(false);
          }}
        >
          Later
        </Button>
        <Button
          variant="primary"
          className="notice-reload"
          disabled={busy || blocked || failed}
          onClick={async () => {
            setBusy(true);
            const from = location.href;
            try {
              const ready = await prepare();
              // Navigation or unmount during a save cancels the old reload intent.
              if (!mounted.current || location.href !== from) return;
              if (ready) location.reload();
              else setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Reload"}
        </Button>
      </div>
    </>
  );
  return mobile ? (
    <div
      className="deployment-notice deployment-inline"
      role="status"
      aria-live="polite"
    >
      {contents}
    </div>
  ) : (
    <ToastSurface
      stableLayer
      className="deployment-notice staff-foundation ink-clay"
      style={
        position
          ? { ...position, visibility: "visible" }
          : { visibility: "hidden" }
      }
    >
      {contents}
    </ToastSurface>
  );
}
