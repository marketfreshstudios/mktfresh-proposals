# The internal app, and emails

## Internal app posture

Two users, both owners. No roles, no onboarding, no marketing chrome, no empty-state tours. Desktop-first and dense: `control-md`, `ui-body` at 15px, `space-3` table cells. Assume both users know the product; optimise for the fifth hundredth proposal, not the first.

Content column caps at `measure-app`. Forms cap at `measure-form`.

**The dashboard answers one question: what needs me today.** Counts and short lists, each opening the proposal or the filtered list — awaiting my counter-signature, failed jobs and billing needs review, viewed but unsigned, expiring soon, drafted by AI, recent activity. Order them by how much they are blocking, not alphabetically. Counter-signature first: it is the only thing where the client is already done and waiting.

**Every proposal surface shows job state.** Wherever a proposal appears — list row, record header, dashboard item — a failed or needs-review job is visible and retryable from there.

**One primary action per screen.** The record header carries a single next action derived from status; everything else is secondary. A record that offers download, counter-sign, re-send, retry and copy-link as five equal buttons has made the decision the user's problem.

## Tables

The proposals list is the workhorse: title, client, status, one-time total, monthly total, sent / viewed / signed dates, source. Both money columns are right-aligned with `.tnum`. Status is a pill, not a coloured row — a tinted row makes a list of mixed statuses unreadable.

Sticky header at `z-sticky` on `surface-sunken`. Pagination at 100 per page. Search covers title, client and imported PDF text; say which when results come from extracted PDF text, and highlight the hit.

Filters are chips above the table showing their current value, not a hidden panel. An active filter set must be visible without opening anything, because the most common confusion in a list like this is "where did my proposal go".

## Empty states

Distinguish **nothing yet** from **nothing matching**. "No proposals yet" gets a create action. "No proposals match these filters" gets a clear-filters action and must never offer create — the thing they want probably exists.

`/integrations` empty is the healthy state. Say so: "Nothing needs attention." Do not draw it as a failure or an absence.

## Imports

`/imports` is a reconciliation report, not a control panel — rows imported, PDFs attached, missing or unmatched IDs — because the import runs from scripts elsewhere. Write it as a report with instructions and no run button. An imported record at `/archives/:id` is read-only: CSV metadata, PDF viewer and download, extracted text with search-hit highlighting, and **no signing or billing controls anywhere on the page**.

## Not yet backed by an API

Several things in these wireframes have no server behind them yet. Mark them in the designs so the build brief can schedule them, and do not let a component imply they work: staff-side send-reminder-now, mark-declined, duplicate and archive; resolving an ambiguous customer match from the UI; settings persistence and staff administration; custom quote lines with a per-proposal monthly amount; minimum term and price schedule on a line; workspace settings and branding; existing-subscription matching and the hosted billing-setup link; the AI connector; editing or amending an already-sent proposal; UI-triggered imports; and the payment-method hand-off.

## Emails

Four to the client — proposal sent, reminders at day 3 and day 7, your signed copy, final countersigned copy. Four to staff — viewed, signed and counter-signature needed, completed, sync failed.

One layout for all eight: workspace logo or name, a subject that names the proposal and the client, **one short paragraph**, **one button**, and a plain-text link beneath it for clients whose mail client strips the button. Client emails carry both totals; staff emails carry the totals and the status.

Emails use `paper` and `paper-*` tokens only — there is no dark mode in an inbox you control, and a mail client that inverts colours will do so on its own terms. The accent is the workspace's single accent value, the same one that prints in the PDF.

Reminders say which proposal and when it expires. They never imply pressure beyond the facts: "This proposal expires on 12 October" is the whole message.
