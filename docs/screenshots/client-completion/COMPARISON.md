# Client completion and editor controls

The newer live-review instructions take precedence over contextual design exports. All data and signatures are synthetic; provider responses are mocked.

- Reading/contact: 1a and 5a/5b. The sender contact appears once at the page bottom; mailto name and copyable email remain separate actions. No client verification button.
- Signing: 1d and 5c/5d. Contact remains at the shared footer, without an extra local sender block.
- Billing: 1e/1f. Monthly/yearly recurring items belong to their actual pending Checkout or existing-subscription addition. One-time fees sit separately with manual/QuickBooks copy. Card-only setup states explicitly take no payment. No combined charge figure.
- Billing/completed expanded reading: document width is numerically checked against the main reading column at 375/768/1440, with 5a/5b as reading context. Completed state uses 1g; 1h is a stale-link frame and is deliberately excluded.
- Proposal/reminder email: new layouts with one CTA, authored note and sender footer. Screenshots use the completed-page frame only as contextual branding reference; there is no exact email design frame.
- Certificate: an actual rendered PDF page, not a facsimile HTML screenshot. It fits on one Letter page, includes both typed/drawn signatures and a delegated actor, and excludes internal events. The downloadable PDF includes the signed document body plus that certificate. Light/dark previews surround the same printable white certificate.
- Editor: compare actual main commit `734b026` with the shared block-frame implementation, including nested clauses. 375/1440 before captures run an isolated copy of main; new controls are additionally captured at 768. The geometry test records every block, hovers/focuses each in turn, checks all block coordinates/sizes and scroll within 1px, and verifies one toolbar/handle, persistent selection, Escape and touch pointer selection. AI review does not add/remove a content row. A permanently reserved control strip and attached toolbar avoid text overlap on touch; long bars scroll horizontally.

Source frames with identical light/dark exports are identified in the manifest/gallery, rather than recolored. Existing signed snapshots/files, raw events and provider configurations were not changed.
