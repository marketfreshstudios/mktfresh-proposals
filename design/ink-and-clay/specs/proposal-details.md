# Proposal details page: build spec (Redesign 24)

Visual reference: `Redesign 24 - Proposal Details.dc.html`, frames 4a–4m (one per state). Tokens are in `specs/tokens.css` and match `src/app/ink-clay-tokens.css`. Copy rule: never use "·" as a separator. Use " | ", a comma or a line break.

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
- **No "changes not sent" state:** saved edits go live in the client view right away.

## 3. Not in scope
The client question flow, the email log (`ProposalEmailLog`), and tablet and phone layouts. For now, below 1100px stack Details, then the main column, then the right column.

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
