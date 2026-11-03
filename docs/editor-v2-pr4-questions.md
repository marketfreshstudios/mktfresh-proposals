# Editor v2 PR 4 — preflight decisions

Base: latest main `ac73d3e`, containing merged PR #53. Both supplied prototypes were served locally and opened in a browser. Desktop Quote, Fields, Styles and Send, and Redesign 11 frames 1a–1f, were inspected.

The PR 4 prompt says: “If the spec is silent or contradicts the prototypes or this prompt, stop and ask in the PR.” The following decisions were raised before implementation; all are resolved in the owner answers below.

## 1. Styles: preserve controls absent from the prototype

Part A requires keeping every input and handler. `src/components/proposal-styles.tsx` currently has Letter case, Letter spacing and a custom color input. The ordered layout in §6.3 and Redesign 10 omit Letter case and Letter spacing. Redesign 10 also labels the third color swatch “Gray”, whereas the PR 4 prompt/§6.3 require “Custom”. Following the prototype literally would remove existing controls.

Proposed resolution: keep Ink / Accent / Custom, retain the custom color input, and put Letter case and Letter spacing in a collapsed “Typography details” group after Weight / Space above / Space below, before Sample. Every existing input/handler remains; existing desktop/phone sample-width controls remain beside Sample.

Please confirm this placement and the Custom label, or specify the intended alternative.

## 2. Reopen: notification and client-declined scope

`proposal-actions.ts` implements reopening as `mark_sent` for `status=declined` and calls `service.send`, which sends an email and replaces the token. Staff-marked Lost and client Declined share that status; `marked_lost_by` distinguishes them. The new prompt explicitly covers Lost and Expired with Reopen, while the spec also includes Declined. The new prompt specifies preserving the link and assigning a new validity date, but does not specify whether reopening sends an email or whether client-declined proposals are included.

Proposed resolution: Reopen covers unsigned Lost, Expired and client-declined native proposals with a sent version; it uses the workspace link-validity default for the new date, retains the token, and sends no email. Readiness must pass before making the proposal signable again. First send remains the explicit email action.

Please confirm or specify the notification/scope differences.

## 3. Signing while staff work is not live

Part C explicitly keeps the last good version available when staff work fails readiness. A client can therefore sign published version N while the staff work-in-progress differs (for example, its pricing table has been removed). The prompt defines the signed/locked view but not which content its “Duplicate as new draft” action should copy. The existing duplicate action copies staff aggregate content/quote rather than choosing a version.

Proposed resolution: the client may sign the exact last published version; the locked editor always shows that signed version. Retain the unpublished staff work as a recoverable copy, clearly identify it to staff, and have “Duplicate as new draft” use that retained work when present, otherwise the signed version. Never discard the staff work silently or let it replace the content being signed.

Please confirm or specify that duplication should instead start from the signed version (and how the retained work should be offered).

## Boundaries and delivery

The existing aggregate JSON storage and append-only event/version tables appear sufficient; no migration is currently planned. If implementation proves a migration necessary, stop and ask as instructed. Hosted resources and credentials are not involved.

The final PR will contain exactly three commits: A (panel tabs), B (tablet/phone), C (live editing and cleanup). This preflight record is staged in A and will be amended into the completed A commit after the answers. Pagination/break math, PagePlan, document-print.ts, PDF generation/output, Stripe and billing logic stay unchanged. Full local automated checks, the requested 1440/1024/375 screenshots, HANDOFF_PHASE2.md/DECISIONS.md updates and iOS Safari/Android Chrome keyboard-docking manual checks remain to be completed before marking ready. Do not wait for GitHub CI.

## Owner answers

All three proposals above were approved. Keep Custom and Typography details. Reopen covers unsigned Lost (including client-declined) and Expired, uses the workspace validity default, retains the same token, requires readiness, sends no email and logs `reopened`. A signed editor shows exactly the signed version; retain unpublished work, show “Unpublished changes were not part of the signed version”, and Duplicate starts from that work. The signed version/PDF/hash never change.
