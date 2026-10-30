# "Sign" from the proposals list

**Rule:** Sign never countersigns in place. It opens the proposal with the countersign sheet open, so the signer sees the full context and the signature block.

## Where Sign appears
- Proposals list row (desktop and tablet), the card (phone), the row's ⋯ menu, Home's "Countersign" group, and the staff notification email.
- Only when `status === 'won' && !company_signed` **and** the viewer is in `company_signatory.authorized_user_ids`. Otherwise show the "Needs countersign" tag with no button.

## Behavior
- Sign is a plain `<Link href="/proposals/:id?action=countersign">`, not a button with a handler. The row click and the Sign link are separate targets, and the link calls `stopPropagation`.
- The record page renders as normal, then opens `CountersignSheet` and moves focus to its heading. It's a dialog on desktop and tablet and a bottom sheet on phone.
- Closing the sheet removes the param with `router.replace`.

## What the sheet shows, in this order
1. **Client-signed summary**, frozen: chosen items, both totals, version number and content hash.
2. **Client signature:** the image or typed name, plus name, title, email and timestamp.
3. **Company signature preview:** the stored image, "Jonathan Garces", title and today's date.
4. **On-behalf statement**, only when the viewer is not the designated signatory. It's a checkbox naming the viewer: the audit trail records the person who actually applied the signature.
5. **Consent text** in full, with its checkbox.
6. **"Countersign as Jonathan Garces"** button. It stays disabled, with the reason shown, until the required boxes are ticked.

## Guards
- Send `revision` and `reviewed_hash` to `POST /api/proposals/:id/countersign`. On a 409, show the stale banner inside the sheet and block submit.
- If the proposal is already countersigned when the page loads, ignore the param and show a toast: "Franz already countersigned this at 4:31 PM."
- AI connectors never see this action.

## After success
- The sheet shows "Sealing the final copy…", then closes. The record updates to Countersigned or Won.
- "Back to proposals" returns to the same list view and scroll position, and that row no longer shows Sign.

Design references: `Redesign 06 - Proposals and Clients.dc.html` (list, #spec-countersign) and `Redesign 03 - Record and Home.dc.html` (sheet, 3a–3c).
