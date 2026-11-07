/** Shared logo element: a wide logo, otherwise an icon with the workspace name. */
export function workspaceBrand(
  logo?: string | null,
  icon?: string | null,
  name = "",
) {
  return logo ? { src: logo, name: "" } : { src: icon || undefined, name };
}
export function coverBrand(
  cover: { logo?: string | null; logo_mode?: "brand" },
  logo?: string,
  icon?: string,
  name = "",
) {
  if (cover.logo === null) return { src: undefined, name: "" };
  if (cover.logo) return { src: cover.logo, name: "" };
  return cover.logo_mode === "brand"
    ? workspaceBrand(logo, icon, name)
    : { src: logo, name: "" };
}

export function usesWorkspaceBrand(value: {
  cover?: { logo_mode?: string };
  header_footer?: unknown;
}) {
  return (
    value.cover?.logo_mode === "brand" ||
    JSON.stringify(value.header_footer ?? {}).includes('"workspace-brand"')
  );
}

/** Automatic icon defaults fit the name; non-default authored heights are retained. */
export function brandIconHeight(kind: "cover" | "band", stored?: number) {
  const originalDefault = kind === "cover" ? 60 : 18;
  return stored === undefined || stored === originalDefault
    ? kind === "cover"
      ? 26
      : 16
    : stored;
}
