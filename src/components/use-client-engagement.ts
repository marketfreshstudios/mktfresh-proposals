"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicProposal } from "./client-proposal";
import { EngagementClock } from "../lib/engagement-clock";
import {
  type EngagementAction,
  type EngagementSnapshot,
  type EngagementTarget,
} from "../lib/engagement";

function browserId(token: string) {
  const key = `yeswell-engagement:${token}`;
  try {
    const old = localStorage.getItem(key);
    if (old && /^[0-9a-f-]{36}$/i.test(old)) return old;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
function visibleArea(element: HTMLElement) {
  if (
    element.closest('[aria-hidden="true"],[inert]') ||
    !element.checkVisibility({ visibilityProperty: true })
  )
    return 0;
  const box = element.getBoundingClientRect();
  const height = Math.max(
    0,
    Math.min(innerHeight, box.bottom) - Math.max(0, box.top),
  );
  const width = Math.max(
    0,
    Math.min(innerWidth, box.right) - Math.max(0, box.left),
  );
  // Oversized blocks are measured against the viewport; normal blocks must
  // expose at least half their own area. No layout/print styles are changed.
  return box.width &&
    box.height &&
    (height * width) /
      (Math.min(box.height, innerHeight) * Math.min(box.width, innerWidth)) >=
      0.5
    ? height * width
    : 0;
}
function visibleTargets(targets: EngagementTarget[]) {
  const host = document.getElementById("proposal-document");
  if (!host) return [];
  const root = host.shadowRoot ?? host;
  const byBlock = new Map(
    targets
      .filter((t) => t.kind === "section")
      .flatMap((t) => t.blocks.map((id) => [id, t.key] as const)),
  );
  const scores = new Map<string, number>();
  for (const element of root.querySelectorAll<HTMLElement>(
    "[data-print-block],[data-document-block],.document-cover",
  )) {
    const area = visibleArea(element);
    if (!area) continue;
    const id = element.matches(".document-cover")
      ? "cover"
      : (element.dataset.printBlock ?? element.dataset.documentBlock!);
    const section = byBlock.get(id);
    if (section) scores.set(section, Math.max(scores.get(section) ?? 0, area));
  }
  // Page visibility is independent of blocks, so even a blank sheet counts.
  for (const page of root.querySelectorAll<HTMLElement>(
    ".client-page-frame[data-page]",
  )) {
    const key = `page:${page.dataset.page}`,
      area = visibleArea(page);
    if (area && targets.some((t) => t.key === key)) scores.set(key, area);
  }
  return ["section:", "page:"].flatMap((prefix) => {
    const best = [...scores]
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => b[1] - a[1])[0];
    return best ? [best[0]] : [];
  });
}
export function useClientEngagement(
  p: PublicProposal | null,
  token: string,
  password: string,
  preview: boolean,
  reading: boolean,
) {
  const [cycle, setCycle] = useState(0);
  const restartActivity = useRef<"pointer" | "keyboard" | "scroll" | null>(
    null,
  );
  const current = useRef({ p, password });
  current.current = { p, password };
  const control = useRef<{ action: (a: EngagementAction) => void } | null>(
    null,
  );
  const permitted =
    !preview &&
    p?.engagement_allowed === true &&
    ["sent", "viewed"].includes(p.status);
  useEffect(() => {
    if (!permitted || !reading) return;
    let ticket = "",
      starting: Promise<void> | null = null,
      disposed = false,
      stopped = false;
    let targets: EngagementTarget[] = [];
    const session = crypto.randomUUID(),
      viewer = browserId(token),
      clock = new EngagementClock(performance.now());
    const bornAt = Date.now();
    const focus = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const sample = () =>
      clock.step(
        performance.now(),
        focus(),
        current.current.p ? visibleTargets(targets) : [],
      );
    const send = (snapshot: EngagementSnapshot, beacon = false) => {
      if (!ticket) return;
      const body = JSON.stringify({ ticket, snapshot }),
        url = `/api/public/${token}/engagement`;
      if (
        beacon &&
        navigator.sendBeacon?.(
          url,
          new Blob([body], { type: "application/json" }),
        )
      )
        return;
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then((r) => {
          if ([403, 410].includes(r.status)) stopped = true;
        })
        .catch(() => {});
    };
    const flush = (end = false, beacon = false) => {
      sample();
      send(clock.batch(end), beacon);
    };
    const start = (activity: "pointer" | "keyboard" | "scroll") => {
      if (ticket || starting || stopped || !focus()) return;
      // Only trusted, in-page user activity qualifies. Passive HTML/GETs and
      // scanner previews never call this endpoint, even when JavaScript runs.
      starting = (async () => {
        try {
          const response = await fetch(
            `/api/public/${token}/engagement/start`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-proposal-password": current.current.password,
              },
              body: JSON.stringify({
                session_id: session,
                browser_id: viewer,
                device: innerWidth < 700 ? "phone" : "desktop",
                intent: "read",
                activity,
              }),
            },
          );
          if (!response.ok) return;
          const result = await response.json();
          if (!result.ticket) {
            stopped = true;
            return;
          }
          ticket = result.ticket;
          targets = result.targets;
          clock.activity(performance.now());
          sample();
          if (disposed) flush(true, true);
        } catch {
        } finally {
          starting = null;
        }
      })();
    };
    const activity = (event: Event) => {
      if (!event.isTrusted) return;
      const type =
        event.type === "keydown"
          ? "keyboard"
          : ["wheel", "touchmove"].includes(event.type)
            ? "scroll"
            : "pointer";
      if (ticket && (stopped || Date.now() - bornAt >= 4 * 3600000 - 60000)) {
        restartActivity.current = type;
        setCycle((n) => n + 1);
        return;
      }
      sample();
      clock.activity(performance.now());
      start(type);
    };
    const hidden = () => flush(false, true);
    const pagehide = () => flush(true, true);
    const ready = () => sample();
    const resume = (e: PageTransitionEvent) => {
      if (e.persisted) setCycle((n) => n + 1);
    };
    const actions = {
      action: (a: EngagementAction) => {
        clock.action(a);
        flush();
      },
    };
    control.current = actions;
    const timer = setInterval(() => {
      if (ticket && !stopped) sample();
    }, 1000);
    const batch = setInterval(() => {
      if (ticket && !stopped && focus()) flush();
    }, 15000);
    document.addEventListener("pointerdown", activity, { passive: true });
    document.addEventListener("keydown", activity);
    document.addEventListener("wheel", activity, { passive: true });
    document.addEventListener("touchmove", activity, { passive: true });
    document.addEventListener("scroll", ready, {
      passive: true,
      capture: true,
    });
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("client-document-ready", ready);
    window.addEventListener("blur", hidden);
    window.addEventListener("focus", ready);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", resume);
    if (restartActivity.current) {
      const activity = restartActivity.current;
      restartActivity.current = null;
      start(activity);
    }
    return () => {
      disposed = true;
      flush(true, true);
      clearInterval(timer);
      clearInterval(batch);
      if (control.current === actions) control.current = null;
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", activity);
      document.removeEventListener("scroll", ready, true);
      document.removeEventListener("wheel", activity);
      document.removeEventListener("touchmove", activity);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("client-document-ready", ready);
      window.removeEventListener("blur", hidden);
      window.removeEventListener("focus", ready);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", resume);
    };
  }, [permitted, reading, token, cycle, p?.version_no]);
  return {
    choice: (id: string, selected: boolean) =>
      control.current?.action({
        id: crypto.randomUUID(),
        kind: "choice",
        item_id: id,
        selected,
      }),
    download: async (file: string) => {
      if (preview || !p?.engagement_allowed) return;
      // A sealed-copy download is useful after signing, without restarting
      // reading/view tracking or changing the signed proposal.
      try {
        const response = await fetch(`/api/public/${token}/engagement/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-proposal-password": password,
          },
          body: JSON.stringify({
            session_id: crypto.randomUUID(),
            browser_id: browserId(token),
            device: innerWidth < 700 ? "phone" : "desktop",
            intent: "download",
            activity: "pointer",
          }),
        });
        if (!response.ok) return;
        const { ticket } = await response.json();
        if (!ticket) return;
        await fetch(`/api/public/${token}/engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            ticket,
            snapshot: {
              seq: 2,
              active_ms: 0,
              targets: {},
              actions: [
                { id: crypto.randomUUID(), kind: "download", file_id: file },
              ],
              ended: true,
            },
          }),
        });
      } catch {}
    },
  };
}
