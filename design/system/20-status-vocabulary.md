# Status vocabulary

Status is fixed vocabulary. The words below are the only words; do not paraphrase them in a pill, a column, a filter or an email subject. A pill always shows icon **and** word — never a bare dot.

## Proposal status

| Status | Colour pair | Icon | Means | Primary next action |
|---|---|---|---|---|
| Draft | `neutral-soft` / `ink-muted` | `edit` | Editable, never sent | Continue editing |
| Sent | `info-soft` / `info` | `send` | Link is live, not yet opened | Copy link · Re-send |
| Viewed | `info-soft` / `info` | `viewed` | Client opened the link | Wait · Send reminder |
| Signed by client | `warning-soft` / `warning` | `signature` | Client accepted and signed; frozen | **Counter-sign** |
| Completed | `success-soft` / `success` | `verified` | Both parties signed, PDF sealed | Download |
| Declined | `danger-soft` / `danger` | `declined` | Client closed it unsigned | Duplicate |
| Expired | `neutral-soft` / `ink-muted` | `expired` | Passed valid-until unsigned | Duplicate · Re-send |
| Archived | `neutral-soft` / `ink-muted` | `archive` | Out of the working set | Open read-only |

**Signed by client is `warning`, not `success`.** It is the one status that is waiting on the studio, and it is the top line of the dashboard. Completed is the only `success`.

**Expired is neutral, not `danger`.** A clock running out is not a failure, and colouring it red next to genuinely declined proposals makes the list unreadable at a glance.

## Source badge

Beside the status, never instead of it. `native` renders nothing. `imported` renders a `radius-pill` outline badge reading "Proposify import" in `ui-small` `ink-muted`. An imported proposal is read-only: the record shows the PDF, the extracted text and the CSV metadata, and no signing or billing control appears anywhere on it.

## Job state

Background work — PDF sealing, email, accounting sync, subscription setup — has its own state, shown wherever the proposal appears. It is never a modal, and it never contradicts the signature.

| State | Colour pair | Icon | Retryable | Copy pattern |
|---|---|---|---|---|
| Queued | `neutral-soft` / `ink-muted` | `clock` | no | "Queued" |
| Running | `info-soft` / `info` | `running` | no | "Sealing PDF…" |
| Failed | `danger-soft` / `danger` | `failed` | **yes** | "Couldn't create the invoice · attempt 3" |
| Needs review | `warning-soft` / `warning` | `review` | yes, after a fix | "Two customers match this client" |

Failed and needs-review both show the attempt count and a safe error line — the provider's message, never a stack trace, never a token or key. Retry is always adjacent to the state, never only on a separate screen.

The difference between the two matters: **failed** means try again, **needs review** means a person must decide something first. Needs-review items are what fill `/integrations`; an empty queue there is the normal, healthy state and should look deliberate rather than broken.

## Anything that is not one of these

`StatusPill` and `JobState` hold the vocabularies above and nothing else. A label that is genuinely free text — a provider being connected, a signer still waiting, a quote line being custom, a template's name — is a `Badge`. If you find yourself passing a status word to a Badge, the word belongs in one of the tables above instead, or it does not belong in the product.

## Drafted by AI

Orthogonal to status, not a status of its own. A draft an assistant authored carries an additional `ai-soft` / `ai` pill reading "Drafted by AI — needs review", with the assistant's name and time on hover and in the record. It clears when a person opens the draft and saves or approves it. See the AI authorship section.
