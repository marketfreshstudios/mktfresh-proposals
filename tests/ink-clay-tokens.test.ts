import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { colorContrast } from "../src/lib/brand";

const palette = readFileSync(
  new URL("../src/app/ink-clay-tokens.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
const light = ".staff-foundation.ink-clay";
const dark = '[data-theme="dark"] ' + light;

function values(selector: string) {
  return Object.fromEntries(
    [...palette.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
      .filter(([, name]) => name.trim() === selector)
      .flatMap(([, , block]) =>
        [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [
          k,
          v.trim(),
        ]),
      ),
  );
}
const channels = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((n) => parseInt(n, 16));
function composite(overlay: string, ground: string) {
  const parts = overlay.match(/^rgba\((.+)\)$/);
  if (!parts) return overlay;
  const [r, g, b, alpha] = parts[1].split(",").map(Number);
  return (
    "#" +
    channels(ground)
      .map((base, i) =>
        Math.round(base * (1 - alpha) + [r, g, b][i] * alpha)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

it.each(["light", "dark"])("%s staff text pairs reach 4.5:1", (theme) => {
  const tokens = {
    ...values(light),
    ...(theme === "dark" ? values(dark) : {}),
  };
  function color(key: string): string {
    const v = tokens[key];
    expect(v, key).toBeTruthy();
    const alias = v.match(/^var\(--([\w-]+)\)$/);
    return alias ? color(alias[1]) : v;
  }
  function check(ink: string, bg: string, under?: string) {
    const background = under ? composite(color(bg), color(under)) : color(bg);
    expect(
      colorContrast(color(ink), background),
      `${theme} --${ink} on --${bg}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
  for (const ink of ["ink", "ink-title", "ink-muted", "link"]) {
    for (const bg of [
      "surface",
      "surface-page",
      "surface-sunken",
      "surface-raised",
      "segment",
      "surface-deep",
    ])
      check(ink, bg);
  }
  for (const ink of ["chrome-ink", "chrome-muted", "ai-on-chrome"]) {
    check(ink, "chrome");
    check(ink, "chrome-raised", "chrome");
    check(ink, "chrome-on", "chrome");
  }
  for (const ink of ["hero-ink", "hero-muted", "hero-body"]) check(ink, "hero");
  check("on-action", "action");
  check("on-action", "action-hover");
  check("ai-text", "surface");
  check("ai-text", "ai-soft", "surface");
  check("toast-ink", "toast");
  check("toast-muted", "toast");
  for (const stage of [
    "draft",
    "sent",
    "viewed",
    "won",
    "review",
    "lost",
    "expired",
  ]) {
    check(`st-${stage}-ink`, `st-${stage}-soft`);
  }
  for (const ink of ["success", "info", "warning", "danger", "neutral"]) {
    check(ink, "surface");
    check(ink, "surface-page");
    check(ink, `${ink}-soft`);
  }
});
