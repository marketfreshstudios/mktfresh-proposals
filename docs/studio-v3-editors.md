# Studio v3 — template and saved-block editors (PR #79)

The Studio v3 spec takes precedence over the prototype. This phase reuses editor v2's Sections nav, quote rows, Fields cards, Blocks catalog, toolbars, band controls, history, drawers and sheets.

Templates autosave after 600ms through the serialized save/recovery flow. Authored inactive defaults remain intact; preview totals and new drafts continue to skip them with the existing warnings. New proposal from this opens the existing New proposal sheet with this template selected. Availability is in the header menu; unavailable templates show “Hidden from new proposals” in the header and list.

Saved blocks keep explicit Save. Duplicate creates a separate library copy with new block IDs. Deleting removes only the workspace's library row, writes Activity, and leaves existing copies in proposals/templates intact. The service-role delete always filters workspace ID and block ID. No hosted SQL or data-format changes are needed.

Text and lists retain rich formatting and fields. Safe type conversions preserve those fields and marks. Contract and Image types are fixed. Contracts remain plain text with field insertion and existing clause controls; rich contract clause formatting is deferred. No contract renderer changes were made.

The focused phone canvas remains the scroll container; an old section rule cannot make it overflow inside the clipped shell. The dismissal regression uses real document overflow and asserts movement before checking that the menu closes (three consecutive focused passes).

Missing creation metadata is omitted. Existing edit evidence supplies dates/authors when available; no metadata fields or dates were invented.

## Evidence

Captures use local, neutral fixtures. Reference images are comparison targets; changed controls follow the spec and resolved owner decisions rather than outdated prototype controls. In particular: no Used in, no linking, existing independent header/footer controls, built-in Reset to default, and plain contract bodies.

| View | Local capture | Reference |
| --- | --- | --- |
| Default quote | [Capture](screenshots/studio-v3-editors/template-quote.png) | [08-template-quote](../design/studio-v3/reference/08-template-quote.png) |
| Fields | [Capture](screenshots/studio-v3-editors/template-fields.png) | [08-template-Fields](../design/studio-v3/reference/08-template-Fields.png) |
| Blocks | [Catalog](screenshots/studio-v3-editors/template-blocks.png), [Saved blocks](screenshots/studio-v3-editors/template-blocks-saved.png) | [08-template-Blocks](../design/studio-v3/reference/08-template-Blocks.png) |
| Styles | [Fonts/styles](screenshots/studio-v3-editors/template-styles.png), [Bands/reset](screenshots/studio-v3-editors/template-styles-bands.png) | [08-template-Styles](../design/studio-v3/reference/08-template-Styles.png) |
| Saved block Fields | [Capture](screenshots/studio-v3-editors/block-fields.png) | [09-block-Fields](../design/studio-v3/reference/09-block-Fields.png) |
| Saved block Details | [Capture](screenshots/studio-v3-editors/block-details.png) | [09-block-Details](../design/studio-v3/reference/09-block-Details.png) |
| Delete confirmation | [Capture](screenshots/studio-v3-editors/block-delete.png) | Existing DialogActions: Cancel first, destructive action right |
| Phone saved block | [Docked toolbar](screenshots/studio-v3-editors/block-phone.png), [Details sheet](screenshots/studio-v3-editors/block-phone-details.png) | [11-phone-b](../design/studio-v3/reference/11-phone-b.png) |
| Tablet saved block | [Drawer](screenshots/studio-v3-editors/block-tablet-fields.png) | Editor v2 drawer pattern |
| Dark mode | [Details](screenshots/studio-v3-editors/block-details-dark.png) | Shared Yeswell dark tokens |
| Billing defaults | [Capture](screenshots/studio-v3-editors/billing-defaults.png) | [05-ws-Billing-defaults-v2](../design/studio-v3/reference/05-ws-Billing-defaults-v2.png) |
| Team removal guard | [Capture](screenshots/studio-v3-editors/team-menu.png) | [05-ws-Team-menu](../design/studio-v3/reference/05-ws-Team-menu.png) |

Regenerate captures with `STUDIO_EDITORS_CAPTURE=1 npm run test:e2e -- e2e/studio-editors.spec.ts e2e/studio-v3.spec.ts -g 'evidence|carry-over'`.
