# Editor follow-up comparison

The baseline is merged PR #38 (`c8152fb`). The new screenshots use the same document fixture for the archived before/current document views. The control and Fields suites use separate labelled test fixtures. All data is local test data.

| Surface | Design reference | Owner-directed differences |
| --- | --- | --- |
| Document/editor, desktop | [Frame 2a](../editor-ux/reference-2a-light.png) | Cover remains the only title. Formatting is pinned; selected block actions occupy a permanent left gutter. Labelled amber review stays with the block. Authoring insertion gaps/gutter are intentional; client reading spacing is unchanged. |
| Phone section editor | [Frame 2c](../editor-ux/reference-2c-light.png) | Same reading/editing flow, with the owner-requested pinned formatting bar, touch-sized gutter actions and edge insertion. Fields opens a sheet. |
| Review & send | Redesign 02 frame 2f | Valid until, including its clear/indefinite control, belongs here. The bottom document insertion/date row is removed. |
| Templates & blocks | [Frame 7a](../editor-ux/reference-7a-light.png) | The same rail, named reuse dialog, Undo and field picker apply to template blocks and clauses. Template insertion is on the edges or slash; its old inspector insertion/deletion rows are removed. |
| Fields | Frame 2a Fields region | The owner's new grouped label/value/token rows replace Show names. Search covers friendly labels and tokens; insertion restores the last text selection. |
| Emails | Existing Studio Emails page | Subject and body pickers use the same labelled/searchable options and remembered selection. Email content/sending authority is unchanged. |

Captured at 1440/375, light/dark, with additional 768 Fields captures. The supplied Redesign 02/07 sources have light reference frames; dark captures use the existing supplied theme tokens, with white proposal paper. Owner instructions take precedence over the older purple review rows, floating toolbar and Show names control in the source frames.

Automated checks measure every block's bounding box and scroll position across hover/focus/touch (at most 1px movement), and ensure selected gutter/edge controls do not intersect another block's visible text. Reading-shape checks normalize the intentional editing gutter's usable text width. Click-outside, another block, own dialogs/formatting, save failure/success, Undo, template edge/slash insertion and field cursor/selection restoration are covered.

PDF evidence:

- [Long proposal](long-proposal.pdf): 11 pages including its preview certificate; editor count equals generated PDF count. Every repeated scope sentence is retained.
- [Whole pricing group](long-pricing-group.pdf): the complete choice group moves to a new page, retaining both alternatives, descriptions and amounts. Extra whitespace is intentional under the no-splitting rule.
- [Rendered-page contact sheet](pdf-contact-sheet.png): long document, complete choice group and a fully signed test proposal. Actual signatures and the certificate remain intact.
- Oversized pricing units and signature blocks fail explicitly; they are never split or clipped. The editor uses the same trusted paginator and maps pricing boundaries to whole unit IDs.

No hosted or provider operations were performed. See HANDOFF_PHASE2.md for final check results and remaining owner acceptance work.
