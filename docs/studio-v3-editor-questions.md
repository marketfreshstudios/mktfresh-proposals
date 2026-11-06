# Studio v3 Phase 1 PR 2 — clarification before editor changes

Base: merged main `5ba1058`. Spec takes precedence over the prototype. No Phase 2 linking/Used in or workspace band inheritance will be added. Existing band controls and built-in Reset to default remain.

1. Template saving: the existing editor saves manually, but the specified header has a save state and no Save action. Proposal: template-only 600ms autosave with the existing serialized save/recovery flow; saved blocks keep their explicit Save. Confirm this rather than silently removing the only save action.
2. Compatible saved-block type conversion is not defined. Proposal: Text ↔ bulleted/numbered List through the existing lossless text-style converter (headings remain text); Contract and Image stay their current type, since converting them would discard structure/image data. Confirm the intended set.
3. The new template layout omits the existing Active template control; saved blocks have no stored creation timestamp/author. Proposal: keep Active template at the bottom of Styles; use existing audit data for edit metadata and show “Creation details not recorded” for existing blocks without a creation record, rather than inventing one or adding fields. Confirm these placements/fallbacks.

The independent Billing defaults/Team polish is implemented first. The requested exact kickoff sentence is display copy only; the neutral-code check exempts that exact sentence in that one component, while still rejecting workspace-specific logic elsewhere.
