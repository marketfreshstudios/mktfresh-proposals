# Button

The single action control: four variants, four sizes, and a busy state that names what it is doing.

**You provide** `children` (the label), a `variant`, and `onClick`. Optionally `icon`, `size`, `loading` with `loadingLabel`, `block`, and `note`.

**One primary per screen.** `primary` is the next action the status implies — counter-sign on a signed proposal, send on a ready draft. Everything else is `secondary` or `ghost`. A record header offering five equal buttons has handed the decision back to the user.

**Sizes carry meaning.** `md` is the internal default. Every control on a client page is at least `lg`. `xl` is reserved for `Accept & sign` and the billing hand-off — the two moments the whole product turns on. `sm` is for dense internal table rows and never appears on a client page.

**A disabled button must say why.** Pass `note`. "Send proposal" greyed out with no explanation is the most common dead end in an internal tool; "Two variables are still unresolved" is a fix.

**`loading` shows the spinner and blocks re-entry.** Give it a `loadingLabel` when the wait is long enough to worry someone — sealing a PDF takes several seconds, so say "Sealing your signed copy…".

## Do

- Name the object in a destructive confirm: "Re-send and rotate the link", not "Confirm".
- Use `danger` only for genuinely destructive or terminal actions — decline, not delete-a-draft.

## Don't

- Don't use `primary` for more than one control in a view.
- Don't disable a button as a substitute for validation copy.
- Don't put a `sm` button anywhere a client will tap it.
