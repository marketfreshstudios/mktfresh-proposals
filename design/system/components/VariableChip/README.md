# VariableChip

A content variable in one of three states: raw, resolved, or unresolved and blocking.

**You provide** `name` without braces, a `value`, `resolved`, and `showValue`.

**Unresolved blocks sending.** It renders in `danger` with a `failed` icon and the raw token, in place, in the canvas — not collected in a panel somewhere else. Someone fixing a variable needs to see where it sits in the sentence.

**Resolved-with-value is the preview state.** `showValue` renders the actual text with a faint underline, so the editor reads as the client will see it while still marking what is dynamic.

**Raw is the picker state.** The token in `mono` on `accent-soft`, with its current value in `title`.

Computed variables — `{{quote.one_time_total}}`, `{{quote.monthly_total}}` — update live as a client ticks options. Every sentence quoting a total re-renders with the totals themselves.

## Do

- Show each variable's current resolved value in the picker.
- Flag unresolved ones in place and in the readiness checklist, with the checklist linking back.

## Don't

- Don't silently substitute an empty string for a missing value.
- Don't let a proposal send with an unresolved variable anywhere in it.
