# Organization access and contributors

## Available workflows

- **Access Control** provisions configured-OIDC subjects, assigns predefined organization roles, grants repositories, revokes membership, and displays recent access changes. Only Owners can assign/change Owner and Admin roles. Actors cannot edit their own access; the last active Owner is protected.
- The existing brand dropdown selects a real organization membership. Switching persists the active organization on the current browser session and reloads the document to discard the previous organization's client queries. A new session without a selected organization uses its first active membership.
- Super Admin may explicitly create an organization with itself as Owner. Platform administration alone grants no organization data access. Its recovery login remains separate from OIDC and retains its 24-hour session.
- **Contributors** has repository/time/identity/relationship/search filters, a paginated directory, activity and snapshot-association charts, and six contributor detail tabs. Filters/tabs are URL-backed. PR/commit links and repository/assessment deep links identify the source revision; recorded snapshots never imply passing policy outcomes.

## Permissions and isolation

Every authenticated repository API request checks live organization membership, action permission, repository assignment, selection/availability and active installation before controller execution. GitHub installation permissions remain the provider upper bound. Inventory/dashboard/contributor queries include only authorized repositories; the dashboard Redis key includes the live authorized resource set. Role/grant revocation takes effect on the next API request, including reads of cached dashboard summaries.

Owners and Admins have organization-wide repository access. Policy Managers, Security Engineers, Engineering Leads, Developers, Auditors and Viewers require explicit repository assignments. Policy Managers can draft pack/binding changes; Security Engineers can associate/verify evidence; Engineering Leads/Developers can create immutable assessment snapshots. Auditors are read-only. Viewers can browse the contributor directory but cannot access detailed contributor activity or policy evidence. These capabilities do not grant execution admission, policy enforcement, exception approval, model egress or GitHub write-back.

OIDC subjects use the deployment's configured issuer. Email/GitHub login is never used to match a Preflyt identity. The GitHub connection transaction captures organization context and rechecks connection authority at completion; an existing installation cannot be reassigned to another organization through the callback.

Existing deployment-wide access migrates into `preflyt-default` (Preflyt workspace) using **explicit** organization memberships and repository grants. Existing Super Admin receives an explicit Owner membership in this compatibility workspace only. New organizations do not inherit it. The migration records an audit event and preserves token hashes/expiry, installation ownership and active session context. It runs atomically. Do not remove these membership/grant tables during rollback; a downgrade to the old deployment-wide authorizer would remove isolation.

## Contributor provenance and GitHub load

Signed `pull_request`, `pull_request_review` and `push` events persist minimized, immutable source observations. Stable GitHub user IDs are installation-scoped. Author, reviewer, commit-author, committer and merge-actor associations remain separate. Delivery ID + payload hash detects replay/collision; repeated source objects are deduplicated in summary metrics, and newest source timestamps determine PR state. Raw bodies, commit messages, review text, emails and credentials are not stored.

Ordinary push authors often have names/usernames but no stable provider ID; those identities remain unattributed. No same-name matching or co-author inference occurs. A manual repository import uses existing installation-level rate limits, narrowly scoped read tokens and bounded pages: latest 30 updated PRs, up to 30 reviews for each of the latest 10 PRs, and latest 30 default-branch commits. There is no upstream call on page mount. A durable five-minute window suppresses repeated imports across API replicas; failures release the local request lease, while the provider's own cooldown remains authoritative. Access is rechecked after upstream collection.

List/detail aggregation is bounded to 5,000 observations (plus a sentinel), with explicit truncation, denominators and scoped source links. Narrow the filters if this limit is reached. Counts describe observed participation, not employee productivity. A contributor seen in multiple installations can appear more than once. Last receipt time is distinct from source activity time. GitHub membership remains labeled unlinked; private membership is not inferred.

## Explicitly pending

Published-policy enforcement attribution, lifetime first-pass/final adherence, confirmed findings, team inheritance, per-organization identity providers, comprehensive historical backfill, retention/deletion administration and identity linking are not implemented by this slice. Policy versions remain available in the linked immutable assessment details. No passing outcome, external-member classification, complete organization coverage or employee ranking is inferred.

## Verification

The migration is deployed through the existing Compose migration service; no extra runtime or queue is required. Local upgrade verification checks existing memberships, grants, installations and sessions. Focused integration tests cover cross-organization/repository access, direct API bypass, revoked grants/memberships, Super Admin isolation, role administration, signed event replay and hashes, consistent metrics, real persisted-session authorization and backfill throttling. Existing affected authentication/repository domain integration fixtures mock the authorizer; the new scoped integration tests use its real database implementation. Web unit checks cover permissions and URL filters; API/web TypeScript, scoped lint and production bundling verify the source. Browser/device checks remain skipped by user instruction.

## Contributor profile compliance

Profiles now show a saved-standards compliance summary above activity metrics. Rates use integrity-checked historical gate previews and exact authored PR revisions. Complete coverage and missing/older evidence appear alongside the passing fraction. Different standards versions remain separate; limited collection hides percentages. See [metric definitions and limits](../product/engineering-contributors.md#implemented-profile-compliance). Policy evidence permission and current repository scope are checked independently. No new database migration or upstream GitHub calls are required.

Tabs appear immediately below the filters. The graph and compliance dashboard appear only in Overview, with a 70/30 desktop layout and compact compliance cards. Repositories, Pull Requests, Reviews, Policy Evidence, and Activity page 20 records at a time within their bounded returned collections. Pull Requests deduplicates by repository/number and displays the latest recorded activity. Policy Evidence returns up to 200 PRs and warns when filters must be narrowed. Page/filter state remains in the URL; changing tabs or filters resets pagination.

## GitHub member sync from an existing admin session

After an Owner verifies and links the organization, an active workspace Owner/Admin using the existing OIDC or local recovery session can sync the directory and resolve members for role assignment without changing their sign-in identity. Preflyt verifies the linked App installation's organization ID and requests only Metadata read and Organization Members read. Approve Members: Read-only on the installation if GitHub reports it missing. Sync does not grant access. Member assignment still uses existing authorization, repository scope and audit checks.

GitHub-linked user accounts continue to use their own credentials and verified access; expired or denied user authorization never falls back to the installation token. Local role, organization link and installation revision are rechecked before returning fetched data. Failures stay within Access Control and leave the existing session intact. No identity merge, new organization, migration or worker change is required.


## GitHub organization workspace selector

The sidebar workspace selector shows the connected GitHub organization login, rather than a generic Preflyt workspace label. It lists only the user's authorized connected organizations and marks the current one. Selecting another organization verifies its active membership and changes only the current browser session; a full-page reload clears organization-bound client data. Connecting an App never grants a user membership automatically.

For existing workspaces awaiting explicit GitHub linking, a single active organization App installation can supply the display name. Multiple distinct installation accounts do not become separate workspaces automatically; use verified organization onboarding/linking to establish their identities and memberships. An unconnected recovery workspace retains access to setup in Access Control.
