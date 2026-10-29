# Icon

Renders one glyph from the Font Awesome Free Solid set, inlined so it inherits the colour of the text around it.

**You provide** a semantic `name` from the Icons group — `stale`, `countersign`, `recurring` — not a Font Awesome glyph name. Optionally `size` (height in px; width follows the glyph's own ratio) and `title`.

**Colour comes from the text.** The component sets `fill="currentColor"`, so put the icon inside an element that already carries the right colour — a `danger` pill's icon is `danger`, an `on-accent` button's icon is `on-accent`. Never set a colour on the icon itself.

**Accessibility is decided by `title`.** With a `title` the glyph is `role="img"` with that label; without one it is `aria-hidden` and the neighbouring text carries the meaning. The second is almost always what you want.

## Do

- Size with `icon-sm` (16) in pills, buttons and cells, `icon-md` (20) in banners and nav, `icon-lg` (32) in empty states.
- Pair every meaningful icon with its word.

## Don't

- Don't use an icon alone to convey a status, a job state or a verdict.
- Don't animate anything except `running`, and only while a job is running.
- Don't add a glyph by drawing one. Take it from Font Awesome Free Solid and add it to the Icons group under a semantic name.
