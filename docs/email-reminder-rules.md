# Email reminder rules — implementation review

## Scheduling question for the owner

The current scheduler takes `reminder_days` as absolute elapsed-day offsets from the last Send/Reopen (normally 3 and 7), chooses unopened/viewed copy at delivery, and snapshots the policy on Send. The new spec gives one “after N days” value per kind but does not define recurrence or the viewed clock.

Proposed rules for approval:
- New rules repeat every N local calendar days; unopened is anchored to Send/Reopen, viewed is anchored to the first view in that send cycle. One shared per-proposal cap applies.
- Existing sent proposals keep their exact snapshotted legacy offsets; workspace settings without new rules keep legacy offsets until the administrator explicitly saves the new reminder controls. No bulk data update.
- New policy edits apply to future sends/reopens, preserving the current snapshot behavior for proposals already sent.

Implementation of timing and migration is pending that decision. Queue safety, UI, and the new read-only countersign notification can be prepared independently.
