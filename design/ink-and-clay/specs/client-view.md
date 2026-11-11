# Client view and Preview as client: build spec (Redesign 25)

Visual reference: `Redesign 25 - Client View.dc.html`.
- Phone 375: frames 1a–1f.
- Desktop 1440: frames 1g–1j.

Targets:
- `src/components/client-proposal.tsx` (NewClientFlow, PreviewControls, ClientDocument)
- `src/components/proposal-questions.tsx` (ClientQuestions, AskForm)
- the client CSS

Keep the existing flow, the guards, and every `preview` check that blocks submissions.

## 1. Brand and surfaces
- The client side uses the workspace brand: accent (MarketFresh #365C4A), a deep accent for the bar and buttons (#1F3A2E), and the workspace heading and body fonts. Staff ink and clay never appear here, except in the preview bar.
- Neutrals are cool: page #F1F4F5, lines #DCE3E6, controls #C2CDD2. No beige.
- Choose one groups use a tinted accent ground (#EEF3F0, 2px #9DB5A8 border) with radio cards. Optional lines are checkbox cards labeled "Optional". The note "Optional items are your choice. Totals update as you go." stays.
- Money always shows its interval. One-time and monthly are never combined.
- No "·" in copy. Use " | ", a comma or a line break.

## 2. Layout
**Phone (under 700px), frames 1a–1e:**
- White header: brand, a Questions link, and Review | Sign | Billing progress as 4px bars with labels. Billing appears only when it's part of the flow.
- The document runs full width.
- Sticky bottom bar (#1F3A2E): "$X one-time" over "+ $Y/mo", and a white "Review and sign" pill. 52px tall, with 28px bottom padding.

**Desktop, frames 1g–1h:**
- 72px header: brand, "Valid until {date}", and "Your questions (n)".
- A 720px document column of page cards: white, 20px corners, 1px line.
- A sticky 340px column holding:
  1. The "Your choices" card: progress, chosen items, One-time and Monthly tiles, then **Review and sign**, **Ask a question** and the contact line.
  2. The **Your questions** card directly under it.

## 3. Questions by page or block
**One button everywhere:**
- A dark round button (#1F3A2E fill, white Lucide circle-help icon), icon-only, with an aria-label and a tooltip.
- 36px on desktop, 44px on phone.
- On desktop it always straddles the edge of what it belongs to, half on and half off, so it reads as an app control, not proposal content.

**Desktop placements:**
- **Page:** fixed on each page card's top-right corner (`top:-18px; right:-18px`), labeled "Ask about this page".
- **Block:** hovering or focusing a block (paragraph, heading, list, image, quote line) highlights it (#EEF3F0, 1px #9DB5A8 outline, 30px extra right padding). The button straddles that block's own right edge (`right:-18px`), labeled "Ask about this paragraph" or the block's type. It's keyboard-reachable: Tab to a block, then Enter.

**Phone placements:**
- **General:** on the header's bottom edge (`bottom:-22px; right:16px`). The header has 30px bottom padding, so the button clears the progress labels.
- **Block:** tapping a block highlights it, and the button sits inside the block's right edge (`right:8px`, with 60px of reserved right padding). There isn't room to straddle the edge on a phone.
- Section headings have no buttons.

**The ask form** is a bottom sheet on phone and a popover below the block on desktop (380px wide, right-aligned to the block). From top to bottom:
1. An "About this" box: the section name plus a two-line quote of the block, with **Change** (General question, or any H1 section).
2. Name and email, only when `needs_contact`.
3. "Your question": a textarea with a counter out of 2,000, and the helper "Jonathan sees it here. We'll email you when he replies."
4. **Cancel** and **Send question**.

**After sending:**
- A toast: "Question sent. We'll email you when there's a reply."
- The block gets a "Your question | waiting for a reply" marker.

**Your questions:**
- **Desktop:** a card under Your choices.
- **Phone:** a full-screen list from the header link (frame 1e).
- Each question shows its about label (and the quote on phone), the question and its status.
- Before a reply: **Edit**, **Delete** (phone) and **Go to**.
- After a reply: **View reply** and the reply thread.

**API changes needed:**
- Add `block_id` and `excerpt` (at most 200 characters) to AskQuestionSchema next to `section`. Store them on the thread and show them to staff on the proposal details page.
- Add client edit and delete of a question while it has no staff reply: `PATCH` / `DELETE /api/public/:token/questions/:id`. Return 409 once a reply exists.

## 4. Preview as client (frames 1f, 1i, 1j)
- This is the same page, under a staff ink bar (#13303A), which:
  - **Desktop (60px):** "‹ Back to editor", then "Preview, not sent" with "Previewing as {name}. Choices and questions aren't recorded.", a Reading | Signing | Billing switch (replaces the three buttons), Desktop | Phone, and a clay **Send** when `preview_can_send`.
  - **Phone:** "‹ Editor", a "Preview, not sent" chip, a step dropdown, and Send.
- **Phone width on desktop:** the 375px layout centered on a #E8EDEF stage.
- **Questions in preview:** the question buttons open the form, but Send question is disabled with the note "Preview: questions aren't sent from here."

## 5. Not in scope
The Sign and Billing step visuals beyond the progress bar, and the password, ended and expired screens. They keep their current behavior and get restyled later.

## 6. Done when
- Every frame matches at its width.
- On desktop, question buttons straddle their edges and never cover text.
- The phone header button doesn't overlap the progress labels.
- One-time and monthly are separate everywhere.
- Every icon-only control has an aria-label, and every touch target is at least 44px.
- Tests:
  - A block question saves `block_id` and `excerpt`.
  - Edit and delete work only before a reply.
  - Preview can't send questions.
  - Your questions renders under the sign box on desktop.
