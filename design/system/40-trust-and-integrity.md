# Trust, revisions and evidence

This is the part of the product that has to be right. Everything here exists so that months later, in a dispute, the studio can show exactly what was agreed and by whom.

## Revision conflict is a first-class state, not an error

Every edit, toggle and signature carries the revision the person was looking at. If that revision is stale, the action is refused and the screen says so. This is normal, expected, and happens most often to a client reading a long proposal on a phone while staff are still fiddling.

Render it as a `warning-soft` banner with a `stale` icon, at the top of the affected region, and **block the action underneath it** — the button is absent or inert, not merely disabled with no explanation.

The copy has three parts: what changed, what it means, what to do.

> **This proposal changed while you were reading it.**
> The pricing or wording is different from what's on your screen. Reload to see the current version before you sign.
> [ Reload and review ]

Staff-side the same pattern, stated for their situation: "Someone saved this draft after you opened it. Reload to keep both sets of changes from colliding."

Never auto-reload the client's page. A document silently rewriting itself under someone about to sign it is the exact failure this state exists to prevent. The client presses the button.

## Frozen content

After the client signature, nothing about the document or the quote can change. Components must **remove** the controls, not disable them: no checkboxes, no quantity steppers, no editor. The frozen document renders at `opacity-frozen` with locked checkboxes showing the client's actual selections, and a `signature` marker where each signature sits.

Staff-side the editor is draft-only. A sent proposal is not editable; amending one is deliberately unsupported and needs its own workflow. If a screen implies otherwise, it is wrong.

## Link rotation

Re-sending keeps the old version and **rotates the link**, so the previous link stops working. Any re-send control states this in the confirmation, in those words, before the action: "Re-sending rotates the link — the one you sent on 12 September will stop working."

A client who follows a rotated link lands on the **superseded** state: one calm page, the studio's contact details, no internal detail, no hint of what changed. Superseded, expired, declined and invalid all share this pattern and differ only in the sentence.

## The evidence view

`/proposals/:id/audit` is append-only and rendered as a table, not a feed. Each row: event type (`mono-body`), actor, IP, device, timestamp. `mono-small` for IP and revision. Below the table sit the artefacts — exact consent text as shown, content hash, body-PDF hash, final-PDF hash, file versions — each in a `surface-sunken` well with a copy control.

**Verify controls give a real verdict**, not a status colour: a pass reads "Matches — this file is unchanged since sealing" with a `verified` icon in `success`; a failure reads "Does not match" in `danger` and says what to do next. Never a green tick alone.

In non-production, IP may be unavailable. Render "Not available" in `ink-muted`, never an empty cell and never a zero address — a blank in an evidence table is worse than an absence stated plainly.

## Both parties, always

Every proposal has two signature blocks, and the client always signs first. A template missing either block warns at save time; a proposal missing either fails the readiness checklist and cannot be sent. The counter-sign screen shows the frozen client-signed document, its hash, and the client's signature, name, time and consent — with no quote editing available at all.
