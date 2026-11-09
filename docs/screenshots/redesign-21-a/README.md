# Redesign 21 owner review A

The implementation screenshots use synthetic fixtures. Desktop captures are 1440px wide and the phone captures are 375px wide.

| Screen | Implementation | Reference |
| --- | --- | --- |
| Home with an empty Expiring card | ![Home](home-1440.png) | ![R19 Home](reference-r19-1a.png) |
| Underlined navigation tabs | ![Proposal tabs](proposal-tabs-1440.png) | ![R19 Proposal list](reference-r19-1b.png) |
| Segmented editor controls | ![Editor tabs](editor-tabs-1440.png) | ![R19 Editor](reference-r19-2c1.png) |
| Templates with warm card mats | ![Templates](template-cards-1440.png) | ![R21 Templates](reference-r21-1g.png) |
| 3a Stripe connected | ![Stripe connected](3a-stripe-connected.png) | ![R21 3a](reference-r21-3a.png) |
| 3b Stripe menu | ![Stripe menu](3b-stripe-menu.png) | ![R21 3b](reference-r21-3b.png) |
| 3c Stripe not configured | ![Stripe not configured](3c-stripe-not-connected.png) | ![R21 3c](reference-r21-3c.png) |
| 3d Real Stripe product sync | ![Stripe syncing](3d-stripe-sync.png) | ![R21 3d](reference-r21-3d.png) |
| 3e QuickBooks connected | ![QuickBooks connected](3e-quickbooks-connected.png) | ![R21 3e](reference-r21-3e.png) |
| 3f QuickBooks menu | ![QuickBooks menu](3f-quickbooks-menu.png) | ![R21 3f](reference-r21-3f.png) |
| 3g QuickBooks disconnect | ![QuickBooks disconnect](3g-quickbooks-disconnect.png) | ![R21 3g](reference-r21-3g.png) |
| 3h QuickBooks reconnect needed | ![QuickBooks reconnect needed](3h-quickbooks-reconnect.png) | ![R21 3h](reference-r21-3h.png) |
| 3i QuickBooks not connected | ![QuickBooks not connected](3i-quickbooks-not-connected.png) | ![R21 3i](reference-r21-3i.png) |
| 3j QuickBooks as Staff | ![QuickBooks Staff](3j-quickbooks-staff.png) | ![R21 3j](reference-r21-3j.png) |
| 3k QuickBooks on a phone | ![QuickBooks phone](3k-quickbooks-phone.png) | ![R21 3k](reference-r21-3k.png) |

- [Phone actions sheet](3k-quickbooks-phone-menu.png) follows the 3k bottom-sheet pattern.
- [Email sending](connection-email-1440.png), [AI assistants](connection-assistants-1440.png), and [Imports](connection-imports-1440.png) use the R21 3a title, tiles, and two-column panels.
- [Waiting for countersignature](invoice-awaiting-countersignature-1440.png) uses the proposal record’s existing Billing rows and rectangular status chip.
