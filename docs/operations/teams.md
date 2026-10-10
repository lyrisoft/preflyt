# Teams

Open **Administration → Teams**. Owners and Admins can create teams from existing organization members, or import teams from the linked GitHub organization. Teams organize people and engineering requirements; they never grant workspace or GitHub access.

## Workflow

1. Create a local team, or discover/import a GitHub team. Imports are read-only and start with no approved repository policy scope.
2. Review repositories and explicitly select policy scope. Only authorized, selected repositories are available.
3. In Standards & policies, choose exact standard versions, a profile and an explicit branch. Preview added checks and conflicts.
4. Apply the unchanged preview to create repository standards selections and policy drafts together. Concurrent changes require another preview.
5. Review CI source mappings for the new selections, produce fresh assessments, then approve and publish through Policies. Normal independent approval and the audited local Super Admin exception still apply. Ruleset activation remains its separate approved workflow.

Effective impact links to repository policy status. Published does not mean all checks passed. Assessments and gates retain their existing exact-commit evidence rules; missing required evidence remains incomplete.

## Permissions and sources

`team.read` is available to existing organization readers. Owner/Admin roles have `team.manage`, `team.import` and `team.policy.assign`. Policy Managers can assign only within their authorized repository scope; assignment requires management of every target repository. Team membership does not alter roles or access grants.

GitHub import requires a linked organization, an active installation and Organization Members: read. Names and membership are GitHub-owned; Preflyt stores provider IDs, snapshots and separately approved policy scope. Signed organization, team and membership webhooks mark imported snapshots stale and invalidate cached authorization. Subscribe the App to these events with Organization Members: read. Events never approve repository scope or grant local membership. Manual synchronization remains available. The worker reconciles at most five stale GitHub teams per minute using the original importer’s current authorization, with a fifteen-minute target refresh. It never substitutes a privileged actor or approves newly discovered repository scope. If the importer loses authority, an authorized administrator must explicitly resynchronize. Failed reads preserve scope and mark it stale; snapshots older than 24 hours require sync before assigning or publishing inherited policies. Removed GitHub access marks the association unavailable without deleting its history. Source sharing with AI is unchanged.

Assignments freeze standard versions, digests and source records. Requirements combine additively; conflicting versions or AI review definitions prevent application. Ordinary repository standards edits cannot remove active inherited controls or lower the profile. Metadata/member edits alone do not change scope revision. Scope changes require review of affected drafts; existing published history is retained.

## Deployment and limits

Back up the database, run `pnpm --filter @preflyt/api prisma:migrate`, regenerate Prisma and build API/web before restarting. Migration `20261010010000_teams_policy_scope` adds tables and an optional standards-selection context; it does not reset or delete existing data. Docker and Kubernetes deployments use the same migration and API. Migration `20261010050000_finding_lifecycle` additionally records assignment supersession and enforces one organization baseline. No new execution service is required.

Limits: 500 teams per organization; 100 members and scoped repositories per local team; 100 assignments per team; at most five composed packs. GitHub reads are bounded to 1,000 entries per directory and 2 MB per response; exceeding limits fails without partial reconciliation. Team list pages contain 20 rows, detail lists 10; Activity exposes the most recent 100 events.

Use **Organization baseline** to create one shared policy group covering all currently selected repositories. Preview and apply standards through the existing flow. New repository scope requires explicit approval and reapplication; repository edits cannot weaken or silently bypass a baseline. In Standards & policies, select **Upgrade** for an active assignment, choose exact versions, preview and apply. Upgrades retain old assignment records, supersede the old contribution and create new policy drafts. Existing published definitions remain immutable and old inherited sources become stale until reviewed publication. Checks and profile cannot be removed or lowered through an upgrade. Nested scope expansion uses the explicit child-scope review below; scope-removal waivers remain pending. Neither assignment nor import activates GitHub enforcement automatically. Fixture verification does not establish live GitHub import acceptance.

Manual removal of a covered repository is blocked while the team has an active standards assignment. A normal team edit cannot bypass inherited requirements. Scope expansion remains explicit and invalidates earlier policy sources. Reviewed scope-removal exceptions are still pending; this safeguard does not implement or claim exception approval. GitHub access loss continues to mark source evidence unavailable and block publication without deleting scope history.

## Review child team repositories

In the team's Repositories tab, choose child teams, select **Preview scope**, review the exact repository union and select **Approve scope**. This records approved child versions and repository associations. It does not grant access, change an existing policy or activate a GitHub ruleset. Reapply standards through the existing preview and assignment flow to create policy drafts for the expanded scope.

The API requires current management access to every repository. Imported GitHub parents accept only current direct GitHub children from the same organization and installation; sync must be fresh. Child scope changes or revoked repository access invalidate inherited policy evidence until reviewed again. Existing published history is preserved. Cycles are rejected; one review supports up to ten children, eight levels, 100 visited teams and 100 repositories. Removing approved child coverage remains blocked until reviewed exceptions are available.

Migration `20261010143000_reviewed_nested_team_scope` adds one JSONB field with an empty default. Existing teams retain their current scope. It creates no background scope expansion or execution service.
