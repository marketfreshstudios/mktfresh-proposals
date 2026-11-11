# Proposal details page: build spec (Redesign 24)

Visual reference: `Redesign 24 - Proposal Details.dc.html`: frames 4a–4n2 (one per state, desktop 1440) and 5a–5h (phone 375 and tablet 768). Tokens are in `specs/tokens.css` and match `src/app/ink-clay-tokens.css`. Copy rule: never use "·" as a separator. Use " | ", a comma or a line break.

Target: `RecordV4` in `src/components/records.tsx`, with styles in `src/app/ink-clay-records.css`. Keep every API call, guard and handler. This is a re-layout and a hierarchy change.

## 1. Page order
1. **Toolbar:** "← Proposals", then Preview as client (outline), the state's main button, and ⋯. There are no icons inside text buttons. Imports have no Preview.
2. **Hero** (ink #13303A, 22px corners, 26px 28px padding, 22px gap):
   - **Row 1, left:** client name (600 15px, #A9BCC2), then the status chips, then the h1 title (DM Serif 40/46, white), then "Prepared by {owner}" with 24px initials (500 14px, #D3DEE1). The owner comes from the same lookup the old Details "Owner" used.
   - **Row 1, right:** One-time and Monthly as DM Serif 40/46 white figures, each with a 12px uppercase label underneath, right-aligned, 32px apart. The figures' tops line up with the title's top (`align-self:flex-start; margin-top` equal to the chip row height plus the gap). Never combine the two figures.
   - **Row 2: lifecycle steps**, left-aligned and stretching across the hero until the Billing status.
     - Steps: Draft, Sent, Viewed, Client signed, Countersigned. Countersigned means completed.
     - Each step is a fixed 96px column with its dot centered above the label.
       - Done: 12px white dot.
       - Current: 16px dot with a 3px #E07A4A ring and an ink fill, a bold label and `aria-current="step"`.
       - Future: 12px #4F6B75 dot.
     - Connectors are flex:1, 2px high, 7px from the top, ending about 8px from each dot. They're white when done and #36525C otherwise. All dots are opaque.
   - **Billing status:** shown only when the proposal bills through Stripe or QuickBooks. It sits right of the steps after a 1px divider, as a "BILLING" label with a value: "Starts after signing", "Starts after you countersign", "Set up" or "Needs attention" (#FF9A8C). It's hidden otherwise, and billing is never a step.
   - **Row 3, after a hairline:** the next-step eyebrow (#F6C9AE, or #FF9A8C for problems), a DM Serif 24/30 headline, a 14px sentence, then up to two buttons on the right (white main, ghost secondary). The copy for each state is in the frames.
3. **Details**, one horizontal card across the page with an h2 above it:
   - Items in a wrapping flex row, 32px apart, each starting at the same top. Labels are 12px uppercase #56646A, with 10px between label and value.
   - Items:
     - **Client:** name, then email.
     - **Sent:** the date only.
     - **Expires:** hidden once both parties have signed.
     - **Reminders:** the switch plus "Next on {date}" while it can run. Otherwise the reason, for example "Stopped after signing".
     - **Client link:** the URL as plain 14px text with a 32px copy icon button (Lucide copy, 16px, `aria-label="Copy client link"`). When the link is closed, the URL is struck through with no icon, plus a note saying what the client sees.
     - **Documents:** only after both signatures. It lists Final sealed PDF and Client-signed PDF, or Imported PDF and the audit trail for imports.
   - Owner is removed from Details.
4. **Two columns:** `grid-template-columns:minmax(0,1fr) 340px; gap:32px`. Sections are 32px apart, with 12px between each h2 and its card. Every heading is an h2 outside its card (DM Serif 26/32, ink), with any action on the right of the heading.
   - **Main column:**
     - **Client questions:** only when the client has asked at least one. It shows the open count chip and Reply.
     - **Quote:** lines, then "Client sees by default", then the One-time and Monthly tiles. The heading has Edit (only while unsigned and not imported) and Open document.
     - **Signatures:** client and company boxes. The box that signs next gets a 2px ink border.
     - **Billing:** only when billing is integrated. It has Monthly and One-time rows with status tags, plus Retry billing when there's an issue.
   - **Right column:**
     - **Engagement:** visits and reading time, plus the most-read sections. Before the first open it shows the empty state "Not opened yet". Hidden for imports.
     - **Timeline:** the Evidence link in the heading. The list is capped at 260px tall and scrolls inside the card (tabindex 0, labelled), with 28px top padding.
   - **Files section:** removed. Its PDFs move to Details › Documents. Download PDF stays in ⋯.

## 2. States (frames)
- **4a Sent, not opened:** Send reminder now and Copy client link. Engagement shows its empty state.
- **4b Viewed with a question:** Reply to question is the main hero button.
- **4c Viewed:** no questions section.
- **4e Client signed:** Review and countersign. Edit is disabled with "Signed proposals are locked."
- **4f Completed:** both signed, billing set up, Documents shown.
- **4g Completed, billing not integrated:** no Billing status or section.
- **4h Billing issue:** Resend payment link and Invoice manually.
- **4i Declined:** shows the client's note, with Duplicate as new draft.
- **4j Expired:** Extend link and Duplicate.
- **4k Lost (marked by staff):** Mark as sent again.
- **4l Archived:** a neutral banner, with Unarchive as the main button.
- **4m Proposify import:** read-only. No Preview, no Edit, no steps, no Engagement.
- **No "changes not sent" state:** saved edits go live in the client view right away, unless an edit breaks a send rule (4n, 4n2).

## 2a. 4n / 4n2: Edits not live
Applies only to Sent or Viewed proposals that aren't signed yet. A saved edit that breaks a send rule (required pricing missing, kickoff amount not entered, an unfinished [bracketed note], business state not set, and so on) saves but doesn't go live. The client keeps the last version that passed. Use the reasons the app already returns (the editor header shows "Not live" and the first reason).

**4n (no open question; based on 4c):**
- **Hero row 3, problem variant:**
  - Eyebrow "Edits not live" in #FF9A8C.
  - Headline "Your latest edits aren't on the client's link yet".
  - Sentence "The client still sees the version from {date}. Fix this to publish your changes:"
  - Then a list of reasons, at most 3, plus "and {n} more" when there are more.
  - Buttons: **Fix in editor** (white, opens the editor at the first problem) and **Preview what the client sees** (ghost, opens the live version in preview).
- **Steps:** stay on Viewed. There is no extra step.
- **Details › Client link:** the URL and copy button as usual, then a muted note "Shows the version from {date}".
- **Quote card:** a slim neutral notice at the top (#F4F7F7, hairline below) reading "Showing your latest edits. The client sees the version from {date}.", with a "View live version" text link.
- **Timeline:** the newest entry is "Edited, not live yet | {time} | {person}", with a red (#C2412F) dot.
- Everything else matches 4c.

**4n2 (with an open client question; based on 4b):**
- The question keeps the hero (Reply to question).
- A slim banner above Details (#FBE9E7 ground, #F0C5BE border, #5A1D14 text, 12px corners) reads "**Edits not live.** The client still sees the version from {date}. {first reason}, and {n} more.", with a "Fix in editor" text link.
- The Client link note, Quote notice and Timeline entry are the same as 4n.

**Never shown** once either party has signed.

**Tests:**
- Not-live reasons render, capped at 3 with "and n more".
- The banner replaces the hero variant when an open question exists.
- The state is absent after signing.

## 2b. Phone and tablet (frames 5a–5h)
**Phone (under 700px):**
- **Hero:** becomes the ink page header, containing:
  - "‹ Proposals" and a 44px ⋯ button
  - client name and chips
  - the title in DM Serif 28/34
  - "Prepared by"
  - One-time and Monthly in DM Serif 26
  - a compact progress line, "Step {n} of 5 | {status}", over a 5-segment bar (done white, current #E07A4A, future #36525C), with "Billing: {status}" on the same line when billing is integrated
  - the next step
- **Bottom bar:** sticky and white, holding the state's actions as 48px pills. Countersign is clay, other main actions are ink, secondary actions are outline. The phone tab bar is hidden inside a proposal.
- **Section order:** Client questions (only when asked), Quote, Signatures, Billing (only when integrated), Details, Engagement, Timeline. On Completed, Details moves above Quote.
- **Details:** a two-column grid. Client, Client link and Documents span both columns. The copy icon is a 44px target.
- **Engagement and Timeline:** collapsed to one-line cards with a summary, "Show" and a chevron.
- **Countersign:** a bottom sheet (690px, 22px top corners, grab handle) showing what was agreed, both signature boxes, the on-behalf checkbox and a full-width clay Countersign button.

**Tablet (700–1099px):**
- The 64px ink top bar, then the desktop order in one column.
- Hero figures at 32/38. The steps use 84px columns. The hero buttons stack on the right.
- Details is a four-column row.
- Signatures shows two boxes side by side.
- Engagement and Timeline sit side by side at the bottom.

## 3. Not in scope
The client question flow and the email log (`ProposalEmailLog`).

## 4. Done when
- Every state matches its frame at 1440.
- The step connectors end at equal distances from both dots.
- Details values share one top line.
- The prices top-align with the title.
- Hidden sections leave no gaps.
- There are no "·" separators, and every icon-only button has an aria-label.
- Tests:
  - Questions hidden when there are no threads.
  - Billing status hidden without integration.
  - Documents only after both signatures.
  - Expires hidden after signing.
  - Edit hidden once signed.
