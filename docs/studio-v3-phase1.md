# Studio v3 — Phase 1, PR 1

Source: `design/studio-v3/specs/studio-v3.md` (spec before prototype before older docs). This PR covers the shell and list pages, Products/detail, Connections, all existing Workspace sections, and Activity. Existing editors and protected proposal behavior remain in place. Phase 2 controls stay hidden.

## Owner decisions needed before the affected controls

1. **Workspace header/footer defaults (§6.4):** `WorkspaceSettingsSchema` stores `proposal_styles` and `proposal_fonts`, but no header/footer settings. `WorkspaceStudio` does not pass header/footer data to `ProposalStyles`; bands currently exist only on templates/proposals. Should this Phase 1 PR add persisted workspace band defaults and their inheritance, or omit the workspace band controls until separately scoped? Existing template/proposal band editing remains unchanged either way.
2. **Default link validity “Never” (§6.8):** `default_validity_days` is a required integer from 1–365. Individual proposals can already be indefinite, but the workspace creation default cannot. Should this Phase 1 PR extend that existing setting/default-creation behavior to support an indefinite workspace default, or keep the existing days-only control for now?

No hosted resources or credentials are used for implementation or testing. Hosted SQL needs will be stated explicitly after the scope decisions.
