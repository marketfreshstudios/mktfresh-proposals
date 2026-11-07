export const validHex = (value: string) => /^#[\da-f]{6}$/i.test(value);
export function hexToHsv(hex: string) {
  const [r, g, b] = (hex.match(/[\da-f]{2}/gi) ?? ["00", "00", "00"]).map(
    (v) => parseInt(v, 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h =
    d === 0
      ? 0
      : max === r
        ? ((g - b) / d + 6) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}
export function hsvToHex({ h, s, v }: { h: number; s: number; v: number }) {
  const c = v * s,
    x = c * (1 - Math.abs((((h % 360) / 60) % 2) - 1)),
    m = v - c;
  const rgb =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    rgb
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
/** Preserve saved colors/order. Add only distinct suggestions that fit. */
export function acceptBrandSuggestions(
  primary: string,
  palette: string[],
  suggestions: string[],
) {
  const next = [...palette],
    added: string[] = [];
  for (const color of suggestions)
    if (
      next.length < 4 &&
      ![primary, ...next].some((c) => c.toLowerCase() === color.toLowerCase())
    ) {
      next.push(color);
      added.push(color);
    }
  return {
    palette: next,
    remaining: suggestions.filter(
      (c) =>
        ![primary, ...next].some((n) => n.toLowerCase() === c.toLowerCase()),
    ),
    added,
  };
}
