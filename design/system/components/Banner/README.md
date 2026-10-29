# Banner

A message about the state of the thing on screen — most importantly the stale-revision interrupt that keeps anything from being silently signed.

**You provide** `tone`, a `title`, body `children`, and `actions`. `onDismiss` adds a close control.

**The stale-revision banner blocks.** Use `tone="warning"` with `icon="stale"`, and remove or inert the action beneath it — the button is absent, not merely disabled with no explanation. Carry the recovery action in `actions`: "Reload and review". Never auto-reload a client's page; a document rewriting itself under someone about to sign is the exact failure this prevents.

**The copy has three parts**: what changed, what it means, what to do. "This proposal changed while you were reading it. / The pricing or wording is different from what is on your screen. / Reload to see the current version before you sign."

**A `danger` banner about background work must protect the signature.** Say plainly that the signature is safe and only the sync failed.

**`tone="ai"` is the unreviewed-draft banner** and is informational, not blocking. The point is that a person reads the draft, so the banner must not be the only thing they can interact with.

`tone="danger"` renders `role="alert"`; everything else is `role="status"`.

## Do

- Put a blocking banner at the top of the region it blocks, not at the top of the page.
- Let a `success` verify result state the verdict in words: "Matches — this file is unchanged since sealing."

## Don't

- Don't make a blocking banner dismissible.
- Don't use `ai` tone for anything that is not AI-authored.
