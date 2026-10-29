# Icons

**Font Awesome Free 6.7.2, Solid style.** Thirty-three icons pulled per-glyph from `@fortawesome/fontawesome-free` — not the whole library, and not the icon webfont. Solid is the only style used; do not mix in Regular or Brands.

> Icons by [Font Awesome](https://fontawesome.com), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The attribution comment inside each SVG is part of the licence — keep it when you copy a file.

## Ink

Each file here is a **single-ink** SVG with `fill="#12151a"` baked in, because an `<img>` cannot inherit text colour. That value is `paper-ink` / `ink` in the light theme.

**Prefer the `Icon` component**, which inlines the path with `fill="currentColor"` so a glyph takes the colour of the text it sits in — a `danger` pill's icon must be `danger`, and an `on-accent` button's icon must be `on-accent`. Use the files here directly only where inlining is impossible (email templates, the PDF renderer). In those places, ship a recoloured copy rather than tinting with CSS filters.

## Semantic names

Files are named for their **job in this product**, not for the Font Awesome glyph. Swapping which glyph a job uses is a one-line change; renaming a job is not. The Font Awesome name of each is recorded in the SVG's attribution comment.

| File | Font Awesome | Used for |
|---|---|---|
| `edit` | pen-to-square | Draft status, edit actions |
| `send` | paper-plane | Sent status, the send action |
| `viewed` | eye | Viewed status |
| `signature` | signature | Signed by client, signature blocks, the signature step |
| `countersign` | user-check | The counter-signature action specifically |
| `verified` | circle-check | Completed, a passing integrity check, a connected provider |
| `declined` | circle-xmark | Declined status, a client's decline action |
| `expired` | hourglass-end | Expired status, expiring soon |
| `archive` | box-archive | Archived status |
| `lock` | lock | Required lines, frozen content, password gate |
| `clock` | clock | Queued jobs, valid-until |
| `running` | spinner | A running job. Animate only this one, and only while running |
| `failed` | triangle-exclamation | Failed jobs, errors |
| `review` | circle-question | Needs review — a person must decide |
| `stale` | clock-rotate-left | Revision conflict, version history |
| `retry` | rotate-right | Retry a failed job |
| `ai` | wand-magic-sparkles | AI-authored drafts. Never decorative |
| `recurring` | repeat | Monthly items and subscriptions |
| `one-time` | circle-dollar-to-slot | One-time items |
| `download` | download | Download a sealed PDF |
| `pdf` | file-pdf | An imported or sealed PDF file |
| `document` | file-lines | The proposal document, content library blocks |
| `link` | link | Copy link, link rotation |
| `copy` | copy | Copy a hash or a link |
| `search` | magnifying-glass | Search fields |
| `plus` | plus | Create actions |
| `check` | check | A ticked optional line, a passed checklist row |
| `chevron-right` | chevron-right | Row affordance, breadcrumbs |
| `close` | xmark | Dismiss a dialog or banner |
| `more` | ellipsis | Overflow menu |
| `image` | image | The image block in the editor |
| `page-break` | scissors | The page-break block |
| `variable` | code | The variable block and the variable picker |

## Rules

- **An icon never carries meaning alone.** Every status pill, job state and banner shows its icon *and* its word. The distinctions that matter most here — signed versus completed, failed versus needs-review, expired versus declined — are worth more than a shape and a colour can carry.
- Sizes: `icon-sm` in pills, buttons and table cells; `icon-md` in banners and nav; `icon-lg` in empty states. Font Awesome viewBoxes vary in width, so size by height and let width follow, or the glyphs will not optically match.
- `running` is the only icon that animates, and only while a job is actually running. Respect `prefers-reduced-motion`.
- Decorative icons get `aria-hidden="true"` and the adjacent text carries the meaning. A rare icon-only control gets an `aria-label`.
- Need a glyph that isn't here? Take it from Font Awesome Free Solid, add it to this folder under a semantic name, and add a row above. Do not draw one.
