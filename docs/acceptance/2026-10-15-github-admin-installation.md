# Admin GitHub installation flow

Implementation is local and unverified. No tests, builds, commit or push were run
for this change, as requested. The migration was written and Prisma Client was
regenerated; the migration was not applied to an application database.

## Change

- Successful App registration continues into the session-bound installation flow.
- Settings, Overview and repository connection actions use that same flow.
  Settings distinguishes saved App credentials from a connected organization.
- OAuth verifies GitHub organization ownership and is revoked after use. It does
  not create a GitHub login account, replace the session cookie or merge identities.
- Workspace creation, repository import, original-session workspace selection,
  audit event and one-time callback consumption are atomic. Callback state,
  browser, exact initiating session, configured App and expiration are checked.
- GitHub installation-selected repositories are imported with tracking enabled.
  Background sync follows newly granted repositories for these connections;
  explicit Preflyt exclusions and existing legacy installation behavior survive.
- Existing workspace permission, installation revision and repository ownership
  checks prevent cross-workspace claims or moves. Ordinary GitHub sign-in and
  explicit identity/workspace linking remain available.

## Prepared verification, not executed

Integration regression cases cover identity/session preservation, one-time replay,
browser/session/App/expiration binding, ownership denial, revoked admin access,
cross-workspace protection and repository import/exclusion behavior. Existing
manifest callback and setup prompt regression expectations were updated.

Pending: migration application in an isolated database, API/browser suites, build
and type checks, plus live installation with GitHub security confirmation and
return to the original admin session. Current Docker images do not include this
source change.
