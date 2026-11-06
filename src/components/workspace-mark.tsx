import type { WorkspaceSettings } from "../lib/workspace";
export function WorkspaceMark({
  settings,
}: {
  settings?: WorkspaceSettings | null;
}) {
  return settings?.logo_icon ? (
    <img
      className="workspace-mark"
      src={`/api/workspace-icon?size=128&v=${encodeURIComponent(settings.logo_icon.path)}`}
      alt=""
      aria-hidden="true"
    />
  ) : (
    <span className="avatar workspace-mark" aria-hidden="true">
      {settings?.company_name.slice(0, 1) || "W"}
    </span>
  );
}
