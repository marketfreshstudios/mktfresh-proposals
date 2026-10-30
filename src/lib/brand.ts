export function whiteContrast(hex: string) {
  const rgb = hex
    .replace("#", "")
    .match(/../g)!
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05);
}
/** Darken RGB channels proportionally, preserving the hue. */
export function accessibleAccent(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((n) => parseInt(n, 16));
  for (let factor = 1; factor >= 0; factor -= 0.01) {
    const candidate =
      "#" +
      rgb
        .map((n) =>
          Math.round(n * factor)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (whiteContrast(candidate) >= 4.5) return candidate;
  }
  return "#000000";
}
