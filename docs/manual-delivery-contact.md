# Manual delivery contact — recipient decision required

Branch starts at merged PR #73 (`510bb52`).

The requested contact layout is clear: manual mode hides From, replaces To with Client contact, provides the existing email-copy feedback and opens the same client-edit form. Email mode retains its current controls. No migration is needed for that presentation.

## Existing recipient behavior

- `ProposalService.create()` copies the selected client into `proposal.client`.
- Both repository implementations read that stored proposal state; they do not replace its client from the current client table.
- `saveClient()` / `saveClientContact()` update only the client record. Clients → Edit does not update existing proposals.
- Send, public recipient details, signing recipient validation and client emails use `proposal.client`.
- There is one primary contact per client record and no separate alternate-contact selection model. A proposal's copied contact can differ after someone edits the client record.

Consequently, saving the existing client-edit form alone cannot make an existing proposal's recipient follow the changed contact. Updating only React state would misleadingly show the new email while publishing to the old one. Changing the recipient needs an explicit, persisted proposal update.

## Owner question (also in the draft PR)

Should Edit client in this panel save the client record **and update this unsigned proposal's copied contact**, leaving every other proposal unchanged? This is the recommended narrow behavior. If this proposal's contact differs from the client's current primary contact, the form would show the proposal's actual copied contact and saving would update both records.

Alternatively, should a differing contact be edited only on this proposal, preserving the client's primary contact?

No application, recipient, signing, publishing or schema behavior has been changed pending this decision. After the answer, implement the shared form/contact UI, add regression coverage, run the full suite and capture the requested 1440/375 screenshots before marking ready.
