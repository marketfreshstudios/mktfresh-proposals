# Checkbox

A tick with a generous hit area, and a locked variant for anything the person is not allowed to change.

**You provide** `checked`, `onChange`, and `children` as the label. `locked` renders the immovable treatment.

**Locked shows a lock, not a disabled tick.** A greyed-out empty checkbox reads as "you forgot this one". The lock reads as "this is included". Use it for required quote lines and for every checkbox on a frozen, signed proposal — where the locked boxes still show the client's actual selections.

**The hit area is bigger than the box.** The component draws a `tap-min` target around a 20px box. Don't override it; a client ticking options on a phone is the core interaction of the whole product.

**The consent checkbox is a Checkbox with serif children.** The consent text is the server's, rendered in full on `paper`. Never truncate it, never put it behind "read more", never summarise it — the audit trail records this exact text.

## Do

- Put the label in `children` so the whole thing is clickable.
- Keep the label a full phrase, not a single word.

## Don't

- Don't use `disabled` where you mean `locked`.
- Don't use a checkbox for a binary setting that applies immediately — that is a different control.
