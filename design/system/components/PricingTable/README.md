# PricingTable

The quote as the client sees it: required lines locked, optional lines tickable, one-time and monthly kept apart.

**You provide** `groups` — one per cadence, each with `lines` — plus `currency`, `onToggle`, and `frozen` after signature.

**Cadence is structural, not a column.** Pass one-time and monthly as separate groups. A client scanning the table should be able to answer "what do I pay now, and what do I pay every month" without reading across.

**Required lines render a lock, not a disabled checkbox.** An unusable control invites a click and then does nothing. Omit `optional` and the component renders the locked treatment for you.

**Clients tick; they never price.** There is no quantity stepper and no price input here. `listPrice` renders the struck catalog price beside an override and is **staff-only** — never pass it on a client page, where the client should see only the price they are being quoted.

**`frozen` is what a signed proposal uses.** It locks every checkbox showing the client's actual selections and dims the rows to `opacity-frozen`. The content stays fully readable.

**`schedule` and `minimumTerm` render as their own rows**, never as a tooltip. A term someone is agreeing to must be on the page.

## Do

- Give every optional checkbox a `tap-min` hit area — the component does this, don't override it.
- Put the component on `paper`, inside the document flow, not in a sidebar.

## Don't

- Don't interleave cadences in one list.
- Don't show the override marker to a client.
- Don't leave editing controls present on a frozen quote — `frozen` removes them for a reason.
