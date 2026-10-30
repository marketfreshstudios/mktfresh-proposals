import type { Proposal } from "./model";
import type { WorkspaceSettings } from "./workspace";
import { publicResult } from "./service";
import { variables, versionHash } from "./content";
export function previewResult(proposal: Proposal, settings: WorkspaceSettings) {
  const p = structuredClone(proposal);
  p.workspace_settings =
    p.status === "draft" ? settings : (p.workspace_settings ?? settings);
  if (p.status === "draft" || !p.versions.length) {
    const version = {
      id: p.id,
      version_no: 0,
      client_flow_version: 2 as const,
      content: p.content,
      quote: p.quote,
      variables_resolved: variables(p),
      content_hash: "",
      created_at: p.created_at,
      frozen: false,
    };
    version.content_hash = versionHash(version);
    p.versions = [version];
  }
  p.status = "sent";
  p.signers = [];
  p.files = [];
  p.billing_links = [];
  p.client_signed_at = null;
  return publicResult(p);
}
