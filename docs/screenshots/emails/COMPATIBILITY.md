# Email rendering evidence

The gallery contains browser-rendered HTML previews for all 13 client/staff messages, each at 375px and 600px in light and dark. Portable HTML and automatically generated plain text are included for each message. Studio list/editor captures cover 375/768/1440 in both application themes, plus phone/tablet navigation and preview controls. All clients, staff and contact data are synthetic; delivery is mocked.

## Checks performed

- One table-based column, maximum 600px; presentation tables, inline background/text/button styling and 96dpi Outlook settings.
- Single real primary link. Classic Outlook gets a conditional fixed-width wrapper and MSO button-padding fallbacks, without a second VML link. Rounded corners are cosmetic and may be square in classic Outlook.
- System/Arial font fallbacks only; no web-font files, Google requests, scripts or external layout assets. Workspace logo is optional; workspace name is the fallback. Preview images can be embedded from private workspace storage.
- All default messages omit pricing. The sender footer and workspace contact line share one content source with the plain-text alternative. Authored rich links/lists have readable text equivalents.
- Browser checks assert a primary CTA, no horizontal overflow at 375/600, sample/real data, live button-label changes, rich-text editing, unknown-field blocking, self-only test recipients, template-independent sends and immutable history. Live Studio previews disable all links.
- Explicit dark color styles preserve readable paper/text/link colors. Buttons retain the workspace accent and a contrasting label. Mobile padding/type sizes have inline desktop fallbacks.

## Native inbox status — pending

Jonathan confirmed there is no mail-rendering service and selected rendered previews for this PR. No authenticated Gmail, Apple Mail or Outlook inbox was made available. **These previews do not establish native mail-client compatibility.** No messages were sent to a real inbox. Actual Gmail desktop/mobile, Apple Mail macOS/iOS, classic/new Outlook desktop/mobile, and their automatic dark-mode inversion still need native checks before claiming those combinations are verified.

The implementation follows [Gmail's supported CSS guidance](https://developers.google.com/workspace/gmail/design/css) and [Microsoft's inline-layout and Outlook rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering). These sources support the conservative layout choices, not a claim that this app's emails were tested in those products. [Can I Email's color-scheme test matrix](https://www.caniemail.com/features/css-at-media-prefers-color-scheme/) also shows why browser dark previews cannot replace client-specific inversion checks.

Native follow-up: use “Send me a test” from each email editor (only the authenticated staff address can receive it), with a verified staff sending domain. Check logo blocking/alt text, long names/button labels, narrow screens, CTA hit area, light/dark contrast and the generated text alternative in each named client. Use dedicated test staff accounts if multiple inbox providers are needed. Signed-copy defaults open the secure proposal page; a genuine signed-copy delivery also attaches its existing PDF. Preview/test messages never sign, track a client view or start billing.

## Reproduce

Run `npx playwright test e2e/emails.spec.ts`, then `node --import tsx scripts/package-email-evidence.ts`. Serve the repository and open `docs/screenshots/emails/index.html`. No provider credentials or environment file is required. The browser test owns a temporary local database and uses a mock transport.
