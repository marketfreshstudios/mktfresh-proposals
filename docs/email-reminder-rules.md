# Email reminder rules

Studio → Workspace → Email sending adds Reply-to, repeating client reminder rules and a read-only Countersign reminder email. All settings use existing workspace JSON and the existing proposal/job aggregate. **No hosted SQL, migration or new table is needed.**

## Timing and migration (owner-approved, Nov 8)

- Unopened reminders repeat every N local calendar days from Send/Reopen. The first view in that cycle stops further unopened reminders.
- Viewed reminders repeat every N local calendar days from that cycle's first view. Repeat visits do not reset the clock.
- “Stop after” caps automatic client reminders across both kinds and across the proposal's lifetime. Manual “Send reminder” is unchanged and is excluded from the cap.
- Calendar days preserve the send/view local clock time across DST. For a missing spring-forward clock time, delivery shifts forward through the gap; for a repeated fall-back time, the first occurrence is used. The cron sends on its next run at or after the computed due time.
- Existing proposals without `reminder_rules` keep their **exact send-time `reminder_days` offsets in elapsed 24-hour days** (including arbitrary arrays and an empty/off schedule). The unopened/viewed template is still chosen at delivery. Nothing bulk-updates proposals or frozen versions.
- A workspace without saved rules also stays on that legacy schedule. Merely opening settings or changing Reply-to/countersign preferences does not migrate client timing. Editing the new reminder controls explicitly saves `reminder_rules`.
- The editable initial values use the first/second sorted distinct legacy offsets (or 3/7), with a cap equal to the distinct offset count (or 2), and retain empty/off. These values are a proposed repeating policy until saved, not a claim that repeating rules are equivalent to a legacy array. The UI shows the actual legacy schedule until then.
- New rules are snapshotted on future Send/Reopen. Already-sent proposals keep their policy, even if workspace settings change. A resend/reopen starts another timing cycle but does not reset the per-proposal automatic reminder cap. Live edits do not restart reminders.
- Manual delivery still defaults its own Automatic reminders switch to off. Turning it on explicitly uses that proposal's saved policy.

## Countersign and Reply-to

- Countersign reminders default to Off. Next morning means **09:00 on the next Monday–Friday in the workspace timezone**. There is no existing holiday/business-day calendar; holidays are not excluded. After N days preserves the client signature's local clock time. One notification is sent per client signature/due time/staff recipient, not a repeating staff chase.
- Staff recipients follow the existing proposal notification/owner rules; this adds no countersigning permission. Completed/archived proposals no longer qualify. The client Automatic reminders switch governs client mail, not this separately configured staff notification.
- Reply-to defaults to the selected sender. Workspace mode uses the workspace contact/sending email while keeping From unchanged. Like the existing identity, the choice is captured at Send/Reopen and into each email snapshot. A reassignment respects the proposal's saved Reply-to policy. Historical logs remain unchanged.
- “Countersign reminder” is read-only in Studio → Emails → Signatures, with existing previews and signed-in-user-only test delivery. Client reminder wording remains editable and unchanged; it contains no pricing and one proposal button.

## Queue guarantees

The existing `save_proposal` revision compare-and-swap transaction serializes queue reservations and worker leases across serverless instances; no in-memory lock is used. Jobs use deterministic proposal/cycle/kind/due-time keys, and the existing mail provider idempotency key remains stable across retries. Reservations include pending jobs in the shared cap. A view invalidates outstanding unopened jobs. The worker checks current status, signatures, archive, expiry, policy and per-proposal switch both before preparing and immediately before delivering automatic mail, after awaited rendering/log reads. One immutable email snapshot and one job-keyed timeline event record each delivery.
