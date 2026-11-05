import { proposalBands } from "./page-bands";
import { freezeStyles } from "./proposal-styles";
import { draftItems } from "./quote-model";
import type { Proposal } from "./model";
import type { WorkspaceSettings } from "./workspace";
import { publicResult } from "./service";
import { variables, versionHash } from "./content";
export function previewProposal(
  proposal: Proposal,
  settings: WorkspaceSettings,
) {
  const p = structuredClone(proposal);
  p.workspace_settings =
    p.status === "draft" ? settings : (p.workspace_settings ?? settings);
  if (!p.signers.length) {
    delete p.published_state;
    p.quote = draftItems(p.quote);

    const version = {
      header_footer: proposalBands(p.header_footer),
      id: p.id,
      version_no: 0,

      resolved_styles: freezeStyles(
        p.workspace_settings,
        p.template_style_overrides,
        p.style_overrides,
      ),
      ...(p.pagination ? { pagination: structuredClone(p.pagination) } : {}),
      ...(p.cover ? { cover: p.cover } : {}),
      content: p.content,
      quote: p.quote,
      variables_resolved: variables(p, p.quote),
      content_hash: "",
      created_at: p.created_at,
      frozen: false,
    };
    version.content_hash = versionHash({
      header_footer: version.header_footer,
      ...(version.cover ? { cover: version.cover } : {}),
      content: version.content,
      quote: version.quote,
      variables_resolved: version.variables_resolved,
      resolved_styles: version.resolved_styles,
      pagination: version.pagination,
    });
    p.versions = [version];
  }
  p.status = "sent";
  p.signers = [];
  p.files = [];
  p.billing_links = [];
  p.client_signed_at = null;
  return p;
}

export function previewResult(proposal: Proposal, settings: WorkspaceSettings) {
  return publicResult(previewProposal(proposal, settings), {
    showPoweredBy: settings.show_powered_by !== false,
  });
}
