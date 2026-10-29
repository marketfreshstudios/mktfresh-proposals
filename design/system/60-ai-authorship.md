# AI assistants as authors

Much of the wording and pricing in this product is drafted by an assistant connected to the workspace rather than typed into the editor. An assistant can read clients, templates, the catalog and past proposals, and can create and edit **drafts only**. It can never send, sign, counter-sign, change billing, or touch a sent proposal. A person always reviews and presses send.

The design job is to make AI authorship **visible without being alarming**. These drafts are wanted; they are just not yet reviewed.

## The `ai` colour is reserved

`ai` and `ai-soft` mark AI-authored work and nothing else. They are not a sixth status colour and never indicate health, progress or risk. A proposal drafted by an assistant still carries its normal status pill — the AI pill sits beside it, not instead of it.

## Where it shows

**Proposals list and dashboard.** "Drafted by AI — needs review" as a pill and as its own dashboard count, alongside awaiting-counter-signature and failed jobs. The list is filterable by it. The pill names the assistant and when, on hover and in the record.

**Editor.** A `ai-soft` review banner sits above the canvas until a person opens the draft and saves or approves it. It is informational, not blocking — the point is review, and review means reading, so the banner must not be the only thing a person can interact with.

Inside the editor, **AI-entered prices that differ from the catalog default are highlighted in place** with an `ai` marker and the catalog price shown beside them in `amount-sm`. This is the highest-value detail in the whole AI surface: a wrong price skimmed past is the failure mode that costs real money. Highlight it so it gets checked, not skimmed.

The version note shows who made the last change — a person's name or an assistant's — with the same weight for both.

**Send screen.** If the draft still has unreviewed AI changes, say so and require an explicit confirm, separate from the send button itself. Not a second modal; a checkbox that names what is unreviewed.

**Activity and audit.** AI actions appear in the event trail with the assistant as the actor, in `ai`, in the same table as everything else. They are events, not annotations.

**`/integrations` → AI assistants.** Connect an assistant, see what is connected, what it may do (read / draft), when it was last used, and revoke. The permission summary is written in product language — "Can read clients, templates and the catalog. Can create and edit drafts. Cannot send, sign or change billing." — not as scopes. A copyable connection URL; no keys shown after creation, ever.

## Tone

Never apologise for the assistant and never oversell it. "Drafted by AI — needs review" is the whole sentence. Avoid "magic", sparkle language beyond the single `ai` icon, and any copy suggesting the draft is finished. The assistant produced a draft; a person finishes it.
