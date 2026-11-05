# Studio v3: build spec

**Source of truth:** `design/studio-v3/Redesign 14 - Studio v3.dc.html`. Open it in a browser. Frame **1a** is clickable (left nav, emails, templates, products, saved blocks, Workspace sections, the Team ⋯ menu). Frames 1b–1f are phone and **1g** is tablet. `reference/*.png` are renders of every state, made from that file. File names are listed in §12.

**Precedence:** this spec › the prototype › older Studio docs (`design/redesign/…07 - Studio`, `Redesign 12 - Studio v2`). Where the prototype shows sample data, build from real data. §2 lists the places where the prototype is wrong or out of date. Follow §2 there.

**Design system:** the same one the editor v2 uses (PRs #50–#56, #63–#75). That means `src/app/foundation-tokens.css` with the Yeswell staff tokens (Ink #13303A primary, Clay accent, Mist/Light clay in dark mode). It also means the editor shell, the floating edit bar (#73 placement rule), `DialogActions` (#73: Cancel left, primary right), `ToolbarPopover`, chips, pills and switches. Reuse these components and don't fork them. Every hex in the prototype maps to an existing token; if one doesn't, add the token in one place. Light and dark mode both apply.

**Scope:** Phase 1 (§4–§9) rebuilds Studio as drawn using the settings and data that exist today. New settings that the app doesn't support yet are **hidden** in Phase 1, not shown disabled. Phase 2 (§10) adds four owner-approved features, one PR each.

---

## 1. Structure

Two kinds of page:

- **List pages** sit in the normal app shell (Yeswell sidebar): Templates & blocks, Emails, Products, Connections, Workspace, Activity log.
- **Editors** open full-screen in the editor shell: one 56px header, a canvas, and a collapsible right panel with tabs. The editors are templates, saved blocks and emails.

One primary action per page: a dark Ink pill at the top right. Everything else is an outline button or a text link.

Routes. Keep the existing ones and their redirects in `src/lib/staff-routes.ts`:

| Route | Page |
|---|---|
| `/studio/templates` (`?view=blocks` selects the Saved blocks tab) | Templates & blocks |
| `/studio/templates/:id` | Template editor |
| `/studio/blocks/:id` | Saved block editor (new route; `/studio/templates?view=blocks` stays the list) |
| `/studio/emails`, `/studio/emails/:key` | Emails list, email editor |
| `/studio/products` (`?item=` opens the detail panel) | Products |
| `/studio/connections` | Connections |
| `/studio/workspace?view=<section>` | Workspace with that section selected (`brand`, `fonts`, `money`, `styles`, `billing`, `team`, `signatory`, `client-links`, `email-sending`, `pricing-references`) |
| `/studio/activity` | Activity log |

**Sidebar (desktop ≥1100px):** Yeswell logo (reversed in dark mode), then the workspace switcher, then Home · Proposals · Clients, then the STUDIO label and the six Studio areas, with the user at the bottom.
- With one workspace (today), the switcher is a static label with the workspace logo and name and **no chevron**. The chevron and menu appear only when a user belongs to more than one workspace.

**Tablet (700–1099px, frame 1g):** the header holds the Yeswell logo, the workspace label and the avatar. The Studio areas become a horizontally scrolling chip row under the header, with the active chip in Ink. Workspace sections become wrapping chips. Same bottom tab bar as phone. Tables stay as rows. Every control keeps a 44px target.

**Phone (<700px, frames 1b–1f):** Studio is a bottom-bar tab.
- The Studio home is one row per area, each with a **real** one-line status:
  - "3 templates · 9 saved blocks"
  - "8 client emails · 2 edited"
  - "7 products · synced 4 min ago"
  - a warning-colored problem line when a connection needs attention
  - "Brand, team and signatory"
  - "Last: {latest activity}"
- Each area opens its list with "‹ Studio". Editors use the phone editor pattern: the edit bar docks above the keyboard, and the panel tabs open as a sheet from ⋯.

---

## 2. Corrections to the prototype (follow these, not the drawing)

1. **Staff emails: there are 9, not 10.** Remove the read-only "Billing needs attention" row. It is the same template as **Job needs attention** (`staff_billing_failed`).
   - Groups:
     - Client activity: opened, declined
     - Signatures: client signed, agreement completed, signed document copy
     - Billing: client completed billing setup
     - Team and jobs · editable: Job needs attention, Team invite, Team password reset
   - Tab counts always come from the data.
2. **Email wording doesn't change.** Defaults stay exactly as in `src/lib/email-template-content.ts`. The prototype's Team invite text ("…on Yeswell… works for 7 days… Accept invite") is illustrative only. "Reset to default" restores the current defaults.
3. **Button captions per email.** "Button label · opens the secure proposal" applies to client emails only.
   - Team emails: "opens the set-password page".
   - Staff notifications: "opens the proposal record".
4. **Fields per email.** The Fields tab lists only the fields valid for that email, using the existing per-template allow-list:
   - `team.*` + sender + workspace for Team emails
   - `job.*` + proposal for Job needs attention
   - client/proposal/quote fields for client emails
   - For read-only emails, the Fields tab is replaced by the read-only note, so the tabs are Details · Plain text.
5. **Previews are the real renderer.** The canvas shows the email exactly as it is sent. Staff emails carry the Yeswell product line (#71), not the workspace brand header the prototype draws. Client emails show workspace branding plus "Powered by Yeswell" when that setting is on.
6. **The template Blocks tab is the full #73 Blocks catalogue, plus a Saved blocks group.** It is not saved blocks only.
   - The catalogue includes Heading, Paragraph, lists, Divider, Image, Pricing / Quote, Contract, Signatures, Client signature, Company signature and Page break.
   - Same click/drag/keyboard insertion, insertion line, signature rules and "Signatures" heading as the proposal editor.
   - Saved blocks are listed below with "Insert" and drag handles.
7. **Template Default quote and Sections reuse the editor.** Default quote uses the proposal editor's Quote tab rows (collapsed rows that expand, sub-lines, Choose one, Optional · ticked). Sections uses the editor's Sections nav (grouped by PAGE N). Don't build the prototype's simplified copies.
8. **Saved block copy.**
   - The block editor's footer note must match how sending works since 3 Nov: "Sent proposals that aren't signed yet update on the same link when you save them; signed proposals never change." The prototype's "then send the update" is wrong.
   - Phase 1 has no linking (see §10.1). Until then, the "Used in" tab is hidden and the header Save says "Save".
9. **Stripe mode is real.** The card says "Connected · test mode" or "Connected · live mode" from `BILLING_MODE` and the account, and never "Live" while in test. The other connection states also come from the existing health checks: QuickBooks today is "Setup needed" / "Sandbox configured". The prototype's QuickBooks "Reconnect needed" is sample data.
10. **Pricing references move from Connections to Workspace › Pricing references.** Use the same `ReferenceDocuments` component. The linked playbook keeps its hourly auto-refresh and manual Refresh.
11. **Client links.**
    - "Link domain" is read-only text from `APP_URL` ("Change domains in hosting settings"). There is no input; the domain plan comes later.
    - Keep the existing **Workspace timezone** (missing from the prototype) in this section.
    - "Default password" maps to the existing `default_password` setting.
12. **Billing defaults follow the owner's decision (5 Nov), not the prototype's toggle.** See §6.5.
13. **Team keeps every #67/#68 capability.** The ⋯ menu also has **Resend invite** (pending invites) and **Send reset email**. Role select and ⋯ are disabled for yourself where the server forbids it. Deactivated members are dimmed and show **Reactivate**. Remove is disabled with its reason while the member owns open proposals, and the reason links to "Reassign proposals…". "Recent changes" (team audit) stays as a link to the Activity log filtered to Team.
14. **Workspace switcher and avatar.** Use the Yeswell lockup for the app and the workspace logo in the switcher. No hard-coded "MarketFresh".
15. **Autosave.** "Changes save automatically" means each control saves on change (text after 600ms idle or blur). Each section has an inline "Saved" or error state that keeps the typed value. Super-admin-only controls are disabled for Staff, with one line saying who can change them. Server permissions don't change.

---

## 3. Shared patterns

- **Page header:** serif page title (existing H1 style), one-line description, primary pill on the right, and optional meta under the description (e.g. "● Synced with Stripe 4 min ago · Sync now").
- **Segmented tabs** ("Templates · 3 / Saved blocks · 9", "Client emails · 8 / Staff notifications · 9"): the existing segmented control, with counts from data.
- **Filter chips** (Products, Saved blocks, Activity): Ink fill when active, outline otherwise. On tablet and phone they become a native `<select>` when there are more than four.
- **Rows and cards:** 14px radius surfaces, 1px border tokens, rows ≥52px, and a chevron on clickable rows. The whole row is the target, and it's a real link (middle-click and keyboard work).
- **Right panels** (product detail, editor panels): 400px, collapsible with `»`, and ⌘\ toggles them like the editor.
- **Dialogs:** `DialogActions` only.
- **Empty states:** each list has one. Saved blocks: "No saved blocks yet. Select any block in a proposal or template and choose ⋯ › Save for reuse." Templates: "Create your first template". Activity: "Nothing yet".

---

## 4. Templates & blocks (list) — reference `01-templates`, `01b-saved-blocks`

**Templates tab:**
- Primary button: **New template**.
- A grid of cards, 3 across at 1440, 2 at tablet and 1 at phone. Each card has a cover thumbnail, the template name, and meta: "{n} sections · used {n} times · edited {date}".
  - The thumbnail is a small static render of the template's first page: workspace fonts, title and placeholder lines, as drawn. Don't run a live paginated render per card.
  - "Used {n} times" counts proposals with this `template_id`.
- Below the grid, a **Saved blocks** preview: the 4 most recently edited, plus "See all {n}", which switches tabs.
- Search filters by name.

**Saved blocks tab:**
- Primary button: **New block**, which creates an empty Text block and opens its editor.
- Type chips: All · Text · List · Contract clause · Image, with counts.
- A table with the columns Block (name plus a one-line plain-text preview, ellipsized; field chips render as their labels), Type, Used in, and Last edited ("Edited {date} · {name}" or "Default").
  - "Used in" is hidden until Phase 2 linking exists.
- Footer hint: "To save a new block, select any block in a proposal or template and choose ⋯ › Save for reuse." Use the real menu label.

---

## 5. Editors

### 5.1 Template editor — `08-template-*`

- This is the editor v2 shell (`quote-editor` / the Studio template editor from #59/#73), not a new editor.
- **Header:** "‹ Templates" · template name (editable inline, as today) · save state ("Saved · changes apply to new proposals") · undo/redo · **Preview** (outline; PDF preview as today) · **New proposal from this** (primary; opens the New proposal sheet with this template preselected).
- **Left:** Sections nav (reuse).
- **Canvas:** the template rendered with field chips.
- **Right panel:** Default quote · Fields · Blocks · Styles.
  - **Default quote:** the editor Quote tab components (§2.7). Note under the tab: "Lines added to every new proposal from this template. Prices are left blank or copied from the catalog; the app never fills them in for you."
  - **Fields:** the editor Fields cards (click to insert at the cursor).
  - **Blocks:** §2.6.
  - **Styles:**
    - FONTS row: "{heading} · {body}", "From Workspace › Proposal fonts", **Change**. Change opens the existing font override for this template, or links to Workspace when there's no override.
    - Then all the existing template style controls (`ProposalStyles` in template mode).
    - Then a **HEADER & FOOTER** group:
      - Show header and Show footer switches.
      - Header and Footer rows with a one-line summary ("Workspace default · logo left, title right") and **Edit**. Edit selects the band on the canvas and opens its edit bar (#59 behavior).
      - Band height, Divider line, and Cover page (Hidden/Shown).
      - The note "Editing the header here makes it unique to this template. Proposals made from it start with this version."
      - **Reset to workspace default** (outline, full width; confirm with Undo, as today).
    - Every control in this tab already exists (#58–#66). This is a layout, not new behavior.

### 5.2 Saved block editor — `09-block-*`

- **Header:** "‹ Saved blocks" · block name · type pill · save state ("Edited · not saved" in warning tone) · **Duplicate** (outline) · **Save** (primary; Phase 2 makes it "Save changes" with the When-you-save choice).
- **Canvas:** one white sheet (max 640px) showing the block exactly as it appears in a proposal: proposal fonts, workspace styles, field chips. Caption above it: "Shown as it appears in a proposal. Fields fill in with each client's details." The floating edit bar follows the #73 rule and offers the controls valid for the block type (paragraph style, B, I, lists, link, Size, Field).
- **Right panel (Phase 1):** Fields · Details.
  - Details: Name (input), Type (select, only types the content can convert to), "Edited {date} · {name}", "Created {date} by {name}", then **Delete block** (danger outline).
  - Delete confirms through `DialogActions`, with Cancel focused first. Copy: "Removes it from Saved blocks. Copies already in templates and proposals stay as they are." Phase 2 changes this to count linked templates.
- **Phone (1f):** the same, with the edit bar docked and tabs in the ⋯ sheet. Phase 2 adds the "Used in" summary row.

### 5.3 Email editor — `07-email-*`

- **Header:** "‹ Emails" · email name · status ("Workspace default" / "Edited {date} by {name}" / "Staff notification · read-only") · **Reset to default** (text button; only when edited; confirms) · **Send me a test** (outline; sends to the signed-in user only, as today) · **Save** (primary; hidden for read-only).
- **Canvas toolbar (left):**
  - Show fields / Show values.
  - When Show values is on, a **sample proposal** select. The default is a built-in sample client; the select lists recent proposals. Values come from the existing `emailValues` sample/proposal resolution.
- **Canvas toolbar (right):** Desktop / Phone width (phone = 375px frame) and **Dark** (renders the email in dark mail-app colors).
- **Canvas:**
  - "From {sender} · {workspace}".
  - The subject line, editable in place, with field chips.
  - The email card, rendered by the real email renderer with workspace branding.
  - The body is editable in place with the same Tiptap setup the email body uses today (RichText). The floating edit bar has B, I, bullet list, numbered list, link and `{ } Field`, and follows the #73 placement rule.
  - The button label is editable in place, with its caption beside it (§2.3).
  - Footer text is not editable.
- **Right panel:** Fields · Details · Plain text.
  - Fields: search; cards showing label, token and sample value; click inserts at the cursor in the subject or body (§2.4).
  - Details: sent when / to / from / button opens / attachments / test emails, from the email's definition and real data.
  - Plain text: generated read-only text, exactly what's sent.
- **Read-only staff emails:** no Save or Reset. The canvas isn't editable. The panel shows the read-only note.
- **Phone (1d):** the edit bar docks above the keyboard; ⋯ opens Fields / Details / Plain text as a sheet; Save sits in the header.

---

## 6. Workspace — `05-ws-*`

- Desktop: a section list (left, 200px, active item with an Ink left rule) and one card at a time (right). Tablet and phone: chips, then the card.
- Header: "Workspace", "How proposals look and who can send and sign them.", and "Changes save automatically" on the right (§2.15).
- Sections, in this order: Brand · Proposal fonts · Money · Proposal styles · Billing defaults · Team · Signatory · Client links · Email sending · Pricing references.
- Each section uses the existing settings and endpoints. This is a re-layout of `WorkspaceStudio` and `team-studio.tsx`.

### 6.1 Brand
- Workspace name; logo (preview, file name and size, Replace); accent color (4 swatches plus a hex input, with a contrast note: "✓ Readable on white (7.1:1)" or a warning).
- **Show "Powered by Yeswell"** switch (Super admin only), with the description "A small line at the bottom of client pages and emails. Never shown on the PDF."

### 6.2 Proposal fonts
- Headings and Body selects (curated plus uploaded, as today), uploads with the license confirmation (existing), and a live preview card.

### 6.3 Money
- Currency select and Cents (Only when needed / Always), with a preview line. Existing setting.

### 6.4 Proposal styles
- The existing workspace-default `ProposalStyles` controls, laid out as rows. Then a HEADER & FOOTER group (Header and Footer with summary and **Edit**, Band height, Cover page). The workspace band editors are the existing ones.
- Phase 1 shows only controls that exist today. The prototype's Body size, Page margins and Quote layout are Phase 2 (§10.3), unless a control already exists, in which case show it.

### 6.5 Billing defaults (owner decision, 5 Nov) — reference `05-ws-Billing-defaults-v2.png` (supersedes `05-ws-Billing-defaults.png`)
- Subtitle: "Where each kind of charge is billed after a client signs."
- Rows, as in the v2 reference, with two corrections:
  1. **Recurring services** [Stripe badge]. Description: "Hosting, care and other monthly or yearly services. New clients pay through Stripe Checkout; existing subscribers have the items added to their subscription, with no payment step." Right side: live Stripe status **with the mode** ("Connected · test mode · Manage"), where Manage goes to Connections. No control.
  2. **Do not build the "Existing Stripe subscribers" toggle** shown in the reference. Adding items to an existing subscription is a fixed rule, already stated in row 1.
  3. **One-time fees** [QuickBooks badge]. Description: "Project fees, including the Own It Over Time kickoff. Until QuickBooks is connected, staff record the invoice number on the proposal." Right side: live QuickBooks status ("Not connected · Connect" / "Sandbox configured · Manage" / …), which goes to Connections.
  4. **Payment methods.** Phase 2 (§10.4). Hidden in Phase 1.
  5. A collapsed **More billing settings** disclosure at the bottom holding the existing settings: Stripe collection (`collection_method`: Charge automatically / Send invoice) and QuickBooks services item reference.
- This matches the code: `bill()` sends `one_time` lines to QuickBooks and recurring lines to Stripe. Don't change billing logic in Phase 1.

### 6.6 Team (frames 1a and 1g; `05-ws-Team*`)
- Description: "Super admins manage Studio, billing and the team. Staff draft, edit, send and countersign."
- **Invite** (primary in this card).
- Each row has the avatar, name, email, status ("You" / "Active" / "Invite sent {date}" / "Deactivated"), the role select (Super admin / Staff), and ⋯. The ⋯ menu: Set password… · Reassign proposals… ({n} open proposals) · Resend invite / Send reset email · Deactivate (Blocks sign-in. History is kept.) or Reactivate · Remove from team (danger; disabled with "Reassign proposals first" when needed).
- Footer: "AI assistants like Claude are managed in **Connections**, not here." Every behavior is from #67/#68 (§2.13).

### 6.7 Signatory
- The company signatory name and title (existing), plus "Can countersign on {name}'s behalf": the list of members with Always/Never (existing delegation rule).

### 6.8 Client links
- Links stay valid for (existing default validity, in days; "Never" = indefinite), Workspace timezone, Default password, and Link domain (read-only; §2.11).

### 6.9 Email sending
- Phase 1 rows:
  - Sending domain (existing value and verification status, plus **Change** to the existing setting).
  - Reminders: the existing reminder days and on/off, as one row. Description: "Sends 'Reminder · unopened' or 'Reminder · viewed, not signed' as appropriate."
- Reply-to, separate reminder timing, Stop after, and Remind staff to countersign are Phase 2 (§10.2).

### 6.10 Pricing references
- The existing `ReferenceDocuments` component (§2.10). Description: "Internal documents staff and assistants can read while writing a quote. They never set prices."

---

## 7. Products — `03-products*`

- **Header:** "Products". Description: "Services you can add to a quote. Stripe products keep their Stripe price; custom families are priced on each proposal." Sync meta: "● Synced with Stripe · test {relative time} · Sync now". **New custom family** (primary).
- **Chips:** All · Stripe · Custom families · Archived, with counts. Search box on the right.
- **Table:** Product (name plus description), Price (formatted per Money; "Entered per proposal" for custom), Plan terms ("30 payments, then $100/mo · 18-month minimum", or "—"), Source (Stripe / Custom pill).
- **Detail panel** (row click, 400px, `»` to close; `?item=`):
  - Name on proposals and Description the client sees (existing `display_name` / description overrides).
  - Price (read-only), with **Edit in Stripe ↗**: a dashboard link for the price in the current mode. Note: "Synced from Stripe. Change the price there and it updates here."
  - The plan terms card for Own It Over Time (Kickoff, Monthly, Payments to own, After that, Minimum term, plus the sentence).
  - Used in: "{template names} · {n} open proposals".
  - Custom families show their own fields (existing family form). Archived items show **Restore** where that exists today.
- The app never sets or suggests prices.

---

## 8. Connections — `04-connections`

- Groups: BILLING (Stripe, QuickBooks), EMAIL (Email sending), AI ASSISTANTS (Claude, plus any other connected assistants), IMPORTS (Proposify).
- Each card has the monogram, name, a state dot and label, one line of real detail, and **one** action (outline; primary when it's the fix, e.g. **Reconnect**). A card that needs attention gets the warning surface.
- Every state, detail and action comes from the existing `ConnectionsStudio` data and health checks (§2.9).
- AI assistants keep the existing grant and revocation management. The action opens it in a panel or sheet.
- The Proposify card keeps the existing import details and the read-only-imports note.
- Pricing reference is no longer here (§2.10).

---

## 9. Activity log — `06-activity`

- **Header:** "Activity log". Description: "Everything that happened in the workspace, by whom. Proposal records keep their own full audit trail." **Export CSV** (outline; the existing CSV export with the current filters).
- **Filter chips:** All · Proposals · Signatures · Billing · Emails · Studio changes. Map them to the existing activity types; add a "Team" chip because team audit events exist. Search box on the right.
- Grouped by day ("TODAY · NOVEMBER 5", "YESTERDAY · …", then dates) in the workspace timezone.
- Each row has the time, an actor avatar (initials; "AI" pill-avatar for assistants; a neutral dot for system and clients), a sentence with the actor in bold, and one link on the right (Open / View / Review) to the proposal, email or setting.
- Pagination is "Load more" at the bottom (existing paging).

---

## 10. Phase 2 (owner-approved; one PR each, after Phase 1 merges)

### 10.1 Linked saved blocks
- Saved blocks inserted into a template stay **linked** (store `saved_block_id` and `saved_block_version` on the inserted block). Proposals created from a template keep the link as a reference but own their copy.
- Block editor right panel: **Used in · Fields · Details**.
  - Used in shows TEMPLATES · LINKED (each "Updates on save") and DRAFTS WITH A COPY · {n} (title, status, owner).
  - It then shows WHEN YOU SAVE, with two choices:
    - **Templates and new proposals** (default): "Drafts keep their current copy. This is the safe default."
    - **Also update {n} drafts**: "Replaces this block in the drafts listed above. Any edits made to it in those drafts are lost."
- Rules:
  - Never change sent or signed versions.
  - Unsigned **sent** proposals are not in the draft list. Each one gets a proposal-level ⋯ › **Replace with latest block** that replaces the block in that proposal; saving it goes live on the same link (3 Nov rule), and the action shows that before confirming.
  - Updating drafts is one transaction, recorded in each draft's timeline and in the Activity log.
- List columns: Used in ("In 3 templates") comes back; phone 1f gets the summary row; Delete shows the linked count.
- Tests: link persists through template save; save with each option; drafts with local edits are replaced only with "Also update"; sent and signed versions are untouched; "Replace with latest block" on a sent proposal publishes a new version on the same link.

### 10.2 Email reminder rules
- Email sending gains these rows:
  - Reply-to: Sender (default) / Workspace sending address.
  - Not opened: after {n} days; sends "Reminder · unopened".
  - Viewed, not signed: after {n} days; sends "Reminder · viewed, not signed".
  - Stop after {n} reminders.
  - Remind staff to countersign: Off / Next morning / After {n} days. This uses a new staff email "Countersign reminder" (read-only, Signatures group).
- Migrate existing `reminder_days` into the new fields so the schedules don't change.
- Manual-delivery proposals keep automatic reminders off by default (#70).
- Cron changes are idempotent.
- Tests: each rule fires once at the right time in the workspace timezone; the stop-after cap; reply-to header.

### 10.3 Proposal style options
- Workspace defaults (overridable per template in Styles):
  - Heading color: Ink / Accent / Custom, if not already covered by the per-level color.
  - Body size (14–18px).
  - Page margins: Narrow 0.6in / Normal 0.9in / Wide 1.1in, on Letter.
  - **Quote layout: Cards / Table.** Table renders line items as a table on the client page, the PDF and the editor, with identical pagination. Choose-one and optional items keep their behavior and accessible controls.
- Frozen versions keep their resolved styles.
- Tests: editor/PDF/client geometry match for each margin and layout; old proposals render unchanged.

### 10.4 Billing defaults options
- Add **Payment methods** for Stripe Checkout (Card; Card + US bank account/ACH), passed to Checkout Sessions. Stripe test mode only until live activation.
- The routing rule (one-time → QuickBooks, recurring → Stripe) is fixed and is not a setting.
- A workspace-level "One-time fees via Stripe Checkout" option for white-label workspaces without QuickBooks is **deferred**. Don't build it.
- Tests: the Checkout session gets the configured methods; existing-subscriber add-items path unchanged.

---

## 11. Don't change

- Signing, countersigning, readiness rules, the PagePlan format, sealed PDF and certificate.
- Billing routing and Stripe/QuickBooks logic (except §10.4), and short links and rate limits.
- Team permissions and server-side role checks; email default wording (§2.2).
- The proposal editor's behavior. Studio reuses it.

## 12. Reference renders (`design/studio-v3/reference/`)

| File | Shows |
|---|---|
| `01-templates`, `01b-saved-blocks` | Templates & blocks, both tabs |
| `02-emails`, `02b-staff-emails` | Emails list, client and staff (see §2.1) |
| `03-products`, `03-product-oiot`, `03-product-custom` | Products and detail panel |
| `04-connections` | Connections |
| `05-ws-*` | Workspace: every section, plus the Team ⋯ menu (`05-ws-Billing-defaults-v2` is the current Billing defaults) |
| `06-activity` | Activity log |
| `07-email-*` | Email editor: fields, values, details, plain text, dark, Team invite, read-only staff email |
| `08-template-*` | Template editor tabs |
| `09-block-*` | Saved block editor (Used in = Phase 2) |
| `10-phone-a`, `11-phone-b` | Phone frames 1b–1f |
| `12-tablet` | Tablet 1g |

## 13. Suggested PR split (Phase 1)

1. **Studio shell and list pages:** sidebar (logo + switcher), tablet chips, phone Studio home. Also Templates & blocks list, Emails list, Products + detail panel, Connections, Activity log, and Workspace (all sections) including Team.
2. **Template and saved block editors** (§5.1–5.2).
3. **Email editor** (§5.3), including phone.

Each PR: tests and the full suite pass, plus screenshots at 1440 (light and dark for at least one page), 768 and 375 of every changed page, compared side by side with the matching `reference/` render.
