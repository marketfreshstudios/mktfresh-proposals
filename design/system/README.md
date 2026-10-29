A design system for a self-hosted proposal and e-signature product: staff build a proposal from a template, a client opens a private link, ticks optional lines, accepts and signs, staff counter-sign, and the system seals a PDF with an audit trail behind it.

Two audiences share one system and do not share a style. The **internal app** is dense, desktop-first, and built for two people who use it every day. The **client pages** at `/p/:token` are the product as far as a client is concerned: mobile-first, quiet, and closer to a contract than to an app. Build both from the tokens below; the difference is density and typeface, never a second palette.

This system is **white-label by construction**. No company name, service name, pricing rule or sender address belongs in a component. Identity comes from workspace settings: name, logo, and one accent colour. Sample data in previews is neutral on purpose — Brightline Foods, Rowan Vale, `{{client.first_name}}` — and stays that way.

## Content fundamentals

Write like a careful studio owner, not like software. The product handles money and signatures, so plain and exact beats warm and vague.

- **Say what happened and what it means.** "This proposal changed while you were reading it. Reload to see the current version before you sign." Not "Conflict detected."
- **Second person for the client, first person for staff.** A client reads "You'll be charged $175 a month starting 1 October." Staff read "Awaiting your counter-signature."
- **Never blame the reader.** The email-mismatch error on the signature step is the most-hit error in the product and the one where a client is most likely to give up: "This proposal was sent to r.vale@brightline.example. Sign in with that address, or ask us to re-send it to a different one." Never "Invalid email."
- **Sentence case everywhere** — buttons, headings, table columns, pills. The only uppercase is `ui-label`.
- **Name the object, not the verb, in destructive confirmations.** "Re-send and rotate the link" tells the truth; "Confirm" does not.
- **Numbers are never rounded in prose.** If the total is $12,400.00, the sentence says $12,400.00.
- **No emoji, no exclamation marks, in any client-facing surface.** A signed proposal is a legal artefact.
- **Status words are fixed vocabulary**, not copy to vary. See the status section.

## Visual foundations

**Colour.** Three layers, and they do not mix.

1. *Neutrals* carry structure: `surface-page` behind, `surface` for cards, `surface-sunken` for wells inside a card, `surface-raised` for menus and dialogs. Text is `ink` and `ink-muted`; `border` is decoration, `border-strong` is any edge that carries meaning.
2. *The tenant accent* (`accent`, `accent-hover`, `accent-soft`, `on-accent`) is chrome: primary buttons, links, focus, selection. A workspace replaces these four values. **Accent never carries a status** — if it did, a tenant changing their brand colour would silently re-label every proposal in the list.
3. *Status semantics* are fixed product colours a tenant cannot change: `success`, `warning`, `danger`, `info`, `ai`, each with a `-soft` ground and an `on-` foreground.

Put text on a fill with the matching `on-` token: `on-accent` on `accent`, `on-danger` on `danger`. These flip between themes, so never hard-code white on a coloured button. Soft grounds take the strong colour as text: `success` on `success-soft`.

**`paper` is the exception to the theme.** The document body and the signature pad are `paper` with `paper-ink`, `paper-muted`, `paper-accent` and `paper-border` — identical in light and dark, because what a client reads on screen must match the PDF that gets sealed. Inside a document container, use only `paper-*` tokens. Everything around it — the sticky bar, the page background, the browser chrome — follows the theme normally.

**Type.** Three families with three jobs. `sans` (Public Sans) is every interface surface. `serif` (Source Serif 4) is the rendered document only — it is what makes the client page read as a contract rather than a web app, so never use it for UI chrome, and never use `sans` for document body copy. `mono` (IBM Plex Mono) is evidence: hashes, variable names, IP addresses, event types.

`doc-body` is 17px/28px. That is deliberate and it is a floor, not a default to tune down — a client reads a multi-page proposal on a phone, and the whole product depends on them actually reading it. Cap document copy at `measure-doc`.

Money uses the **Money** group with the `.tnum` class so digits align in a column. `amount-display` is for the two totals; `amount-md` for line amounts; `amount-sm` for a struck list price beside an override.

**Spacing and shape.** A 4px base. Steps `space-1` through `space-5` build a component, `space-6` and up separate regions. Radii climb with the size of the thing: `radius-sm` on controls, `radius-md` on cards and banners, `radius-lg` on dialogs and the signature pad, `radius-xl` on the document card. `radius-pill` is only ever a status pill or a source badge.

**Elevation is scarce.** A proposal is a document, not a dashboard of floating cards. Default to a `border` hairline. `shadow-md` is for things that genuinely float over content (menus, popovers), `shadow-lg` for dialogs over `overlay`. On a client page the only shadow permitted is `shadow-paper` on the document card and `shadow-bar` under the sticky totals bar.

**Controls and touch.** `control-md` is the internal default. Every interactive target on a client page is at least `control-lg`, and anything a client taps — including an optional-line checkbox — gets a `tap-min` hit area even when the visible box is smaller. `Accept & sign` and the billing hand-off button are `control-xl`.

**Focus.** Every interactive element shows a `stroke-thick` `focus-ring`, drawn outside a `stroke-thick` offset in the element's own ground so it stays visible on an `accent` fill. Never remove an outline without replacing it. On `paper`, the ring is `paper-accent`.

**States.** Every screen needs default, empty, loading and error. Loading uses skeleton blocks in `surface-sunken`, never a spinner over content that already has a shape. A disabled control uses `opacity-disabled` **and** says why in text next to it — opacity alone is not a reason. Signed content uses `opacity-frozen` and stays fully readable.

**Motion.** Short and functional: 120ms for a hover or a checkbox, 180ms for a banner or panel entering, ease-out. The pricing total that changes when a client ticks a box does **not** animate its digits — it updates instantly, because a number sliding through wrong values while someone decides is worse than no motion at all. Respect `prefers-reduced-motion` by dropping to opacity-only.

## Iconography

The icon system is **Font Awesome Free 6, Solid style**. Thirty glyphs are pulled per-icon into the **Icons** asset group — not the whole library and not the webfont — and named for their job in this product (`stale`, `countersign`, `recurring`) rather than for the glyph, so swapping which glyph does a job stays a one-line change. Solid only; never mix in Regular or Brands. The icons are CC BY 4.0, and the attribution comment inside each SVG is part of the licence.

Render them through the `Icon` component, which inlines the path with `fill="currentColor"` so a glyph takes the colour of the text it sits in — a `danger` pill's icon must be `danger`. The files in the group have `#12151a` baked in for the places inlining is impossible, such as email templates and the PDF renderer, because an `<img>` cannot inherit colour. Need a glyph that isn't there? Take it from Font Awesome Free Solid and add it under a semantic name — do not draw one.

An icon never carries meaning alone. Every status pill, job state and banner pairs its icon with the word, because the three most important distinctions in the product — signed versus completed, failed versus needs-review, expired versus declined — are worth more than a colour and a shape can carry, and because `success` and `danger` are told apart by hue for most people but not for all.

Sizes are `icon-sm` inside pills, buttons and table cells, `icon-md` in banners and nav, `icon-lg` in an empty state. Font Awesome viewBoxes vary in width, so size by height and let width follow — sizing by width makes the glyphs optically mismatched.

## There is no logo in this system

No mark was supplied, and none was invented. Wherever a workspace logo would appear — the client page header, the PDF, the email template — components render the workspace name in `ui-title` until a real logo is uploaded through settings. Do not draw a placeholder mark.

## Usage rules that are not negotiable

These come from the product's own contract and a component that breaks one is a bug, not a style choice.

- **Two totals, side by side, always.** One-time and monthly. Never a blended figure, never one without the other, never one of them in a status colour. See the money section.
- **Nothing is silently signed or overwritten.** Every edit, toggle and signature carries the revision it was made against. A stale revision blocks the action and asks the person to reload and re-review. See the integrity section.
- **Signed content is frozen.** After a client signature, no component may offer a control that would change the document or the quote — not disabled, absent.
- **Clients tick and untick; they never price.** Quantity and price overrides are staff-only controls and do not exist in the client-page components.
- **A billing failure never undoes a signature.** Job state is rendered beside the record, never as a modal over it, and never in a way that implies the signature is in doubt.
- **Re-sending rotates the link.** Any component offering re-send says so in the confirmation, in those words.
