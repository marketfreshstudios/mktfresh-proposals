# Studio v3 — email editor (PR #81)

The Studio v3 spec governs the prototype. The editor uses the existing real email renderer and current defaults, with shared editor v2 headers, field chips, selection handling, formatting, history, drawers/sheets, dialogs and toasts. There are no sending, validation, template/proposal storage, permissions, signing, billing or pagination changes, and no hosted SQL.

Subject, rich body and primary-button label edit in place. Fields insert at the remembered subject/body cursor, including when the phone sheet closes. Explicit Save retains edits on failure and Retry saves them. Default/reset state tolerates stored JSONB key ordering and equivalent field chips. Reset confirms and offers persistent Undo. Read-only notifications expose Details and Plain text, with no editing or Save. Test delivery still uses the existing self-only endpoint.

Show fields paints friendly chips; Show values uses the built-in sample or recent proposal through the existing email-value resolver. Desktop/375px phone frames and Dark use the actual mail layout and styles. Plain text comes directly from that renderer. The preview endpoint adds display-only recipient/sender context for Details; it doesn't change rendering or sending. Old `/emails/:key` URLs redirect to `/studio/emails/:key`.

Owner clarification: picker restrictions are presentation only. Team offers team/sender/workspace; Job offers job/proposal; clients offer client/proposal/quote/sender/workspace. Existing saved fields and global server validation remain compatible. Server-side per-email allow-lists are deferred. B, I, both lists, Link and Field stay visible; Size and history remain in More, with keyboard history. The existing size picker can expand inside More without opening a competing nested popover.

The canvas uses stable editor portal targets inside the real mail markup so preview refreshes don't remount the editor or reset a selection. Mail table defaults are isolated from staff table styling. Decorative numbered-list SVG text is reused through a symbol, retaining the supplied vector while preventing its digits from becoming a visible text label for voice-control checks.

## Carry-over

- Template tabs read Quote · Fields · Blocks · Styles; the Quote panel heading remains Default quote.
- Template and saved-block phone controls use two rows, keep the labelled Field action visible and retain block commands in More. Proposal controls are unchanged.
- Workspace save metadata has the normal 16px right inset and is centered in the saved banner.
- Brand uploads use equal columns at 1024px and above and stack below it. Titles and muted usage lines are separate; wide previews are 48px tall and icons 64px square. File metadata/actions and the shared hint remain; validation and autosave are unchanged.

## Reference comparisons

Local, neutral fixtures only. The spec deliberately keeps the current real email copy, title, workspace branding, staff product line, generated facts and footer instead of the prototype's illustrative copy. The panel is the spec's 400px shared panel. No native inbox-service screenshots are claimed.

| View | Reference pair | Full local capture | Reference |
| --- | --- | --- | --- |
| Fields and selected body | [Pair](screenshots/studio-v3-email/comparison-email-fields.png) | [1440](screenshots/studio-v3-email/email-fields-1440.png) | [07-email-editor](../design/studio-v3/reference/07-email-editor.png) |
| Show values | [Pair](screenshots/studio-v3-email/comparison-email-values.png) | [1440](screenshots/studio-v3-email/email-values-1440.png) | [07-email-values](../design/studio-v3/reference/07-email-values.png) |
| Details | [Pair](screenshots/studio-v3-email/comparison-email-details.png) | [1440](screenshots/studio-v3-email/email-details-1440.png) | [07-email-Details](../design/studio-v3/reference/07-email-Details.png) |
| Plain text | [Pair](screenshots/studio-v3-email/comparison-email-plain-text.png) | [1440](screenshots/studio-v3-email/email-plain-text-1440.png) | [07-email-Plain-text](../design/studio-v3/reference/07-email-Plain-text.png) |
| Dark | [Pair](screenshots/studio-v3-email/comparison-email-dark.png) | [1440](screenshots/studio-v3-email/email-dark-1440.png) | [07-email-dark](../design/studio-v3/reference/07-email-dark.png) |
| Read-only staff | [Pair](screenshots/studio-v3-email/comparison-email-readonly.png) | [1440](screenshots/studio-v3-email/email-readonly-1440.png) | [07-email-readonly](../design/studio-v3/reference/07-email-readonly.png) |
| Team invite | [Pair](screenshots/studio-v3-email/comparison-email-team-invite.png) | [1440](screenshots/studio-v3-email/email-team-invite-1440.png) | [07-email-team-invite](../design/studio-v3/reference/07-email-team-invite.png) |
| Phone email | [Docked bar](screenshots/studio-v3-email/email-phone-bar-375.png), [tools sheet](screenshots/studio-v3-email/email-phone-sheet-375.png) | 375 | Prototype frame 1d; current shared phone pattern |
| Tablet email | [Details drawer](screenshots/studio-v3-email/email-tablet-drawer-768.png) | 768 | Existing editor drawer |
| Template tab labels | [Quote](screenshots/studio-v3-email/template-quote-tabs-1440.png) | 1440 | Owner carry-over correction |
| Saved block phone | [Docked bar](screenshots/studio-v3-email/saved-block-phone-bar-375.png) | 375 | [11-phone-b](../design/studio-v3/reference/11-phone-b.png) |
| Brand uploads | [1440](screenshots/studio-v3-email/brand-filled-1440.png), [768](screenshots/studio-v3-email/brand-filled-768.png) | Both uploads filled | Owner carry-over d |

Regenerate with `STUDIO_EMAIL_CAPTURE=1 npm run test:e2e -- e2e/studio-email-editor.spec.ts e2e/workspace-icon.spec.ts`. Reference pairs place the supplied render on the left and the implementation on the right; full originals are linked separately.

Keyboard docking and the overflow menu’s keyboard-safe bounds are automated with a visual-viewport resize. Physical iOS Safari and Android Chrome keyboard checks remain manual owner checks.

## Validation

461 unit/database tests (93 files) and the full browser suite (253 passed, 4 optional capture checks skipped) pass. Production build, TypeScript, formatting, neutrality, the 425-file API/PDF runtime trace, all offline proposal fonts and every offline PDF-job regression pass. The focused phone action/keyboard checks also pass; existing save/reuse/delete/Undo and no-movement assertions remain intact. No hosted SQL. CI is not awaited.
