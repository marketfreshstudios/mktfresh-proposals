# Manual delivery contact

Based on merged PR #73 (`510bb52`). Owner decision: editing a client updates the client record and every unsigned native proposal for that client, from either Clients → Edit or Review & send.

## Recipient selection and propagation

Previously, proposals copied the client at creation, and later client edits left that recipient copy unchanged. There is one primary contact per client and no separate alternate-contact picker. The manual contact card and modal show the actual copied recipient, even if it differs from the current client-table contact. Saving now updates the primary client and all matching unsigned proposals, as the owner confirmed. Signed/frozen proposals and historical Proposify imports retain their stored contact and evidence.

The update is atomic and workspace-scoped. Proposal revisions are checked under row locks; a concurrent signature or content edit aborts the contact save without partially updating the client or other proposals. Ordinary client validation, duplicate-email handling, and preservation of an explicitly linked Stripe customer stay in the shared save path. AI client-only writes retain their existing limits and do not gain a way to change live proposals.

Unsigned sent/viewed proposals use the existing readiness-checked live publication path, on the same token. Previous versions, PagePlans, past email logs and existing jobs remain untouched. Drafts remain unpublished. Existing work-in-progress/readiness behavior is unchanged. Signed records, PDFs, certificate hashes and billing logic are not rewritten.

## Review & send

Manual mode hides From and replaces To with read-only Client contact: company, actual contact name/email, shared copy button. The same EditClientModal is used from Clients and Send, with all existing contact/address/provider fields and validation; Cancel precedes Save. The editor drains pending saves before opening it and reloads the current proposal/revision in place after saving. Delivery, sender selection, subject, note, password and Send tab state stay in memory. Switching to email mode restores the unchanged From/To/subject/note UI, with the updated recipient.

Copy feedback reuses the shared top-layer ToastSurface so it stays visible above phone/tablet modal sheets. Manual contact actions have 44px targets.

## Hosted SQL required before merge

Run `supabase/migrations/20261105193738_client_contact_propagation.sql` in this app's Supabase SQL editor. The PR description includes its full text. It adds one service-role-only, security-invoker function; no new table/column is needed. Existing service-only client writes remain available for the draft-only connector. Nothing has been applied to a hosted project by this task.

## Checks and screenshots

Tests cover all unsigned statuses, frozen/signed and foreign-workspace exclusions, new-recipient publishing/signing, no client emails from edits, preserved past email logs, PostgreSQL rollback/permissions, desktop/tablet/phone UI, actual clipboard writes/visible feedback, validation, state preservation and unchanged email delivery. Final results are recorded in HANDOFF_PHASE2.md and the PR.

Requested captures: [Manual mode at 1440](screenshots/manual-delivery-contact/hint-removed-1440.png), [Edit client modal](screenshots/manual-delivery-contact/edit-client-1440.png), [Manual mode at 375](screenshots/manual-delivery-contact/manual-375.png).


Final local validation (November 5, 2026): types; all 439 unit tests across 88 files; formatting; neutral-code checks; production build and 330-file PDF runtime trace; curated-font PDF embedding; real PDF job regressions; and the full browser suite (233 passed, 4 skipped, 15.8 minutes). The new contact checks pass at 1440, 768 and 375, including clipboard writes, feedback visible above sheets, 44px targets, validation, state preservation, a differing copied recipient, and preservation of hidden client notes. Requested screenshots were inspected. No CI wait or hosted SQL execution.
