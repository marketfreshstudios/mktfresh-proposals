# Field

A labelled input with hint and error, sized for either audience.

**You provide** `label`, `value`, `onChange`, and whichever of `hint`, `error`, `required`, `type`, `multiline`, `size` apply. Optional fields are marked "(optional)" rather than marking the required ones — most fields here are required.

**`size="lg"` on every client page.** The signature step's name, title and email fields are the last thing between a client and a signed contract; they get `control-lg` and 16px text so a phone does not zoom on focus.

**Write the error as the fix.** The email-mismatch error on the signature step is the most-hit error in the product and the one where a client is most likely to abandon: name the address it was sent to and offer the way forward. "This proposal was sent to r.vale@brightline.example. Sign in with that address, or ask us to re-send it to this one." Never "Invalid email".

**`error` replaces `hint`** and wires `aria-invalid` and `aria-describedby`. Both are announced; do not put the error only in colour.

**A disabled field explains itself** through `hint` — "Turned off for this proposal" — because a greyed box with no reason reads as broken.

## Do

- Keep forms to `measure-form` in one column.
- Use `multiline` with `rows` for notes and consent text, not a tall single-line input.

## Don't

- Don't use placeholder text as the label.
- Don't mark required fields with a bare asterisk.
