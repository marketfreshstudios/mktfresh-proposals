# JobState

Background work — PDF sealing, email, accounting sync, subscription setup — shown wherever the proposal appears, and retryable from there.

**You provide** `state`, a `label` naming the job in your own words ("Create draft invoice"), and for problems an `error`, `attempts`, and `onRetry`.

**Failed and needs review are different instructions.** `failed` means try again. `review` means a person must decide something first — which customer to link, which subscription to match. The retry control changes wording accordingly: "Retry" versus "Resolve".

**A billing failure never undoes a signature.** Render this beside the record, never as a modal over it, and never in copy that puts the signature in doubt. "Your signature is safe and the proposal is complete. Only the accounting sync failed."

**`error` is the provider's safe message.** Never a stack trace, never a token or key, never a raw HTTP body. Show `attempts` so a repeatedly-failing job is visibly different from a first failure.

## Do

- Show this on the list row, the record header and the dashboard — everywhere the proposal appears.
- Let `running` spin, and only `running`.

## Don't

- Don't block the UI on a failed job.
- Don't hide a needs-review item outside `/integrations`; it belongs on the proposal too.
