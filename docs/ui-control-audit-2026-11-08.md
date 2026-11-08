# Action button, form and menu audit — November 8, 2026

The [189-site form inventory](form-control-audit-2026-11-08.csv) lists every source location, control type, label/name and treatment. Regenerate it with `node --import tsx scripts/audit-form-controls.ts`. Browser coverage checks the rendered controls in Workspace, proposal panels, template and email editors, client previews and error pages, at desktop and phone widths. A source-contract test prevents new native selects/switches bypassing the shared controls.

## Action buttons changed

Only corner geometry changes in this list; padding, dimensions, colors and handlers stay the same.

| Surface | Actions using the shared pill/round radius |
| --- | --- |
| Shared staff/client button | Primary, secondary, outline, ghost and danger buttons: Create/New, Save/Save changes, Cancel, Close, Back in dialogs, Continue, Confirm, Delete, Duplicate, Edit, Restore, Reset, Preview, Send and Reopen |
| Save/recovery/status surfaces | Keep, Discard, Reload, Retry, Sign in, Undo, dismiss/close and Refresh |
| Deployment notice | Reload / Save and reload and Later |
| Editor header | Preview PDF, Preview as client, Review & send, Copy client link, AI review pill, Undo/Redo and ⋯ |
| Document toolbar | Text-style and Size triggers, B/I, lists, link, Field, move arrows, duplicate, save block, More, Delete and inline formatting |
| Image/cover/band toolbar | Replace, Alt text, Align, Spacing, Reset size, Delete, image actions, Line, Layout, Done and More; upload action labels and confirmation hit-area outlines |
| Insert/review controls | Add above/below (already round), Add page, BlockMenu Close/Cancel, AI check (already round), review and feedback actions |
| Quote panel | + Custom, + Sub-line, Details, Remove, sub-line ×, price-review choices and Send footer actions; Add product stays a select |
| Band controls | Reset, OK, Use shared, Undo, phone Cancel and band action triggers; menu rows retain their menu shape |
| Studio and dialogs | Invite, edit/save/password actions, Team actions trigger, reassign, copy, upload/replace/remove, sync/connect/test, recovery actions, template/saved-block actions, library copy/reset confirmations |
| Emails | Save, Send me a test, Reset, Dark preview action and formatting actions; Desktop/Phone and Show fields/values keep their preview-tab shape |
| Contact actions | Copy icon is round; adjacent phone/email navigation links retain their shape |
| Client/sign/billing rendering | Shared action buttons, sign/decline confirmations, password/continue actions, download/retry/copy and empty/error state actions |
| HTML email | CTA link and its containing cell use 9999px; wording, size, color, target and sending logic unchanged |
| Shared design-system CSS | Base button and toolbar action rules use the same token; focus no longer resets button corners |

Navigation exclusions retain their existing CSS: Studio/sidebar/Workspace section lists, editor tabs/dock, Sections item rows, breadcrumb/back navigation, preview tabs, list/catalog/field cards, dropdown/menu rows, panel rails and collapse arrows. Ambiguous input-like setting segments (Density, Ink/Accent/Custom and band height), color-field triggers, Go to controls and drag/resize handles also retain their existing shape. Color palette swatches remain circles. None of these controls gets a pill override. The browser audit checks the straight Workspace and Sections indicators, the Studio sidebar and tablet chips, the phone bottom navigation, and the editor panel tabs.

## Form controls

| Kind | Audit result |
| --- | --- |
| Text/email/password/contact | Shared field defaults and focus; contextual widths, masks, validation, show/hide and submission unchanged |
| Number, currency and quantity | Field corners and focus; currency/unit adornments and number validation unchanged; quote compact sizing retained |
| Spacing px fields | Same field contract; slider limits, live updates, undo grouping and px units unchanged |
| Textareas | Same typography/corners/focus; multiline height and resizing remain contextual |
| Native selects | Every location now uses `Select`: Billing Payment methods/collection method, reply-to/reminder timing, currency/fonts/styles, sender/client/country, quote interval/product/alternative/family, block type, preview data, team role, reassignment, cover settings and saved-block replacement |
| Add product combobox | Uses the same native Select contract and chevron; search/list behavior unchanged |
| Other searchable comboboxes | Existing text-input/listbox semantics and handlers retained; field focus remains shared |
| On/off switches | Every location now uses `Switch`: Workspace brand/preferences/reminders/engagement, proposal reminders/password, quote Optional, template availability, cover/header/footer/line switches |
| Checkboxes | Native checked semantics and 18px visual with existing full-label phone targets retained; switch-specific dimensions no longer override them |
| Radios | Native grouping, keyboard selection and existing label targets retained |
| Segmented controls | Existing input/preview semantics, active-hover palette, dimensions and corners retained |
| Color fields | Existing shared popover, palette-first swatches, hex validation, contrast warning and input-like trigger retained |
| Date fields | Native date behavior, shared UI font/focus and field corners; formatting/validity rules unchanged |
| Search | Shared UI font/focus/corners; existing search results and 40/44px contextual targets unchanged |
| File uploads | Existing hidden inputs, validation, previews and Replace/Remove behavior retained |

The Payment methods defect was an unwrapped native select: it received only chevron padding, not the field's left inset/typography. Switch defects came from competing Workspace/Quote/Band rules plus an old `!important` checkbox sizing rule. The shared components remove both paths for drift.

## Menu audit

Floating menus are checked at 1440, 1024 and 375px: proposal header, template header, template cards, text style, Size, More block actions, record header, proposal rows, Team rows and email formatting. Saved-block/template/email phone tools retain bottom sheets, with screen-edge placement checks. The saved-block editor has no additional desktop header ⋯ to invent; its existing block toolbar and Details actions remain available.

The template header menu was clamped into the paper text column even though its trigger belonged to the header. At 1024 the same constraint displaced a body toolbar's More menu. Menus now use the trigger's viewport coordinates; compact header menus use content width. Modal action menus share the same flipping calculation and update on scroll/resize. Menu keyboard/focus behavior is retained and the #101 tests remain in the suite.

## American spelling compatibility

Visible source copy, emails/PDF text definitions, current starter copy and Markdown/JSON documentation use American spelling. Stored `accent_colour`, style `colour`, internal CSS identifiers, `/catalogue` redirects and archive paths remain unchanged. Historical migration payloads and exported design HTML remain historical; their old values are not rewritten in place. CI runs `check:english`. New default-copy migration and guarded starter rollout: [instructions](rollout/american-english-starters.md).
