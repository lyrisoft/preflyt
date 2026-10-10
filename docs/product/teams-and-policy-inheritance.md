# Teams and Policy Inheritance

**Status:** Teams, organization baseline, reviewed version upgrades, scheduled reconciliation and impact preview implemented; explicitly reviewed nested scope is implemented; exceptions remain planned. **No change to P0–P11 phase order.**
**Related:** [PRD](../PRD.md), [Engineering Standards](engineering-standards-library.md), [RBAC](rbac-and-authorization.md), [MVP Experience](mvp-product-experience.md), [Roadmap](../roadmap/incremental-delivery.md).


## Implemented slice (2026-10-10)

Administration → Teams supports local teams, read-only GitHub discovery/import and manual and periodic synchronization, organization baselines, explicit repository policy scope, pinned standard-version assignment, impact preview and saved assignment activity. Detail tabs separate members, repositories, standards/policies and effective impact. Membership never grants workspace or repository access.

Applying an unchanged preview creates repository standards selections and existing policy drafts atomically. Required checks compose additively, the strongest profile wins, and version conflicts block application. Existing approvals, assessments and deterministic gates are reused. Published policy and check publication revalidate inherited source digests and approved scope; stale GitHub snapshots cannot authorize publication. Metadata-only changes do not invalidate policy scope.

Organization baseline assignment, bounded scheduled reconciliation, explicitly reviewed nested team scope and previewed version upgrades reuse the existing assignment flow. This increment does **not** deliver waiver management or automatic enforcement activation. Versions never upgrade automatically. Repository selections change on assignment: CI source mappings and fresh assessments must be reviewed before publication. GitHub imports require a linked organization and installation Members: read permission. Operational bounds and rollout are documented in [Teams operations](../operations/teams.md).

Verification: API integration and Chromium tests cover composition, authorization, explicit scope, failed sync preservation, preview concurrency, assignment, existing approval/publication and UI actions. Fixtures use disposable databases; live GitHub team import is not claimed as accepted.

## Purpose

Allow organizations to create Preflyt teams or import existing GitHub organization teams, then assign **versioned engineering standards and policies at organization, team, or repository scope**. A team-scoped assignment automatically affects the repositories explicitly included in that team's policy scope, removing repetitive per-repository setup.

**Critical distinction:** GitHub team **repository access** does not automatically imply engineering **policy ownership**. Imported accessible repositories must be reviewed and selected for policy scope before team policies apply. GitHub is authoritative for imported team identity/membership and access relationships; Preflyt is authoritative for policy assignment, applicability and enforcement.

## Team types and data model

- **GitHub-imported team:** immutable provider org/team IDs (not name or slug as identity), external slug/display name, optional parent ID, membership and repository-access snapshots, sync cursor/time/status. GitHub remains source of truth; edits to GitHub team membership/permissions are not performed by default.
- **Preflyt-managed team:** Preflyt-owned team ID, name, description, local membership and explicit repository policy-scope assignments; never imply GitHub membership or permissions were granted.
- **TeamRepositoryAssociation:** team ID, repository ID, association origin (GitHub access/import/manual), `policy_scope_enabled`, owner approval, last verification, and lifecycle state. Many-to-many: a repository can be associated with multiple teams.
- **PolicyAssignment:** immutable policy/pack version, scope type (organization/team/repository), scope ID, stage/branch applicability, enforcement mode, authorized actor, effective date and audit record.
- **EffectivePolicySnapshot:** repository, branch, stage, applicable assignment IDs and versions, resolved rule set, conflicts, exclusions, compilation timestamp and checksum.

Keep **team membership and Preflyt RBAC grants separate**. Being on an imported GitHub team must not automatically grant Preflyt admin/policy-manager permissions or access to private repository evidence. Effective access remains the intersection of provider access, Preflyt membership/grants and selected installation repositories.

## GitHub import and synchronization

1. Admin selects a GitHub organization already connected through an authorized installation and requests team discovery.
2. Preflyt verifies GitHub App installation and organization permissions needed for team listing, membership and repository associations; prompt for explicit permission upgrade when necessary. Support paginated API reads and GitHub rate-limit-aware backfill.
3. Display available teams, member/repository counts, parent-team relationships, access coverage, permission gaps and last synchronization.
4. Admin imports selected teams. Display the repository-access list **separately** from the proposed **policy scope**; require explicit confirmation of policy scope for imported repositories.
5. Synchronize team changes through supported events plus scheduled reconciliation; handle deleted/renamed teams, changed memberships, nested teams, inaccessible repositories and GitHub App permission changes.
6. Recalculate effective policies and show a diff before newly discovered GitHub repository associations are allowed to expand **enforced** policy scope. Default to pending approval for scope expansion; for removed associations, stop inheritance according to an explicit approved lifecycle policy, with an audit trail and safe handling of existing gates.
7. Mark stale/incomplete imports and disable destructive reconciliation when GitHub permissions or sync evidence are insufficient.

GitHub parent/child team nesting must not automatically expand policy scope unless explicitly configured and verified. Import remains read-only; never silently mutate GitHub team permissions.

## Policy inheritance and deterministic conflict handling

Effective repository policy = **organization baseline + all approved applicable team assignments + explicit repository assignments**, then branch/stage applicability and authorized exceptions.

- Mandatory organization rules are non-waivable through ordinary team/repository overrides.
- Team rules compose across multiple teams; same stable rule ID/version is deduplicated with provenance.
- For compatible numeric constraints, choose the stronger requirement **only where a rule-defined comparison operator makes strength unambiguous** (e.g., minimum coverage 90% is stricter than 80%).
- For incompatible checks, contradictory rule versions or ambiguous thresholds, emit an **unresolved policy conflict**; do not silently choose a winner or report PASS. Require an authorized policy-manager resolution.
- Repository-specific rules may add requirements or make permitted, explicitly authorized overrides; they cannot silently weaken mandatory inherited controls.
- Pin the effective policy snapshot and source assignments to each assessment and exact PR SHA. Changes to team scope or policy versions must trigger impact review and re-evaluation of affected current PRs.
- Policy configuration does **not** automatically deploy GitHub organization rulesets or alter repository access; separate authorized ruleset deployment and preflight are required.

## UX and navigation

**Administration → Teams** (only once functional) with **Create Team**, **Import from GitHub**, **Sync**, search, filters and paginated list.

List columns: name, source, GitHub organization, members, repositories with policy scope, assigned standards/policies, last sync and status. Show summary cards for teams, policy-covered repositories and pending scope changes. All counts must be real, scoped and freshness-labeled.

**Team detail** tabs:
- **Overview:** ownership/source, policy coverage, readiness and sync status.
- **Members:** imported or local members, source-of-truth labels and authorization.
- **Repositories:** GitHub-accessible vs explicitly policy-scoped repositories, add/remove and pending changes.
- **Standards & Policies:** assign versioned packs/policies, enforcement mode and applicability.
- **Effective Impact:** affected repositories, rule provenance, conflicts, estimated change impact and approved rollout history.
- **Activity/Audit:** imports, assignments, policy upgrades, sync drift and authorized changes.

**Policy assignment UI:** Scope selector **Organization / Team / Repository**; searchable multi-select targets, version/profile selection, preview of affected repositories and effective policy diff, and explicit authorization before enforcement. Repository detail must show inherited policy sources and explain which team contributed each rule.

## Permissions and safeguards

Suggested permissions: `team.read`, `team.create`, `team.manage`, `team.import`, `team.sync`, `team.repository_scope.manage`, `policy.assignment.manage`. Apply organization/repository RBAC and server-side checks. Team managers cannot grant themselves Preflyt access to otherwise unauthorized repositories or waive mandatory controls. Audit membership/source changes, scope changes, conflicts, assignments, approvals and denied access.

Do not allow an imported team's members to view the team's private repositories unless their individual GitHub and Preflyt access permits it. Restrict aggregates to authorized resources.

## Incremental delivery within existing phases

| Phase | Independently usable addition |
| --- | --- |
| **P0 additive** | Create local teams, import selected GitHub teams, show source/membership/repository associations and sync state; preserve completed P0 functionality |
| **P1** | Expose team association and policy-coverage provenance on repository profiles/assessments |
| **P2** | Assign versioned policies and standards to organization, team or individual repository; compile effective policy, preview impact/conflicts and enforce only approved scopes |
| **P3** | Team-level engineering readiness and policy adherence with source-backed metrics |
| **Later** | Optional advanced nested-team policy inheritance, historical comparisons and enterprise directory synchronization |

Do not mark P0–P3 complete based on documentation alone or reorder/renumber existing tasks.

## Acceptance criteria

- [ ] A GitHub team with 12 accessible repositories can be imported without changing GitHub permissions, and an admin can approve a subset as policy-scoped.
- [ ] Assigning a standard to a team applies to every approved scoped repository without 12 separate assignments.
- [ ] A repository associated with two teams composes both sets of requirements deterministically; conflicting requirements are surfaced rather than silently weakened.
- [ ] Repository-level assignments and organization baselines remain effective and traceable.
- [ ] GitHub adds/removes team repository access: sync reports change and requires safe approval before enforced scope expansion.
- [ ] Unauthorized users cannot import teams, assign policies or access private repository evidence through team views.
- [ ] Every PR assessment records the effective policy version and team provenance; stale policy snapshots cannot silently pass.
- [ ] GitHub permission/rate-limit failures show incomplete sync rather than fabricated completeness.
- [ ] Empty/loading/error/stale/permission-denied states and an end-to-end team-policy assignment test are available.
