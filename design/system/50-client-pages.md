# Client pages — everything at `/p/:token`

These pages are the product as far as a client is concerned. They are the only surface a paying customer of the workspace's customer ever sees, and they are almost always opened on a phone, from an email, once. Design them mobile-first and spend the care here.

## The frame

A client page is a document on `paper` inside a themed page. Use `paper-*` tokens inside the document container and normal theme tokens outside it. Maximum `measure-doc` for body copy. `shadow-paper` on the card, `radius-xl` on a wide screen, full-bleed with side padding of `space-4` on a phone.

The header carries the workspace logo — or its name in `ui-title` when no logo is set — and nothing else. No product branding, no "powered by". The workspace is the sender; this system is invisible.

## Reading state

Reading comes first. The document renders in `serif` at `doc-body`, headings in the Document group, images inline at full container width.

The pricing table sits in the document flow, not in a sidebar. Optional lines carry checkboxes with `tap-min` hit areas; required lines are visibly fixed with a `lock` icon and no control. Ticking updates both totals and every sentence quoting them, instantly.

**The persistent bar** is the one piece of chrome: one-time total, monthly total, and `Accept & sign` at `control-xl`. It sits at the bottom on a phone with `shadow-bar` at `z-bar`, and it must not cover content — the document gets bottom padding equal to the bar's height so the last line is always reachable. On desktop it can sit inline at the end of the document or pin to the bottom; either way both totals stay visible with the button.

Secondary information — valid-until, who it's from, contact, decline — goes below the document in `ui-small`, never competing with the bar.

Navigating a long proposal on a phone needs help the desktop doesn't: a collapsed section index at the top for documents over roughly three screens, and page-break markers rendered as a thin `paper-border` rule with the page number in `paper-muted`.

## Password state

Company name, one field, one button, and a failure message. **Nothing about the proposal leaks** — not the title, not the client name, not the total, not the sender's individual name. The failure message says "That password doesn't match" and nothing more.

## Signature state

Its own focused step, not a section of the reading page. It opens over `overlay` on a phone as a sheet at `radius-lg`, or as a full page.

Order matters: summary of what's being accepted (the selected items and both totals) → the consent text → the signature → identity → submit.

- **The summary is complete.** Every selected line and both totals. A client must be able to check what they are signing without going back.
- **The consent text is the server's, in full**, in `doc-small` on `paper`, with a required checkbox. Never truncated, never behind a "read more", never summarised. The audit trail records this exact text.
- **Draw or type**, with draw thumb-friendly and default on touch. `stroke-signature` in `paper-ink` on `paper`. Clear and redo always available.
- **Name, title, email.** The email must match the address it was sent to. Design that error kindly — name the address it went to, offer to have it re-sent elsewhere, never say "invalid".
- **Submitting takes several seconds** while the PDF seals. Show a determinate-feeling state with its own copy ("Sealing your signed copy…"), disable the submit control, and never let a second press double-submit.
- **Stale revision** interrupts here as described in the integrity section: reload and re-review, no silent signing.

## Billing setup state

Required whenever monthly items were selected. **The proposal is already signed at this point — say so first**, at the top, so nobody thinks the deal is in doubt because a card form appeared.

Two variants:

- *New to recurring billing* — "One more step: set up your monthly billing." Show what will be charged, when it starts, and any schedule or minimum term, then hand off to the provider's hosted page and return here.
- *Existing subscription* — "We'll add this to your existing monthly billing," with the card brand and last four, the new monthly total, and a secondary link to update the card instead.

The same link is emailed, so the "came back later from the email" entry is a first-class path, not a fallback. States: pending, completed, link expired.

## Signed and completed are two different moments

Do not collapse them.

1. **Signed, awaiting counter-signature** — "You're all set. We'll countersign and send your final copy." Client-signed PDF available for download. `warning` accent on the status line, because something is still outstanding.
2. **Completed** — both signatures, final sealed PDF, `success`. Both files stay available; the client-signed copy is not replaced.

Both show a read-only document beneath with locked checkboxes, a verify-this-document control, and a plain statement of what happens next.

## Dead ends

Declined, expired, invalid and superseded share one calm pattern: what happened in one sentence, the studio's contact details, nothing internal. No status code, no token, no proposal title. Decline itself is a confirmation step, not a one-tap action, and it closes an unsigned proposal.
