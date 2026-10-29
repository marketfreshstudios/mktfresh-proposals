# StatusPill

The proposal's lifecycle status as fixed vocabulary — icon and word together, in a colour the tenant cannot change.

**You provide** `status`, and `source` when the proposal came from the Proposify import. `label` exists for genuine exceptions and should almost never be set: the words are the product's vocabulary, not copy to vary.

**Two colour decisions carry real meaning.** `signed` is `warning`, not `success` — it is the one status waiting on the studio, and it is the top line of the dashboard. `expired` is neutral, not `danger` — a clock running out is not a failure, and colouring it red beside genuinely declined proposals makes a list unreadable at a glance.

**The AI mark is orthogonal.** `aiDraft` sits *beside* a status pill, never instead of one. A draft an assistant wrote is still a draft.

**`source="imported"`** adds a read-only badge. An imported proposal shows its PDF, extracted text and CSV metadata, and no signing or billing control appears anywhere on it.

## Do

- Put the pill in a status column. Let the row stay `surface`.
- Show the assistant's name and time in `title` on an `aiDraft` pill.

## Don't

- Don't tint the whole table row by status.
- Don't render a bare coloured dot — the icon and the word both stay.
- Don't invent a status. The eight plus `aiDraft` are the whole set.
