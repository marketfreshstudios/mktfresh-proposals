# Editor v2 page sheets — PR 3 owner decisions

Started from latest main `176059a` (merged PR #52). The supplied Redesign 10 prototype was served locally and opened in a browser; the sheet and PAGE 2 transition were inspected. The implementation follows the PR 3 prompt over the broader spec, with no phone redesign before PR 4.

## Old visual assertions

The owner approved replacing only obsolete editor-only visual expectations: 816px paper, desktop zoom, 24px gaps, old editor spacing and the fixed physical page stride. Every PagePlan, PDF page-start/text, frozen-break, keep-together, hash and persistence assertion remains intact. Mixed editor/PDF tests adapt only the display coordinates; their PDF/client checks remain unchanged. Empty-paper hit testing now recognizes a white PageSheet surface, and desktop scroll checks use the visible sheet instead of the removed dashed marker.

## Invisible continuations

The owner approved invisible continuation helpers so a paragraph or list crossing a source boundary stays one editor, retaining selection, formatting and undo history. Visible fillers, dashed lines and old captions are removed. Helpers contribute no text, controls or height to the PDF or canonical page-break measurement.

`paginateBrowser` still measures at the existing resolved PDF/Letter geometry and returns the unchanged PagePlan. Desktop drawing projects those source offsets into responsive sheets without choosing new breaks. Display-only rules exclude the canonical measurement clone; existing helper-exclusion tags remove all visual gaps from that clone. The phone uses the previous drawing path. Break computation, PagePlan, version hashing, document-print.ts and PDF output are unchanged.

No owner question remains pending.
