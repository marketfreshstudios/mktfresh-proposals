# StickyActionBar

The one piece of chrome on a client page: both totals and `Accept & sign`, always reachable.

**You provide** `oneTime`, `monthly`, `onAction`, and a `secondary` node for decline. `loading` with `loadingLabel` covers the sealing wait.

**It must not cover content.** Give the scrolling document bottom padding equal to the bar's height so the last line of the proposal is always readable. This is the single most common way a mobile proposal page goes wrong.

**Both totals travel with the button.** A client deciding whether to accept needs to see what they are accepting at the moment they decide. The bar stacks on a phone and keeps both figures side by side within the stack.

**The action is `control-xl`.** So is the billing hand-off. These are the two moments the product turns on.

**Decline is `ghost` and secondary** — present, findable, never competing.

## Do

- Pin to the bottom on a phone at `z-bar` with `shadow-bar`, so the document reads as passing beneath it.
- Show `loadingLabel` during sealing: "Sealing your signed copy…".

## Don't

- Don't put a blended total here, or either total without the other.
- Don't hide the bar on scroll. A client who scrolls back up to find it has already hesitated.
