# SignaturePad

Draw or type a signature, on `paper` that does not invert with the theme.

**You provide** `mode` and `onModeChange`, plus `typedValue` or `strokePath`, `signerName`, `footNote`, and `onClear`. Capturing the stroke is the consumer's job; this component renders the surface and the result.

**Paper does not follow the theme.** The pad is `paper` with `paper-ink` in both light and dark, because what the client signs must match the PDF that gets sealed. A signature drawn in white on a dark pad would be a different artefact from the one in the file.

**Draw is the default on touch.** It is thumb-friendly by design — a large unobstructed area with the rule near the bottom so a hand does not cover what it is writing. Type is the fallback, rendered in `serif` italic.

**Clear is always available and always visible.** People get their signature wrong on the first try more often than not, and a client who cannot undo will abandon.

**This is its own focused step**, not a section of the reading page. Order: what is being accepted, then the consent text with its required checkbox, then the signature, then name, title and email, then submit.

## Do

- Show who is signing in `footNote`, including the email the proposal was sent to.
- Disable submit while sealing and show the wait in the button, not as a spinner over the page.

## Don't

- Don't let a second press double-submit.
- Don't theme the pad. `paper` is fixed on purpose.
