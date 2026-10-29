# ReadinessChecklist

The send gate, mirroring the server's validation so nothing is a surprise at the last step.

**You provide** `items`, each with a `state`, a `label`, an optional `detail` and an optional `action` node.

**Mirror the server exactly.** Unresolved variables, both signature blocks present, and a billing mapping on every selected line. A checklist that passes while the server refuses is worse than no checklist.

**Any `fail` blocks sending.** Pair it with a disabled send button carrying a `note` — the checklist says what is wrong, the note says why the button will not move.

**`warn` does not block.** Unreviewed AI changes are the main case: the send screen says so and requires an explicit confirm, separate from the send button itself.

**`detail` names the specific thing.** "Two variables are unresolved" is a count; "{{client.company}} and {{quote.valid_until}} have no value" is a fix. Put a `Show me` action beside it.

## Do

- List failures first, then warnings, then passes.
- Name the recipient email as a passing item — the client must sign with that exact address, and confirming it before send prevents the product's most abandoned error.

## Don't

- Don't collapse the passing items out of sight; seeing what is ready is half the reassurance.
- Don't use this as a progress bar. It is a gate.
