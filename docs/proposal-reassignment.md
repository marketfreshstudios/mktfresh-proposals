# Proposal reassignment

A proposal now has an optional explicit owner. Existing proposals need no row rewrite: owner falls back to the saved sender, then a staff creator. `created_by` remains history. Duplicating a proposal clears the explicit owner and sender so the new draft belongs to its creator.

Super admins can reassign any proposal. Staff can reassign only their own, and can choose only active workspace members. API checks and the service-only database transaction enforce the workspace, ownership and revision checks again.

- Never-sent drafts: internal owner only.
- Unsigned, unarchived Sent/Viewed proposals: internal owner and future email sender/Reply-To/client contact change. The target's email must use the workspace's verified sending domain. Pending correspondence is updated; delivered email log snapshots stay immutable. An actively delivering email must finish before reassignment.
- Signed, Won, Lost, Expired and Archived: internal owner and future staff notification recipient only. Historical sender, signers, versions, hashes, PagePlans, PDF inputs and stored files remain unchanged.

Every handoff appends a proposal timeline event and a workspace Activity audit entry with the previous/new owner and actual actor. The optional Notify checkbox defaults on. It queues one idempotent staff email per changed proposal; it does not send a client email or drain unrelated proposal jobs. A no-op handoff creates no event or notification. Notification mail uses the acting staff member's verified-domain identity and the existing app email provider/log.

The record and editor menus offer Reassign. The editor finishes autosaving before opening the dialog and adopts the new revision afterward. A handoff in another session creates an ordinary revision conflict instead of silently overwriting local work.

Studio → Team offers a bulk dialog for native unsent drafts and unfinished sent work (including client-signed work awaiting completion). All listed proposals start checked. The operation is atomic: a stale revision or unauthorized item aborts the entire batch. Removal uses current ownership rather than historical creation/sender details. The blocking removal dialog offers both Reassign their proposals and Deactivate. The Proposals list has an Owner column and All/Mine/person filter; `GET /api/proposals?owner=mine|<user-id>|all` uses the same owner resolution.

## Hosted rollout

**Apply both SQL migrations in order before merging/deploying this PR.** The complete combined SQL is also in the PR description. No hosted changes are performed by the implementation task.

1. `20261105021206_proposal_reassignment.sql` adds the service-only, workspace-serialized atomic reassignment operation. It calls the existing revision/evidence-preserving save and writes the workspace audit in the same transaction.
2. `20261105022204_bulk_reassignment_removal_guard.sql` updates only the unfinished-work predicate of the Team removal function. Last-admin, self-removal, membership/session revocation and audit rules remain intact.

No new table, Auth identity, environment variable or hosted resource is required. The PagePlan schema, signing/delegation, billing and readiness are unchanged. AI tools have no reassignment action.

## Validation

Automated checks cover Staff 403s, admin/own handoffs, inactive/foreign targets, batch rollback, draft ownership/creation history, future reminder identity, immutable delivered emails, unchanged live link/version/hash/plan, signed evidence preservation, notification idempotency, audit entries and bulk handoff followed by actual database removal. Browser coverage includes record/editor menus, Team removal-to-reassignment, Owner filtering, phone layout and dialog accessibility. Screenshots use neutral test data.

The staff-session regression now observes the intercepted login request's completed server response before checking the popup close. It retains the 200/body, recovered text, Retry persistence and cookie-clearing assertions; it no longer races a response event against destruction of the popup.

Local results: 403 unit/database tests; 204 browser tests passed with 4 optional capture tests skipped. Types, formatting, neutral-code check, production build/328-file trace, curated fonts and native PDF regression checks pass. The local Supabase advisor is unavailable without a running local stack; no hosted substitute was used.
