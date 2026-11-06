import { check, AppError } from "./model";
/** Suggestions are returned for review, never assigned to workspace settings. */
export async function extractBrandPalette(bytes: Uint8Array) {
  try {
    const sharp = (await import("sharp")).default;
    const { data } = await sharp(bytes, {
      limitInputPixels: 16777216,
      failOn: "warning",
    })
      .resize(64, 64, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bins = new Map<
      string,
      { n: number; r: number; g: number; b: number }
    >();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = data.subarray(i, i + 4);
      if (
        a < 200 ||
        Math.max(r, g, b) < 45 ||
        Math.min(r, g, b) > 235 ||
        Math.max(r, g, b) - Math.min(r, g, b) < 25
      )
        continue;
      const key = [r, g, b].map((v) => Math.floor(v / 32)).join("-"),
        bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bins.set(key, bin);
    }
    const chosen: number[][] = [];
    for (const bin of [...bins.values()].sort((a, b) => b.n - a.n)) {
      const rgb = [bin.r, bin.g, bin.b].map((v) => Math.round(v / bin.n));
      if (chosen.some((c) => Math.hypot(...c.map((v, n) => v - rgb[n])) < 60))
        continue;
      chosen.push(rgb);
      if (chosen.length === 5) break;
    }
    return chosen.map(
      (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""),
    );
  } catch {
    return [];
  }
}
/** Cover uploads share existing embedded PNG/JPEG limits, with real decode/dimension validation. */
export async function validateCoverImage(value: unknown) {
  check(
    typeof value === "string" &&
      /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value),
    "Choose a PNG or JPEG image",
  );
  const bytes = Buffer.from(value.split(",")[1], "base64");
  check(bytes.length < 700000, "Choose an image under 700 KB");
  check(
    bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ||
      bytes.subarray(0, 3).toString("hex") === "ffd8ff",
    "Choose a valid PNG or JPEG image",
  );
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(bytes, {
      limitInputPixels: 16777216,
      failOn: "warning",
    }).metadata();
    check(
      ["png", "jpeg"].includes(meta.format ?? "") &&
        (meta.pages ?? 1) === 1 &&
        !!meta.width &&
        !!meta.height,
      "Choose a valid PNG or JPEG image",
    );
    return { image: value, width: meta.width!, height: meta.height! };
  } catch {
    throw new AppError(
      400,
      "Choose a valid PNG or JPEG (maximum 16 megapixels)",
    );
  }
}
