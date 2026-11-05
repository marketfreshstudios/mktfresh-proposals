# Team management

Starts from merged main `2dfab93`. Stored roles remain `owner` and `member`; the interface calls them Super admin and Staff. Hosted SQL and the owner promotion query will be supplied in the PR description, without running them or committing real addresses.

## Decisions requiring owner clarification

- Supabase admin `signOut` needs the target user's JWT; the application does not retain other users' tokens. Admin password updates revoke sessions, but banning a user only prevents authentication while banned. Proposed deactivation/removal revocation: perform the admin ban plus a service-only, workspace-scoped database function that deletes that user's Auth sessions and refresh tokens. Keep the membership-status check on every staff/API/MCP request. No sessions from another workspace are touched.
- There is no work-assignment field. Proposed removal blocker: unfinished proposals whose sender is this person, plus unsent drafts created by them, until reassigned/finished. Team removal preserves the Auth user and historical identity.

Implementation, migration, owner-only audit, validation and screenshots will be recorded here before handoff.
