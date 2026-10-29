# EmptyState

The screen when there is nothing to show — and the three versions of that are not interchangeable.

**You provide** `title`, optional `text`, an `icon`, and `actions`.

**Nothing yet** gets a create action. "No proposals yet — start one from a template and it will appear here."

**Nothing matching** gets a clear-filters action and must **never** offer create. The thing the user wants probably exists; offering to make a second one is the wrong help.

**Nothing wrong** is the third, and it is the normal state of `/integrations`. Say so deliberately: "Nothing needs attention. Every billing link is synced and no customer matches are waiting." Drawn as an absence it reads as broken.

## Do

- Keep `text` under about 46 characters a line — the component caps the measure.
- Use `verified` as the icon for the healthy-empty case, `search` for no-results, the object's own icon for nothing-yet.

## Don't

- Don't offer "New proposal" under a filtered-out list.
- Don't write an onboarding tour here. Two owners use this product daily.
