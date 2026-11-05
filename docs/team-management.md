# Team management — PR #67

Started from merged main `2dfab93`. Stored roles remain `owner` and `member`; the interface calls them **Super admin** and **Staff**. No real address is committed. The PR description contains the full hosted migration and the owner's email-based promotion query; neither is run against hosted data here.

## Owner decisions

The owner approved a service-only, workspace-scoped Auth-session revocation function because Supabase's admin sign-out requires the target user's JWT. Deactivation/removal use the admin ban API plus `team_private.revoke_staff_sessions`, callable only by `service_role`, with a fixed empty search path and fresh actor/tenant checks. It removes only that person's Auth sessions/refresh tokens and revokes their workspace connector grants. Reactivation requires a fresh sign-in/reconnection. Password updates use `auth.admin.updateUserById`, whose password-change transaction revokes sessions; their workspace connector grants are revoked too. Every staff request also checks current membership and the JWT's Auth session; connector access and refresh check active membership.

Removal is blocked by unfinished native proposals sent by this person or unsent drafts they created. The error lists each proposal with a link and offers **Deactivate instead**. Deactivation is allowed despite unfinished work, subject to the last-active-Super-admin and no-self-deactivation guards. No reassignment feature is added. Completed, declined, expired, archived and imported records do not block removal. The Auth user, past signatures, events and identity snapshots remain intact.

## Staff lifecycle

Studio → Workspace → Team (or `/studio/workspace?view=team`) lists name/email, role, Active/Invited/Deactivated status and last sign-in. Super admins invite, resend, edit names/roles, set/reset passwords, deactivate/reactivate and remove. Staff see the list without management menus and can change their own display name/password. The local development token mode stays as before; invitations/password administration require Supabase Auth.

Invites use `auth.admin.generateLink(type: invite)` and the app's existing email provider/layout. Already-confirmed Auth identities with no current membership use a recovery link to accept a fresh invitation; an identity belonging to another workspace is rejected before Auth mutation. Resends issue a fresh link. Invite and reset templates are editable in Studio → Emails by Super admins. Other email-template permissions remain unchanged.

The button opens `/set-password` with the one-time credential in its fragment, which is removed from browser history after reading. The page verifies the credential on submission, sets the password, activates membership, records the change and creates fresh HttpOnly access/refresh cookies. GET/link previews do not consume invitations. Expired links show **Ask your admin to resend**. Tokens and passwords never appear in response JSON. The email log snapshots the rendered message with its credential redacted; it cannot be used to take over an account.

Admin-set passwords are entered twice with a show/hide control. **Ask them to choose a new password at next sign-in** defaults on. That sign-in lands on Set your password, and all other staff pages/APIs remain blocked until completion. Super admins cannot set their own password through another-user actions; their profile change verifies the current password. New passwords require at least eight characters and also pass Supabase's configured project policy. Passwords are never persisted, emailed or placed in audit records.

`change_team_member` serializes membership changes on the workspace row, verifies the current actor and target tenant, protects the last active Super admin and commits the mutation plus append-only audit together. The Team **Recent changes** list presents the actor, target, time and old/new values in readable wording. Audit names survive removal.

## Existing Super-admin-only permissions

The existing code does **not** restrict entire Workspace, Connections, Products or Emails sections to owners. This PR preserves that behavior:

- Workspace: changing the default client-link password, verified sending domain, or company signatory/delegates is Super-admin-only (previously owner-only).
- Other workspace branding/fonts/styles, product/template/reference editing, catalogue sync, connection status/assistant management, imports and ordinary editable email templates remain available under their existing staff permissions. Stripe/QuickBooks secrets remain deployment configuration; no new credential-management UI is introduced.
- New in this PR: membership/role/status/invite/other-user password actions and editing team invite/reset templates require a Super admin. Own display-name/password changes remain available to Staff.
- Company countersignature identity and delegation, proposal signing, billing, readiness, PagePlan and MCP's draft-only scope are unchanged. The existing workspace identity directory retains inactive identities so saved signatory settings are not silently changed; active authentication is enforced separately. Inactive membership additionally stops use of staff APIs/connectors.

## Hosted rollout

Apply the migration SQL from the PR **before merging/deploying**, then run the separate promotion query and check its result. This app now reads the new membership fields and session-check function, so deploying before the SQL is applied will deny staff access. The promotion snippet exists only in the PR description. No Auth user, email, hosted database or resource was changed during development.

The revocation function is in a non-exposed schema, has no public/anonymous/authenticated execution grant, and checks workspace ownership again before touching Auth. RLS prevents deactivated/invited/password-change-required identities from reading workspace data; team audit is append-only. Local database tests apply all migrations and test service/Staff/anonymous boundaries, last-admin protection, session/refresh/connector revocation and tenant isolation.

## Screenshots

Neutral local fixtures only:

- [Super admin list](screenshots/team-management/team-super-admin.png)
- [Actions menu](screenshots/team-management/team-menu.png)
- [Set password dialog](screenshots/team-management/set-password-dialog.png)
- [Invite dialog](screenshots/team-management/invite-dialog.png)
- [Invite email](screenshots/team-management/invite-email.png)
- [Set your password page](screenshots/team-management/set-password-page.png)
- [Staff read-only list](screenshots/team-management/team-staff.png)
- [375px Team list](screenshots/team-management/team-phone.png)

## Validation

Final local validation: **392 unit/database tests passed (72 files); the full browser suite passed 201 tests with four optional capture checks skipped (205 total, 14.4 minutes)**. The two Team browser flows also passed three consecutive runs (six passes). TypeScript, formatting, neutrality, the production build and the **328-file API/PDF runtime trace** pass. All 12 curated fonts embed offline. Native Chromium and packaged x86 Linux/Vercel checks pass for old planned, old unplanned and large-band sealing/preview fixtures, including certificates and exact-once completion copies. Requested neutral screenshots are committed. No hosted mutation or real email was performed; apply the hosted SQL and promotion query before merging/deploying. Do not wait for GitHub CI or merge automatically. Tests use local/mock Auth, database and email fixtures. The repository's local Supabase advisor was attempted explicitly with `--local`; no local Supabase server listens on port 55322, so the advisor could not connect. No hosted advisor or SQL call was substituted. The PGlite migration/RLS/revocation checks pass. Hosted invite delivery and the project's actual password policy require owner verification after applying SQL/deploying.
