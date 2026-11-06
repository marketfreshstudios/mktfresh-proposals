import sharp from "sharp";
/** Neutral, embedded workspace asset for cover and PDF regression fixtures. */
export async function starterLogo() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="64"><rect width="64" height="64" rx="12" fill="#13303a"/><path d="M16 16h32v8H24v8h20v8H24v8h24v8H16z" fill="white"/><text x="78" y="43" font-family="sans-serif" font-size="28" fill="#13303a">Example Studio</text></svg>',
    ),
  )
    .png()
    .toBuffer();
}
