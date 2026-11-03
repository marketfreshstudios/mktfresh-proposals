# Editor v2 block controls — owner decisions before implementation

PR 2 starts from merged PR 1 on main `66139aa`. Redesign 10 was served locally and opened in the browser, including selected paragraph and cover controls. No application code or behavior has changed.

The request says both “RE-LAYOUT only. Keep every existing command and handler” and “If the spec is silent, or it contradicts the prototype or this prompt, stop and ask in the PR. Don't guess.” These concrete gaps need owner decisions:

## 1. Cover actions have no existing handlers

Redesign 10 shows a Cover toolbar with Move down, Duplicate, Save and Delete, plus gutter insertion controls. The application renders DocumentCover separately from the content block array (proposal.title and client/workspace metadata). It is not a BlockFrame/Sortable block, and has no existing move/duplicate/remove/reuse handler. Making the cover behave like a content block would require new model/command semantics outside this re-layout.

Should PR 2 keep the fixed cover/title editing as it is with no new cover toolbar, or show a cover toolbar with unsupported actions visibly disabled? Adding a movable/deletable cover model would need separately specified behavior rather than mapping its actions onto the first content block.

## 2. Retain commands missing from the exact new toolbar

The existing desktop formatting bar/action rail exposes Start on next page / Remove page break and, on contracts, Add clause. Nested clauses also have settings, move, save and delete commands. The new exact toolbar list has no slot for Start on next page or Add clause, while removing the old desktop controls would remove those command entry points.

Where should these existing commands remain accessible? A compact More block actions menu in the new bar could retain their unchanged handlers; alternatively, specify a Settings-sheet location. Contract settings currently edits a selected existing clause and is absent for an empty contract, so that route alone would not preserve Add clause on empty contracts.

## 3. Duplicate on pricing and signature blocks

Both proposal and template editors currently omit Duplicate for pricing_table and signature_block. The request/prototype puts Duplicate on every block. Showing an enabled Duplicate for these two types expands current command availability and can create drafts with duplicate required structures, which readiness may then reject.

Should their Duplicate control remain disabled to preserve the current restrictions, or should PR 2 explicitly enable the existing duplicateBlock helper for them too?

## Work after clarification

Implement the agreed layout under components/editor with the supplied icons, reuse PR 1 compact, retain the current phone presentation under renamed legacy components/selectors, preserve save/review/history/pagination/API handlers, and add the requested conversion, toolbar geometry, selection, keyboard, insertion, AI review and Studio tests. Run the full local browser suite and other local checks, add only the requested 1440/1024/375 captures, update the handoff, and hand back the one PR without waiting for CI.
