# Preflyt MVP Product Experience Contract

**Status:** Authoritative **target UX** for P0–P3; not an implementation claim.  
**Audience:** Product, frontend/backend engineers, Codex, Claude and reviewers.  
**Sources:** [PRD](../PRD.md), [delivery phases](../roadmap/incremental-delivery.md), [Contributors](engineering-contributors.md), [Standards](engineering-standards-library.md), [RBAC](rbac-and-authorization.md), [UI guidelines](../design/enterprise-ui-guidelines.md), [Agent guardrails](../agents/product-implementation-guardrails.md).

## Purpose and boundaries

The MVP is an **engineering assurance control center**, not a generic GitHub dashboard. It helps organizations connect repositories, discover engineering posture, collect trusted CI/security/testing/IaC evidence, apply deterministic policies, and prevent inadequately validated PRs from merging via GitHub required checks.

**Preserve the existing imported Shadcn Admin application, session security, Super Admin recovery flow, GitHub App integration and working repository profile UI.** GitHub-first login and organization/member onboarding are the accepted target in [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md); keep current OIDC working until the explicit migration passes. Extend them incrementally. Do not rebuild the application shell or remove already working functionality.

The **MVP** is P0–P3. Contributor analytics is specified as a P3 additive capability. AI provider management and stage routing have a separate proposed change; only expose features actually implemented, and do not invent provider results. Advanced AI investigations, local CLI/IDE, QA orchestration, k6 performance testing and production feedback are later-stage capabilities and **must not be shown as working MVP modules**.

## Navigation contract

### Left sidebar

Preserve this familiar grouped navigation and its direct links. The [Product simplification plan](../planning/product-simplification.md) simplifies content and workflows inside these pages; it does not consolidate or relocate sidebar destinations.

- Brand header: Preflyt icon/name and short `Engineering Assurance` descriptor; organization switcher only where organization membership supports it.
- **Workspace:** Overview, Repositories, Assessments, Findings, **Contributors** (only once P3 functional).
- **Governance:** Merge Protection, Standards, Policies.
- **Intelligence:** AI Intelligence (when a usable evidence-linked AI experience ships) and **Skills** (when the approved review-skill catalogue and management experience is functional). Skills is a sibling navigation item under Intelligence, **not** under Settings or Governance. The Intelligence group may be shown with only functional items; never render a dead-end route.
- **Administration:** Integrations, Teams (once functional), Access Control, Settings; visibility depends on RBAC.
- Footer: current identity/role, profile, sign out; preserve separate Super Admin recovery identity handling.
- Desktop sidebar persists and collapses to icons; mobile uses a keyboard-accessible drawer. Active route is visibly highlighted; navigation order stable.
- Do not show nonfunctional future pages. Hide unshipped routes or mark clearly unavailable without dead-end navigation.

### Top navigation

Compact breadcrumbs/page title, scoped search across authorized repositories/PRs/findings/assessments (only once implemented), notifications for real actionable events (not fabricated), optional time window/repository filters, help and account/theme controls. Search and notifications may be deferred until functional; do not render inert controls. Page actions live in page headers, not an overcrowded global toolbar.

### Context navigation

Repository: Overview / Engineering Profile / Pull Requests / Assessments / Findings / Policies.  
Assessment: Summary / Checks & Evidence / Findings / Policy Decision / AI Explanation (only if available).  
Contributor: Overview / Repositories / Pull Requests / Reviews / Findings & Policy Evidence / Activity.

Tabs must reflect available functionality and preserve deep links.

## Page contract

| Route (proposed) | Page purpose | Minimum content and actions | States / authorization |
| --- | --- | --- | --- |
| `/overview` | Engineering command center | Organization-scoped KPIs, readiness breakdown, assessment activity, blocked/incomplete PRs, critical findings, repository posture and integration health | No-repo onboarding, no-assessment coverage, partial evidence, active org, role-specific views |
| `/repositories` | Connected repositories | Selected/available counts, searchable list, GitHub connection state, default branch, policy profile, last profile/assessment, manage selection | Loading, empty, disconnected, sync error, permission denied |
| `/repositories/:id` | Repository workspace | Pinned commit profile, language/framework, manifests/CI/tests/IaC hints, unknowns, assigned standards, recent PRs, findings and assessments | Profile evidence provenance; no fabricated green |
| `/assessments` | Assessments list | Repository-scoped tabs: Commit assessments (default), Pull requests, Activity. Selected tab is URL-addressable and preserved when changing repository; each panel retains its filters and pagination while switching tabs. Filterable run table: repo, PR, head SHA, stage, checks, status, time, evidence source, links | Running, passed, blocked, incomplete, failed ingestion |
| `/assessments/:id` | Assessment detail | Exact subject SHA, policy version, required vs observed checks, tool/evidence provenance, findings, deterministic gate decision, optional AI explanation | New SHA invalidates current status; incomplete != pass |
| `/findings` | Findings worklist | Severity, category, repository, affected PR/revision, file/path where supported, evidence, status, filters and drill-down | RBAC and evidence redaction; no unsupported root-cause claims |
| `/quality-gates` | Merge-readiness governance | Recent PR gate decisions, enforcement mode, required-check completeness, GitHub check publishing status and reasons | Observe/Advisory/Enforce; GitHub ruleset required to actually block merge |
| `/engineering-standards` | First-party pack catalogue | Versioned Baseline, Security, Backend, Frontend and IaC packs; applicability, supported/planned checks, Default/Recommended/Strict profiles | P0 browse/selection; P1 evidence map; P2 evaluation; P3 execution |
| `/policies` | Effective organizational policy | Pack assignment, repository/branch scope, versions, thresholds, policy preview, approvals, changelog, enforcement | Only authorized managers publish/activate; no silent upgrade |
| `/contributors` | Contributor overview | Authorized contributor list, search, filters, activity KPIs, assessment coverage, policy adherence, charts and freshness | P3; bots/private members/unlinked identities and incomplete evidence labeled |
| `/contributors/:id` | Contributor detail | Repositories, commits, authored/merged PRs, reviews, assessments, findings and evidence-backed trends | Scoped source links; no opaque employee ranking |
| `/integrations` | Integration health | GitHub App installation, permissions, selected repositories, webhook/CI evidence status and troubleshooting | Secret-safe, reconnect/disconnect RBAC |
| `/teams` | Team management | Create/import/sync teams; list members, repositories, standards and policies | Only when functional; RBAC enforced |
| `/teams/:id` | Team detail | GitHub access versus approved policy scope, assignments, impact preview and audit | Authorized scope; stale sync visible |
| `/access-control` | Member access management | Searchable connected-GitHub member directory, username selection, Preflyt roles, repo grants, audit and revocation | Implemented behind GitHub login flag; existing workspaces use explicit Owner-verified organization linking; backend enforces |
| `/settings` | Workspace settings | Organization details, identity/session settings, supported AI provider/model routing controls when shipped, operational preferences | Do not show secrets; unavailable features hidden |
| `/intelligence/skills` | Review skill catalogue and management | Approved and pinned skills, provenance, enablement, stage/model routing, budgets, security review and audit | Only when functional; organization permissions required |
| `/intelligence` | Evidence-linked AI findings analysis | Supported explanation and cited evidence, selected permitted model/route, usage and availability | Only if implemented; advisory, never gate authority |

Routes are a design contract; existing implemented paths may differ. Prefer backwards-compatible routing/redirects and review actual router before changes.

## Overview composition: desktop order

1. **Heading:** `Engineering Overview`, one-line purpose, authorized repository/time filters and contextual action.
2. **Five KPI cards:** Connected Repositories, PRs Assessed (time-scoped), Currently Blocked PRs, Open Findings, **Policy Coverage** (defined denominator). No generic ungrounded “compliance score.”
3. **Readiness + Activity:** Breakdown PASS/WARN/BLOCK/INCOMPLETE/NOT_APPLICABLE (do not hide incomplete) and assessment activity trend with real data.
4. **PRs Requiring Attention:** sorted blocked/incomplete first; repo, PR, risk, current gate, last updated and click-through.
5. **Recent Findings:** severity, domain, repository, revision, observed time, evidence link and status.
6. **Repository Posture:** selected repositories, stack, policy profile, last assessed, readiness and missing controls.
7. **Platform Status:** GitHub integration, webhook/worker/API/database/cache and configured AI health **from actual health evidence**; no fabricated “all healthy.”

**Implemented overview navigation:** The summary cards and repository/time filters remain shared above Overview, Repositories and Pull requests tabs. Overview contains the assessment calendar and evidence summary; Repositories contains paginated recorded status; Pull requests contains the bounded attention summary and its assessment links. The selected tab is stored in the URL and survives reload/filter changes. Definitions and data-source notes use the page Help drawer. The broader composition above remains the target as verified gates and findings become available.

No large marketing hero, decorative globe or fake percentage. Charts should have axis labels, source/time range, empty states and accessible table alternatives.

### Dashboard metric definitions

- **PRs Assessed:** distinct eligible PR head revisions assessed in selected period; label if counting PRs instead of revisions.
- **Blocked PRs:** distinct currently open PRs whose latest applicable enforced gate is BLOCK; separate incomplete and advisory warnings.
- **Open Findings:** unique unresolved normalized findings in authorized scope, with deduplication policy.
- **Policy Coverage:** applicable required control instances with fresh trusted evidence / all applicable required control instances, reporting denominator and unknown/incomplete count.
- **Readiness:** counts of latest assessment decisions by PR/repository context; avoid combining incomparable objects in one percentage.
- **Contributor adherence:** first-pass and final adherence only over fully assessed eligible PRs, always shown beside assessment coverage and policy version.

**Merge Protection → Branch rules:** show existing organization rulesets, enforcement state, targeted branches/repos, linked Preflyt check/policy, sync/drift and a guided Standard/Strict/Custom setup. The wizard must preflight a real PR check, preview GitHub changes and require authorized deployment approval. Do not expose activation if the check publisher is not ready. See [GitHub Ruleset Management](github-ruleset-management.md).

**GitHub Ruleset Details → Insights (P2.R5):** display GitHub rule-suite evaluation metrics and charts for the selected ruleset, most frequently failing rules, affected repositories, filtered evaluation history, and drill-down. Keep Preflyt quality-gate analytics in a separately labeled panel. Show source, time window, attribution completeness, permission and sync status. See [Ruleset Insights](github-ruleset-management.md#ruleset-detail-insights-tab-p2r5).

## GitHub login and Access Control target

The sign-in page uses **Continue with GitHub**. A connected workspace inherits the GitHub organization's identity and name; no separate “Create organization” step is shown. The switcher lists only connected organizations the user may access. Local Super Admin recovery remains on its separate route; OIDC may remain as an explicitly enabled compatibility option.

Access Control shows a searchable, paginated GitHub member directory: avatar, username, Preflyt access state, role and assigned repositories. Admins can select a member or enter a GitHub username, review the resolved account, assign a role/repositories, and choose **Grant access**. Explain that this grants Preflyt access, not GitHub membership; no notification is claimed sent. Users with a grant sign in with GitHub. Users without a grant see a clear “Ask your administrator for access” state.

Show sync time, partial directory results, verification errors and retry actions. Do not treat a missing public membership as proof of non-membership. Role/grant editing must respect live organization permissions and the user's GitHub repository access. GitHub removal must disable corresponding Preflyt access, including cached data. Current requests verify bounded provider-access evidence; signed revocation/relationship invalidation and bounded periodic reconciliation are implemented. GitHub login, verified first-owner onboarding, explicit workspace linking and member grants are implemented behind the login flag. Stable provider IDs identify accounts; explicit legacy identity linking, owner recovery and full migration acceptance remain pending. An authorized existing OIDC/recovery Owner or Admin can sync a linked organization through read-only App access without replacing their session; GitHub user sessions retain their own access checks.

**Notifications:** a working unread bell, assessment inbox, preferences and opt-in SMTP email are implemented behind `NOTIFICATIONS_ENABLED=true`. Implemented events include assessment activity, policy publication, confirmed automatic blocked/incomplete readiness and managed ruleset activation/rollback/drift. Exact-commit unsuppressed critical-report alerts are implemented. Exception alerts remain pending until the waiver workflow is implemented. Empty, delivery-failure and stale states are explicit; do not show dummy alerts. See [Notification Engine](notification-engine.md).

**Assessment → Code Quality:** show verified lint/typecheck/coverage/static-analysis results, changed-file findings, evidence freshness, severity, policy outcomes and source links. Clearly separate verified findings from AI hypotheses. Display reviewed skill provenance and output only when available; advanced multi-skill review/inline comments belong to P4. See [Code Quality Review](code-quality-review.md) and [Skill-Based Review](skill-based-code-review.md).

**Administration → Teams:** when implemented, provide local team creation and GitHub team import/sync, member and repository-association views, assigned standards/policies and a team detail page. Show GitHub-accessible repositories separately from approved team policy scope. Policy assignment supports Organization / Team / Repository with effective-impact preview and conflict explanations. See [Teams and Policy Inheritance](teams-and-policy-inheritance.md).

## End-to-end MVP journeys

**New organization (GitHub-first target):** Continue with GitHub → connect/verify the organization App installation → verify GitHub organization ownership and create the matching workspace automatically → select repository → discover profile → recommend and select policy packs → show missing controls and next steps. The Overview should be an onboarding state until real assessments exist.

**Implemented first-report path:** When organization sign-in is unconfigured, the sign-in page exposes setup through the configured Super Admin account. Overview directs users without an organization to GitHub sign-in or deployment configuration, according to permission and configured providers. Once a repository is explicitly selected, Overview offers **Create first report**: reuse the saved inspection or inspect configuration, preserve existing standards or save recommended observe-mode standards, then save a commit-bound assessment and open its results. Custom setup remains available. Each existing API enforces authorization; concurrent standards changes stop the flow. Failed steps retain saved progress, and retries in the current view reuse the assessment request key for identical inputs. Setup does not publish policies, activate rulesets, execute repository code or change AI source-sharing permissions. Missing evidence remains incomplete. The setup card uses all-time saved report state, so date filters do not restart onboarding. Configuration tabs support direct links.

Automatic setup on selection, GitHub App Manifest provisioning, connection hot reload, and an installation CLI are separate friction-audit proposals; this first-report flow does not implement them.


**Developer PR:** signed webhook → pin SHA → import trusted CI evidence or approved isolated scan → normalize checks/findings → deterministic policy decision → publish exact-SHA GitHub check → show readiness and required corrective action. A missing required check is INCOMPLETE, not PASS.

**Policy Manager:** Policies → choose repository, team or organization scope → choose saved standard versions → review changes → save requirements and branch-policy drafts. Team and organization assignment uses the existing server impact preview and requires the unchanged preview hash. A repository selection preview describes requirements; it does not run checks, and the server validates current selection and inherited requirements on save. Reviewers approve and publish branch policies separately. After reliable required checks are available, use **Review merge protection** to enter the existing GitHub ruleset review and activation flow. Preparing organization scope includes only currently selected authorized repositories; future repositories require another scope review. AI cannot enable enforcement.

**Contributor investigation:** Contributors list → filter repo/time → open contributor → inspect PR/review activity and exact policy evidence; distinguish external users and bots.

## MVP UI acceptance

- [ ] Navigation routes match functional modules and RBAC; no misleading future pages or fake activity.
- [ ] Empty/no-data, loading, error, partial-evidence and permission-denied states exist on each shipped page.
- [ ] All counts/charts reconcile with filtered API source data; metrics document scope/denominators.
- [ ] A blocked PR can be traced from Overview → Assessment → Finding → evidence → applicable policy.
- [ ] Repository profile shows pinned revision and evidence/unknown states.
- [ ] Policy changes are versioned and authorized; missing required checks never display as passed.
- [ ] Contributors list and individual drill-down work when P3 module is released.
- [ ] Desktop/tablet/mobile navigation, keyboard focus, contrast and reduced-motion behaviour are tested.
- [ ] Existing P0 features remain functional; no P0–P11 reordering.

Access Control separates **People**, **GitHub members**, **Roles & permissions**, and **Activity**. People manages existing Preflyt access. GitHub members lists active organization users with search, pagination, **Sync members**, and **Assign role**. Role assignment opens a side panel with predefined permissions and repository scope. Sync alone never grants access.

For GitHub-linked workspaces, **Grant access** uses a searchable member dropdown showing only users without active Preflyt access, including revoked members. Select the user, then choose a built-in role and repositories. Existing members are edited through their access record.

If the App is already connected, the GitHub members tab offers **Link GitHub organization** to an existing workspace Owner when GitHub sign-in is enabled. This verifies GitHub organization ownership and reuses the current workspace and installation.


### Skills delivery note (2026-10-09)

The functional **Intelligence → Skills** page now provides an organization-scoped, paginated review catalogue, first-party templates, immutable draft versions, reviewed approval and separate activation. The same catalogue is accessible in AI Intelligence. Saved assessment details contain **Code Quality · AI Review** with explicit evidence-only requests, cancellation and inferred suggestions. Language/path-driven source review, changed-line findings and GitHub feedback remain future requirements. See [current behavior and setup](../operations/review-skills.md).
