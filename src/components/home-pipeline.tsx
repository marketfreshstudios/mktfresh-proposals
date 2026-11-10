"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { withCount } from "../lib/count-label";
import {
  homePipeline,
  pipelineStages,
  zeroPipelineAmounts,
  type HomePipelineSummary,
  type PipelineAmounts,
} from "../lib/home-pipeline";
import type { Proposal } from "../lib/model";
import {
  homePipelineRanges,
  type HomePipelineRange,
} from "../lib/staff-account-model";
import { useMoney } from "./money-context";
import { useStaffAccount } from "./staff-account-context";

const labels: Record<HomePipelineRange, string> = {
  month: "This month",
  "3-months": "3 months",
  "6-months": "6 months",
  year: "This year",
  all: "All time",
};

function track(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count) => ({
    share: total ? count / total : 0,
    presence: count ? 1 : 0,
  }));
}

function usePipelineMotion(summary: HomePipelineSummary) {
  const target = useMemo(
    () => ({ ...summary, segments: track(summary.counts) }),
    [summary],
  );
  const [shown, setShown] = useState(target);
  const latest = useRef(target);
  useLayoutEffect(() => {
    if (latest.current === target) return;
    const from = latest.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function draw(value: typeof target) {
      latest.current = value;
      setShown(value);
    }
    function finish() {
      cancelAnimationFrame(frame);
      draw(target);
    }
    if (reduced.matches) {
      finish();
      return;
    }
    const start = performance.now();
    function tick(time: number) {
      const elapsed = Math.max(0, time - start);
      if (elapsed >= 500) {
        finish();
        return;
      }
      const numbers = ease(elapsed / 500);
      const widths = ease(Math.min(1, elapsed / 400));
      const amounts = Object.fromEntries(
        Object.entries(target.amounts).map(([currency, end]) => {
          const begin = from.amounts[currency] ?? zeroPipelineAmounts;
          return [
            currency,
            {
              month: amountAt(begin.month, end.month, numbers),
              once: amountAt(begin.once, end.once, numbers),
              year: amountAt(begin.year, end.year, numbers),
            },
          ];
        }),
      );
      draw({
        amounts,
        counts: target.counts.map((n, i) =>
          Math.round(interpolate(from.counts[i], n, numbers)),
        ),
        segments: target.segments.map((segment, i) => ({
          share: interpolate(from.segments[i].share, segment.share, widths),
          presence: interpolate(
            from.segments[i].presence,
            segment.presence,
            widths,
          ),
        })),
      });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const onPreference = () => {
      if (reduced.matches) finish();
    };
    reduced.addEventListener("change", onPreference);
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", onPreference);
    };
  }, [target]);
  return shown;
}

const ease = (progress: number) => 1 - (1 - progress) ** 3;
const interpolate = (start: number, end: number, progress: number) =>
  start + (end - start) * progress;
function amountAt(start: number, end: number, progress: number) {
  const increment = start % 100 === 0 && end % 100 === 0 ? 100 : 1;
  return Math.round(interpolate(start, end, progress) / increment) * increment;
}

export function HomePipeline({
  proposals,
  timezone,
  currency = "USD",
  savedRange,
}: {
  proposals: Proposal[];
  timezone: string;
  currency?: string;
  savedRange?: HomePipelineRange;
}) {
  const money = useMoney();
  const account = useStaffAccount();
  const [range, setRange] = useState(savedRange ?? "month");
  const [saveError, setSaveError] = useState(false);
  const choice = useRef(0);
  const allTime = useMemo(
    () => homePipeline(proposals, "all", new Date(), timezone),
    [proposals, timezone],
  );
  const summary = useMemo(() => {
    const next =
      range === "all"
        ? allTime
        : homePipeline(proposals, range, new Date(), timezone);
    // Keep rows and interval columns in place as currencies enter or leave a range.
    const currencies = Object.keys(allTime.amounts);
    const amounts = Object.fromEntries(
      (currencies.length ? currencies : [currency]).map((code) => [
        code,
        next.amounts[code] ?? zeroPipelineAmounts,
      ]),
    );
    return { ...next, amounts };
  }, [allTime, proposals, range, timezone, currency]);
  const shown = usePipelineMotion(summary);
  const total = (value: HomePipelineSummary) =>
    withCount(
      value.counts.reduce((sum, n) => sum + n, 0),
      "proposal",
    );
  const empty = summary.counts.every((count) => count === 0);
  let previousPresence = 0;

  function select(next: HomePipelineRange) {
    const request = ++choice.current;
    setRange(next);
    setSaveError(false);
    void account
      ?.save({ home_pipeline_range: next }, undefined, { quiet: true })
      .catch(() => {
        if (choice.current === request) setSaveError(true);
      });
  }
  function amount(
    value: PipelineAmounts,
    key: keyof PipelineAmounts,
    code: string,
    label: string,
    suffix?: string,
  ) {
    const largest = money(allTime.amounts[code]?.[key] ?? 0, code);
    // Reserve room for cents when the all-time amount happens to round to dollars.
    const figureWidth = [...largest].reduce(
      (width, character) =>
        width +
        (/[0-9]/.test(character)
          ? 0.54
          : /[.,\s]/.test(character)
            ? 0.32
            : 0.75),
      largest.includes(".") ? 0 : 1.4,
    );
    return (
      <div>
        <strong
          className="t-hero-number"
          data-pipeline-amount={key}
          aria-hidden="true"
          style={
            {
              "--pipeline-figure-width": figureWidth,
              "--pipeline-suffix-width": suffix ? "32px" : "0px",
            } as CSSProperties
          }
        >
          <span className="home-pipeline-figure">
            {[...money(value[key], code)].map((character, index) =>
              /[0-9]/.test(character) ? (
                <span className="home-pipeline-digit" key={index}>
                  {character}
                </span>
              ) : (
                character
              ),
            )}
            {suffix && <small>{suffix}</small>}
          </span>
        </strong>
        <span className="sr-only">
          {money(summary.amounts[code][key], code)}
          {suffix}
        </span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <section className="home-pipeline" aria-labelledby="home-pipeline-title">
      <header className="home-pipeline-heading">
        <h2 id="home-pipeline-title">
          Pipeline <span aria-hidden="true">|</span>{" "}
          <span data-pipeline-count aria-hidden="true">
            {total(shown)}
          </span>
          <span className="sr-only">{total(summary)}</span>
        </h2>
        <fieldset className="home-pipeline-range">
          <legend className="sr-only">Pipeline date range</legend>
          {homePipelineRanges.map((option) => (
            <label key={option}>
              <input
                className="sr-only"
                type="radio"
                name="home-pipeline-range"
                value={option}
                checked={range === option}
                onChange={() => select(option)}
              />
              <span>{labels[option]}</span>
            </label>
          ))}
        </fieldset>
      </header>
      {saveError && (
        <p className="home-pipeline-save-error" role="status">
          Couldn’t remember this range.{" "}
          <button type="button" onClick={() => select(range)}>
            Try again
          </button>
        </p>
      )}
      {Object.keys(summary.amounts)
        .sort()
        .map((code) => {
          const value = shown.amounts[code] ?? zeroPipelineAmounts;
          return (
            <div
              key={code}
              className={`home-pipeline-amounts${empty ? " home-pipeline-zero" : ""}`}
              aria-label={code}
            >
              {amount(value, "month", code, "Recurring", "/mo")}
              {amount(value, "once", code, "One-time")}
              {Boolean(allTime.amounts[code]?.year) &&
                amount(value, "year", code, "Yearly", "/yr")}
            </div>
          );
        })}
      <div className="home-pipeline-progress">
        <div className="home-pipeline-bar" aria-hidden="true">
          {pipelineStages.map(({ view }, index) => {
            const { share, presence } = shown.segments[index];
            if (!presence) return null;
            const gap = 2 * Math.min(previousPresence, presence);
            previousPresence = presence;
            return (
              <span
                key={view}
                data-stage={view}
                style={{ flexGrow: share, marginInlineStart: gap }}
              />
            );
          })}
        </div>
        <ul className="home-pipeline-legend" role="list">
          {pipelineStages.map(({ view, label }, i) => (
            <li key={view} data-stage={view}>
              <a href={`/proposals?view=${view}`}>
                <span aria-hidden="true" data-pipeline-stage-count>
                  {shown.counts[i]} {label}
                </span>
                <span className="sr-only">
                  {summary.counts[i]} {label}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
