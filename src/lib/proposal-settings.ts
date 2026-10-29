import type { Proposal } from "./model";
import { WorkspaceSettingsSchema, type WorkspaceSettings } from "./workspace";

/** Public-facing proposal settings omit stored signature assets and staff authorization. */
export function settingsSnapshot(
  settings: WorkspaceSettings,
): WorkspaceSettings {
  const parsed = WorkspaceSettingsSchema.parse(structuredClone(settings));
  return {
    ...parsed,
    company_signatory: parsed.company_signatory
      ? { ...parsed.company_signatory, image: null, authorized_user_ids: [] }
      : null,
  };
}
export function withDraftSettings(
  p: Proposal,
  current?: WorkspaceSettings | null,
): Proposal {
  return p.status === "draft" && current
    ? { ...p, workspace_settings: settingsSnapshot(current) }
    : p;
}
