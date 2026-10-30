# Live app review — visual comparison

The gallery pairs the application at 375, 768 and 1440 in light/dark with matching or contextual served redesign frames. Screenshots use neutral local staff/client fixtures and mocked integrations. No real customer, credential or owner signature is captured. Jonathan’s requested changes take precedence over the older frame labels, sample content and font count.

| Change / captures | Reference | Result |
| --- | --- | --- |
| Contact copy actions on directory and detail | 6a–6f | Directory columns/cards and labelled contact card retained. Values copy with a toast; separate labelled Mail/dial icons remain. Phone number itself dials below 700px. |
| Linked customer and unlink confirmation | 6d–6f (context) | Only the saved customer remains, with ID/date/card/subscriptions/monthly total. Unlink is named, confirmed and audited; candidates return only after unlink. The new chooser/confirmation have no exact old frame. |
| Empty/partial/complete first-run Home | 8a (context) | Static connection copy is replaced by five real-status rows. Completed rows have checks and no action. QuickBooks/manual invoicing is optional; complete required setup collapses to New proposal. |
| Products navigation and billing mappings | 7b / 7g | Warm table/cards and responsive Studio navigation retained. “Products” replaces Catalog; accounting text explains actual provider/manual outcomes. Tooltips work on pointer/focus; detail copy explains missing mappings. Smaller screens now retain accounting information. |
| Template header and shared controls | 7a / 7f | Fields, Save template and the input share a 44px baseline. Native checkboxes/radios/switches are centered left of labels with an 8px gap; full labels are touch targets. Search/new-client and product filters use the same sizing rule. |
| Editor product picker and Optional switch | 2a / 2d / 2e / 5h | Product wording is visible in the quote picker. Phone edits use the item sheet; tablet/desktop use full item controls. The 44px touch target overrides the previous editor-specific 40px rule. Frame 2e is contextual for the item sheet. |
| Proposal font groups / upload license | 7d (context) | Both roles list the real fonts in Serif/Sans groups, with existing Mono/uploaded choices retained. The nine additions extend the old frame. The license row follows the upload field directly; the actual font name is its preview. |

Desktop, tablet and phone captures were checked for horizontal overflow. Browser assertions cover copy success/toast, explicit Mail/tel targets, phone dialing layout, linked-only cards, confirmed unlink/audit, setup actions, redirects, mapping explanations, equal control heights, aligned labels, all 12 heading/body choices and upload-license adjacency. Shared control changes also pass the existing client signing/choice-group and editor regressions.

The older source exports may produce identical light/dark variants; the manifest/gallery explicitly identifies identical reference images rather than fabricating an alternative. Current application captures use both real themes.

## PDF font specimens

`fonts/report.json` records embedded font names and frozen-version hashes for all 12 curated families. Each corresponding PDF contains heading/body, regular/italic/bold/bold-italic examples and a separate audit page. Poppins, Fraunces and Merriweather first-page PNGs were rendered and visually inspected. PDF checks run offline in CI and reject missing family embedding or mutation of the frozen version.

The new WOFF2 files preserve upstream font data and variable axes; Poppins supplies six static faces. Space Grotesk has no native upstream italic, so Chromium synthesizes that style. See `public/fonts/GOOGLE-FONTS-SOURCES.json` and each OFL file for pinned provenance and license text.
