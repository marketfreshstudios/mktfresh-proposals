# Editor v2 page sheets — PR 3 preflight

Starting point: latest main `176059a` (merged PR #52). The supplied Redesign 10 prototype was served locally and opened in a browser; the white sheet and PAGE 2 transition were inspected. No application code has changed.

The owner requires a drawing-only change, with responsive 760px sheets, 52px gaps, 12px/22px block spacing and no desktop zoom. PagePlan, the version hash, document-print.ts, PDF output and break computation remain unchanged. The request also says: “If the spec is silent, or it contradicts the prototype or this prompt, stop and ask in the PR.”

## 1. Old visual assertions conflict with the new presentation

Existing tests assert the presentation being replaced:

- `e2e/editor-round3.spec.ts:174` requires 816px paper; lines 183–185 require the zoom control and its 100% action.
- `e2e/editor-round5.spec.ts:140` requires a 24px sheet gap.
- The spacing test in `e2e/editor-round5.spec.ts:172` compares the visible editor with current PDF/client spacing (including 27.5px heading gaps and 9.6px paragraph gaps), while the new editor requires 12px/22px block gaps.
- `e2e/editor-ux.spec.ts:252` requires 816px editor paper and 72px padding.
- The keep-together test in `e2e/live-pagination.spec.ts:256` derives the editor's page occupancy from the old 1080px physical stride. Responsive sheets can grow independently while retaining the same frozen source boundaries.

May these editor-only visual assertions be replaced with the new presentation checks, while leaving PagePlan, PDF text/page-start, keep-together, frozen-break, hash and persistence assertions intact? For mixed editor/PDF tests, the PDF/client assertions would stay unchanged.

## 2. Invisible continuation helpers versus removing spacers

`paginateBrowser` already measures a hidden clone at the resolved PDF/Letter width, and PagePlan records source offsets inside paragraphs, lists, clauses and pricing units. `page-spacers.tsx` applies visual-only Tiptap/plain-text decorations at those offsets so a paragraph remains one editor with its existing selection, formatting, autosave and undo history. The stored content never contains these decorations.

May invisible boundary helpers remain between the new independently drawn sheets, while visible fillers, dashed lines, captions and old markers are removed? This preserves one editable block and existing handlers for paragraphs/lists continuing across pages. The alternative—physically splitting one editable block among PageSheet children—needs continuation editing/control semantics not specified by this re-layout brief.

The proposed boundary is: unchanged canonical measurement and PagePlan; new display-only responsive sheet positioning and spacing; invisible continuation decorations only where needed to project a frozen source boundary. The visible sheet styling must not enter the canonical measurement clone or change PDF output. No API, migration, hash or document-print changes.

## Work after the answers

Implement shared PageSheet drawing in proposal and template editors, remove desktop scaling/zoom, preserve phone behavior below 700px, add empty-sheet insertion and the requested responsive/selection/numbering tests, retain the existing frozen-PDF tests, update HANDOFF_PHASE2.md, and include exactly the requested 1440/1024/375 captures. Hand back after local checks without waiting for CI.
