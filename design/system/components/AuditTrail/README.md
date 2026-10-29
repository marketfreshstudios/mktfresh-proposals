# AuditTrail

The evidence view: an append-only event list rendered as a table, beside the hashes that prove the files are unchanged.

**You provide** `events`, each with `type`, `actor`, `ip`, `revision`, `at`, and `byAI`.

**A table, not a feed.** This gets read months later in a dispute, scanned for one row. Event type in `mono`, IP and revision in `mono-small`.

**A blank is stated, never empty.** In non-production the IP may be unavailable; render "Not available". An empty cell in an evidence table is worse than an absence stated plainly — the reader cannot tell missing from zero.

**AI actions are events, not annotations.** An assistant appears in the `actor` column in `ai`, in the same table as everyone else, with the `ai` icon beside it.

**Verify gives a verdict in words.** Pair the hashes with a result that reads "Matches — this file is unchanged since sealing" or "Does not match", with what to do next. Never a green tick alone.

## Do

- Put the consent text, exactly as shown to the signer, beside the trail.
- Give every hash a copy control.

## Don't

- Don't paginate or filter the trail by default. It is short and it is evidence.
- Don't let anything in this view be editable.
