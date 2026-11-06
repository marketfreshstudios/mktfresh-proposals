# Studio v3 Phase 1 PR 2 — resolved owner decisions

Base: merged main `5ba1058`. Spec takes precedence over the prototype. Phase 2 linking/Used in and workspace band inheritance remain deferred. Existing template band controls and built-in Reset to default remain.

- Templates autosave after 600ms through the serialized save/recovery flow. Undo/redo survives autosaves. Saved blocks retain explicit Save.
- Safe saved-block conversions: Text ↔ bulleted/numbered List, preserving fields and marks. Contract and Image retain their type, with “This block type can't be changed”.
- “Available for new proposals” lives in the template header menu. Off means “Hidden from new proposals” in the editor and list. Metadata only displays existing records; missing creation evidence is omitted.
- Contract clauses remain plain strings in Phase 1. Their editor offers plain-text editing, field insertion and existing clause operations. Rich contract clause formatting is deferred; no data or renderer changes.
- Billing defaults uses the owner's exact kickoff sentence as display copy only. No product-specific billing logic was added. Team removal retains its reassignment guard.
