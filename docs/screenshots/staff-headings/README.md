# Staff heading outline and editor header review

## Evidence at 1440px

- [Templates](templates-1440.png): the starter terms and sample guidance are plain muted text. The library template has Default in its detail line and no Starter chip. Sample remains a separate chip.
- [Saved blocks](saved-blocks-1440.png): the list starts with the shared Saved blocks section heading.
- [Template editor](template-editor-1440.png) and [proposal editor](proposal-editor-1440.png): both ink bars use a borderless back link. The template's editable name has 11px on each side.

## Outline audit

Each route has one H1. Conditional sections appear only when they have content or an empty state that needs a title. Table labels, list entries, filters, field labels, status chips and typography samples are not headings.

| Screen | H1 | H2 sections and nested headings |
| --- | --- | --- |
| Home | Greeting (Home while loading) | Pipeline, Expiring this week, Set up workspace (H3 needed and optional groups), Needs your attention (H3 proposal titles), Recent proposals |
| Proposals, including Archived and other views | Proposals | Report drill-down heading or empty-state heading when applicable; view tabs and table column names are not headings |
| Proposal record | Proposal title | Next step, Quote, Signatures, Billing, Email log, Files, Details, Timeline, Engagement and Questions; H3 for their subsections |
| Proposal editor | Proposal title | Sections and the selected tool, such as Quote, Readiness or Pricing reference; authored headings remain in the canvas |
| Clients | Clients | Empty-state heading when applicable; table column names are not headings |
| Client record | Client name | How they’re billed, Proposals, Notes, Activity, Contact details |
| Reports | Reports | Value signed, Pipeline by stage (H3 stage groups), Sent vs signed by month, Breakdowns (H3 By template and By owner), Engagement (H3 Most-read sections and Client questions) |
| Studio landing | Studio | Navigation cards are links |
| Templates | Templates & blocks | Templates (H3 template card titles), inactive defaults warning when applicable, Saved blocks preview |
| Saved blocks | Templates & blocks | Saved blocks |
| Template editor | Template name | Sections and the selected tool, such as Default quote, Fonts or Header & footer |
| Saved block editor | Saved block name | Templates · linked, Drafts with a copy, or the selected tool |
| Emails | Emails | Email stage groups such as Send, Follow up, Questions, Sign and Billing |
| Email editor | Email name | The rendered email title and selected inspector content |
| Products | Products | Product name when a product is open (H3 How this product is billed, Plan terms and Used in as applicable; H4 for nested copy preview) |
| Connections | Connections | Billing, Email, AI assistants and Imports; H3 provider cards |
| Stripe connection | Stripe | How billing uses Stripe, Products, Connection, Recent activity, or setup sections |
| QuickBooks connection | QuickBooks | Setup or reconnect sections, or How billing uses QuickBooks, Connection and Recent activity |
| Email sending connection | Email sending | How Yeswell sends email, Connection |
| AI assistants connection | AI assistants | Connect or reconnect an assistant, Connected assistants |
| Import from Proposify | Import from Proposify | What imports do in Yeswell, Import records |
| Workspace › Brand | Workspace | Brand (H3 Brand colors) |
| Workspace › Proposal fonts | Workspace | Proposal fonts; the font sample is not in the heading outline |
| Workspace › Money | Workspace | Money |
| Workspace › Proposal styles | Workspace | Proposal styles (H3 Body size, Page margins and Quote layout) |
| Workspace › Billing defaults | Workspace | Billing defaults (H3 payment and provider settings) |
| Workspace › Team | Workspace | Team (H3 Your profile) |
| Workspace › Signatory | Workspace | Signatory (H3 countersign permissions) |
| Workspace › Client links | Workspace | Client links |
| Workspace › Email sending | Workspace | Email sending (H3 reply-to, notifications and reminder settings) |
| Workspace › Pricing references | Workspace | Pricing references (H3 Status and Pricing reference for assistants, H4 Add/Edit reference) |
| Activity log | Activity log | Date groups |
| Account › Profile | Your account | Profile |
| Account › Sign-in & security | Your account | Sign-in & security |
| Account › Notifications | Your account | Notifications |
| Account › Signature | Your account | Signature |
| Account › Preferences | Your account | Preferences |
| Sign-in states | Sign in, Verify your sign-in, Your account is paused, You no longer have access, or You were signed out | Form and status copy |
| Password reset and email change | Reset your password, Check your email, Choose a new password, Link expired, Deactivated account, Confirm your new email, or Email changed | Form and status copy |
| Shared dialogs and editor drawers | Underlying page title | Dialog title is H2 (including New proposal, Sections and editor tools), with H3 for subsections |

The audit checks the loaded page, accessible heading order, and the New proposal dialog. It excludes author-controlled document content from the application heading-order rule; that content keeps its own outline. The labeled email preview is audited as a separate document and keeps the sent email’s native H1. The client, PDF and sent email keep their existing headings and markup.
