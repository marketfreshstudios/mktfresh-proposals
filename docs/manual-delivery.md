# Manual proposal delivery

Review & send defaults to **Email it from the app**. **I'll send it myself** publishes through the same Send service: sender/domain checks, readiness and AI review, password handling, workspace snapshot, PagePlan validation, versioning and the one client token all stay in place. It omits the proposal email job and does not read or validate an email template that will not be used. Subject and Note stay hidden in this mode; switching back preserves the current email edits.

After publication, the staff record opens a confirmation with the complete canonical client URL in a read-only field, Copy/Copied feedback, the paste-into-your-email instructions and password guidance when applicable. The confirmation checks the stored delivery mode and sent state, not just the URL parameter. The record header exposes the client link whenever a token exists, including closed and signed states. The list action menu offers Copy client link. These are staff surfaces under the existing workspace authorization; the public token remains the client's existing access mechanism.

Manual sends retain the existing `sent` audit event and add delivery/actual-actor metadata, preserving the send cycle and completion-certificate sent timestamp. The timeline renders the owner's requested “Sent manually by {staff} (link copied, no email from the app)” wording. This labels the manual handoff; publication does not force clipboard access. There is no sent-email log entry because no email is queued. Subsequent actual emails keep their normal immutable logs.

## Automatic email inventory and policy

- Scheduled unopened/viewed reminders are the only automatic client outreach after Send. They are off for manual delivery by default. The record's **Automatic reminders from the app** switch explicitly enables them using the existing workspace cadence measured from Send. Normal email sends and older untagged proposals retain their previous default-on behavior.
- Expiry still closes the proposal and records an event. It has no automatic client email today.
- Send reminder is an explicit staff action and bypasses the automatic-reminders preference. Its job uses the send-cycle version so it also works after live edits publish another document version.
- Client-triggered view/signature notifications, signed copies, billing setup/confirmation and completion copies retain the existing behavior. No signing, billing or PDF pipeline was changed.
- Disabling reminders also prevents delivery of already queued scheduled reminder jobs. Explicit reminders remain deliverable. Re-enabling allows unsent due reminders to run. Reminder setting changes are revision-guarded, audited and do not publish a document version or change the client link.

Duplicating a proposal clears its delivery/reminder preferences. The new draft starts with the ordinary email-default choice. The old alternate Send screen has been removed: the `/send` route uses the current editor rather than showing obsolete link-rotation wording.

## API and rollout

`POST /api/proposals/:id/send` accepts `delivery_method: "email" | "manual"` (default `email`) alongside its existing inputs. Email-only Subject/Note/body are unused in manual mode. `POST /api/proposals/:id/reminders` takes `{ revision, enabled }` for an open, unsigned native proposal. Existing authentication, workspace scoping and revision checks apply. The AI connector exposes neither operation and remains drafts-only.

**No hosted SQL, migration, resource or new environment variable is needed.** The two optional properties use the existing proposal JSON; versions, PagePlan and version hashes keep their current format.

## Validation

Service and HTTP checks cover no mail/log on manual send; the same document hash/plan as normal Send; readiness, AI, sender, password and revision guards; unavailable email templates; anonymous and foreign-workspace denial; reminder opt-in and queued-job suppression; explicit reminders after live edits; normal expiry; both signatures/copies; stable tokens and duplicate defaults. Browser tests use the actual local API, copy from confirmation/record/list, opt into reminders, then open and sign the manually shared link and verify the real client PDF and email copy. The phone confirmation includes password guidance and passes the dialog accessibility check.

The four requested screenshots are under `docs/screenshots/manual-delivery/`. No live email or hosted change is performed by the tests.

Local validation completed: 412 unit/database tests; full browser run 206 passed with 4 optional capture tests skipped. Types, formatting, neutral-code, production build/328-file trace, all curated fonts and native PDF job regressions passed. The new browser fixture uses a unique company as well as email so the existing billing ambiguity guard remains tested without cross-test collisions.
