# Yeswell identity and domain plan

Yeswell is the product; workspace names and branding belong to individual tenants. Staff pages, authentication, install assets, assistant identity and staff email product lines use Yeswell. Proposal paper, client pages and client correspondence retain their workspace logo, accent and sender. The optional attribution sits outside the document and is never printed into PDFs or the completion certificate.

## Domain plan (no deployment changes)

The generic app will use `app.yeswell.co`; branded workspaces will use `{workspace}.yeswell.co` (workspace 1: `marketfresh.yeswell.co`). Optional custom domains can follow later.

No environment variables, DNS records or hosted resources change here. Link generation continues to use the validated `APP_URL` via `appOrigin()`/`proposalLink()`; OAuth uses its configured issuer. A source audit of `src/`, `scripts/` and `.env.example` found **no hard-coded `proposals.mktfresh.com` URLs** in link-building paths. Historical handoffs and screenshots describe prior deployments and are not runtime URL sources.

## Storage

`show_powered_by` is an optional workspace-settings JSON field, parsed as true when absent. Only a super admin may change it. Public state and newly prepared client emails consult the current workspace value, including existing links. Sent email snapshots stay unchanged. No hosted SQL is required.

## Palette

Staff primary buttons, selected navigation and focus use Ink `#13303A`; dark mode uses Mist `#EEF3F3` against dark surfaces. Clay `#C2602F` is the accent source; light-surface text uses its AA darker derivative `#A44D23`, and dark mode uses Light clay `#E08456`. Workspace accent values and paper tokens are unchanged. Brand files are copied from `design/brand/yeswell/` into public assets; horizontal logos stay at least 96px wide, with small surfaces using the mark.
