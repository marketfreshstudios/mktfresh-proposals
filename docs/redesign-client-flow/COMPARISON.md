# Redesign Phase 2 — client comparison

Reviewed 30 October 2026 against the served Redesign 01, 05 and 08 HTML exports. [Open the side-by-side gallery](index.html). [Capture manifest](screens/manifest.json).

114 application captures cover 16 client states plus Home, Studio menu and the small contact-title field addition, at 375/768/1440 in light/dark. Twelve additional Review/Sign screenshots use matching source viewport heights. Full-page captures remain linked. All use neutral fixtures, mock provider state and local fonts; no live account acceptance is implied.

38 source images include 1a–1i light/dark, 5a–5d, client states 8m–8r, supporting Home/client-detail frames and the Design System board. Redesign 01 supports a theme property and is rendered in both themes. Redesign 05/08 have no dark variant; the gallery labels its light reference and the implementation uses board 04's dark tokens. The 01 live frame is captured at its initial Review step. A reference selector makes every supplied frame available, including 1a.

| Surface | Matching frames | Result |
|---|---|---|
| Review | 1a/1c; 5b tablet; 5a desktop | Paper document, workspace logo/name/accent, on-page outline, large optional rows, required locks, live totals and resolved money sentences. 340px sticky choices panel on desktop; one-row tablet bar; full-width phone action, with measured bottom padding. One totals region. |
| Sign | 1d; 5d tablet; 5c desktop | Acceptance summary and terms, then prefilled identity/date, signature, full consent and action. Fixed recipient email and named re-send contact. Two columns at desktop, single column below 1100px. Touch defaults Draw; mouse defaults Type. |
| Sealing / failure | 1d; 8n | Double submit blocked synchronously. Explicit sealing message. Typed/drawn signature, name/title and consent survive failure; retry remains a deliberate action. A network failure is described as unconfirmed rather than falsely claiming nothing reached the server. |
| Checkout | 1e; 8o | Signed confirmation comes first, charges remain split, secure Checkout and Later paths. New sessions return to the proposal. Billing attention never casts doubt on the signature. |
| Existing subscriber | 1f | No Checkout control. Explains next-invoice additions and the new recurring total from the provider result. No invented card details or unavailable card-management button. |
| Signed / completed | 1g; 8r | Awaiting-countersign checklist becomes Completed copy after both signatures; sealed files, explicit copy visibility and verification remain available. Opening an accepted link never shows the sign form. |
| Stale | 1h | Reload banner replaces the Review action inside the fixed/sticky choices area. Sign-step conflict preserves the form with an explicit reload action. No automatic reload. |
| Password / ended | 1b/1i; 8p | No title/client/amount before password. Calm shared ended pattern and named sender contact where a valid token still identifies the workspace. Unknown/replaced tokens disclose no workspace or proposal information and ask the recipient to reply to the sender. |
| Decline | 8q | Explicit confirmation and a Go back action; no one-tap decline. Optional note is recorded verbatim in the decline audit event; a staff notification is queued using the saved sender identity. |
| Loading | 8m | Paper-shaped skeleton, reduced-motion support; no totals/action bar before data exists. |
| Staff fixes | 3d–3f; 04; 6d–6f | Bordered theme/sign-out controls, conditional Yearly column, optional contact title for sign-step prefill. Full staff feature redesign remains Phase 4/5. |

## Integrity and deliberate phase boundaries

- New send versions carry client_flow_version: 2 in their existing version JSON; no migration rewrites earlier rows. Old sent/signed versions retain the original component, signature form, CSS and fixed-cent formatting. Their HTML, quote shape and hashes are tested unchanged. New controls do not alter sealed PDF rendering.
- Client headers and controls use Instrument Sans; document text defaults to Source Serif 4; all font files are local. Theme choice lives in the footer so the client header follows the reference. Paper stays white in dark mode.
- The app uses real proposal content and stored amounts. Reference placeholders, images, business rules, prices and contact identities are never copied into application code.
- Existing flat line items remain the input contract. Multi-sub-line items, choice groups/radiogroups, expandable conditional contract clauses and their migration/MCP/billing-selection compatibility work belong to Phase 3. No fake alternatives, inferred clauses or prices are introduced in Phase 2. The sign step names a contract only when the proposal actually contains a contract heading; Read opens that section.
- Company signature identity/delegation, exact consent, hashes, audit actors, workspace isolation and provider idempotency are unchanged. AI still cannot send, sign or select the sender. Preview never performs public actions or billing.
- Typography/geometry are compared using different neutral fixture content, not literal sample text. Source browser chrome/device outlines are not app UI. Long full-page evidence and source scroll frames naturally have different document lengths.

Reproduce with npm run test:e2e -- e2e/redesign-client-flow.spec.ts. Copy .data/evidence/client-flow PNGs/manifest into screens after a passing run. Supporting reference frames come from the Foundation evidence.
