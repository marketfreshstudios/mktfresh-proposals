import { check, AppError } from "./model";
import { sha256 } from "./content";
import type { Storage } from "./storage";
import type { WorkspaceSettings } from "./workspace";

export const iconSizes = [16, 32, 128, 180] as const;
export function workspaceIconPath(
  path: string,
  workspace: string,
  size: number,
) {
  check(
    iconSizes.includes(size as (typeof iconSizes)[number]),
    "Invalid icon size",
  );
  check(
    new RegExp(`^${workspace}/[a-f0-9]{64}\\.png$`).test(path),
    "Icon must belong to this workspace",
  );
  return path.replace(/\.png$/, `-icon-${size}.png`);
}
export async function uploadWorkspaceIcon(
  storage: Storage,
  workspace: string,
  input: { image?: string; name?: string },
) {
  check(
    typeof input.image === "string" &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.image),
    "PNG icon required (SVG is not supported)",
  );
  const bytes = Buffer.from(input.image.split(",")[1], "base64");
  check(bytes.length < 750000, "Logo icon must be under 750 KB");
  check(
    bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    "Valid PNG icon required",
  );
  const sharp = (await import("sharp")).default;
  const path = `${workspace}/${sha256(bytes)}.png`;
  let variants: Buffer[];
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16777216,
      failOn: "warning",
    });
    const meta = await image.metadata();
    check(
      meta.format === "png" && (meta.pages ?? 1) === 1,
      "A single PNG image is required",
    );
    check(
      meta.width === meta.height && meta.width >= 128,
      "Logo icon must be square and at least 128 × 128 pixels",
    );
    variants = await Promise.all(
      iconSizes.map((size) =>
        image.clone().resize(size, size).png().toBuffer(),
      ),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      "Valid PNG icon required (maximum 4096 × 4096 pixels)",
    );
  }
  await storage.put(path, bytes);
  await Promise.all(
    iconSizes.map((size, i) =>
      storage.put(workspaceIconPath(path, workspace, size), variants[i]),
    ),
  );
  return {
    path,
    name:
      typeof input.name === "string"
        ? input.name.slice(0, 255).trim() || "Workspace icon.png"
        : "Workspace icon.png",
    size: bytes.length,
  };
}
export async function readWorkspaceIcon(
  storage: Storage,
  workspace: string,
  icon: WorkspaceSettings["logo_icon"],
  size: number,
) {
  check(icon, "Icon unavailable", 404);
  return storage.get(workspaceIconPath(icon.path, workspace, size));
}
