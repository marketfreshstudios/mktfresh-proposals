import { marked, type Token } from "marked";
import { check } from "./model";
import { validateCoverImage } from "./brand-palette";
import type { MarkdownImages } from "./markdown";
/** The connector deliberately shares Studio's embedded PNG/JPEG validator.
 * No asset store, remote requests, re-encoding or EXIF stripping is introduced. */
export async function uploadConnectorImage(input: {
  filename: string;
  content_base64: string;
  alt: string;
}) {
  const extension = /\.(png|jpe?g)$/i.exec(input.filename)?.[1]?.toLowerCase();
  check(
    extension,
    "Choose a PNG or JPEG filename; SVG and WebP are not supported by Studio",
  );
  check(
    input.content_base64.length > 0 &&
      input.content_base64.length < 933336 &&
      input.content_base64.length % 4 === 0 &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(input.content_base64) &&
      Buffer.from(input.content_base64, "base64").toString("base64") ===
        input.content_base64,
    "Provide valid base64 image bytes under 700 KB",
  );
  const image_ref = `data:image/${extension === "png" ? "png" : "jpeg"};base64,${input.content_base64}`;
  await validateCoverImage(image_ref);
  return { image_ref };
}
export async function markdownImages(
  markdown: string,
  preserved = new Set<string>(),
): Promise<MarkdownImages> {
  const refs = new Set<string>();
  marked.walkTokens(marked.lexer(markdown), (token: Token) => {
    if (token.type === "image") refs.add(token.href);
  });
  const images = new Map<
    string,
    Awaited<ReturnType<typeof validateCoverImage>>
  >();
  for (const ref of refs) {
    try {
      check(
        /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(ref),
        "Unsupported Markdown image: use the embedded PNG/JPEG image_ref returned by upload_image; remote URLs, unknown and other-workspace references are not allowed",
      );
      images.set(ref, await validateCoverImage(ref));
    } catch (error) {
      if (!preserved.has(ref)) throw error;
    }
  }
  return images;
}
