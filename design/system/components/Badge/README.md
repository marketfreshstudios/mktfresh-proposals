# Badge

A small label carrying free text — the thing `StatusPill` and `JobState` deliberately cannot do.

**You provide** `children` (the text), a `tone`, and optionally an `icon` or `variant="outline"`.

**This is the escape hatch, and it is narrow.** A proposal's lifecycle status is `StatusPill`; background work is `JobState`. Both hold fixed vocabularies on purpose, so that "Signed by client" means exactly one thing everywhere in the product. Reaching for a Badge to write "Signed" is the mistake this component exists to prevent — if a label names a proposal state or a job state, you are using the wrong component.

**What Badge is for**: a provider being connected, a signer still waiting, a quote line being custom rather than from the catalog, a template name, an assistant's name, a short failure summary on a list row.

**`variant="outline"`** is for provenance, never for state — "Proposify import", "Template: Website project". It has no tone.

## Do

- Keep it to a few words. A Badge that wraps is a sentence wearing a pill.
- Pair `tone="danger"` with the same words the JobState uses, so a list row and the record agree.

## Don't

- Don't invent a status vocabulary here.
- Don't use tone alone to carry the meaning — the words do that, the tone confirms it.
