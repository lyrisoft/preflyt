# Preflyt MVP Product Experience Contract

**Status:** Authoritative **target UX** for P0–P3; not an implementation claim.  
**Audience:** Product, frontend/backend engineers, Codex, Claude and reviewers.  
**Sources:** [PRD](../PRD.md), [delivery phases](../roadmap/incremental-delivery.md), [Contributors](engineering-contributors.md), [Engineering Standards](engineering-standards-library.md), [RBAC](rbac-and-authorization.md), [UI guidelines](../design/enterprise-ui-guidelines.md), [Agent guardrails](../agents/product-implementation-guardrails.md).

## Purpose and boundaries

The MVP is an **engineering assurance control center**, not a generic GitHub dashboard. It helps organizations connect repositories, discover engineering posture, collect trusted CI/security/testing/IaC evidence, apply deterministic policies, and prevent inadequately validated PRs from merging via GitHub required checks.

**Preserve the existing imported Shadcn Admin application, OIDC session, Super Admin recovery flow, GitHub App integration and working repository profile UI.** Extend them incrementally. Do not rebuild the application shell or remove already working functionality.

The **MVP** is P0–P3. Contributor analytics is specified as a P3 additive capability. AI provider management and stage routing have a separate proposed change; only expose features actually implemented, and do not invent provider results. Advanced AI investigations, local CLI/IDE, QA orchestration, k6 performance testing and production feedback are later-stage capabilities and **must not be shown as working MVP modules**.

## Navigation contract

### Left sidebar

- Brand header: Preflyt icon/name and short `Engineering Assurance` descriptor; organization switcher only where organization membership supports it.
- **Workspace:** Overview, Repositories, Assessments, Findings, **Contributors** (only once P3 functional).
- **Governance:** Quality Gates, Engineering Standards, Policies.
- **Intelligence:** AI Intelligence only when a usable evidence-linked AI experience ships.
- **Administration:** Integrations, Access Control, Settings; visibility depends on RBAC.
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
| `/assessments` | Assessments list | Filterable run table: repo, PR, head SHA, stage, checks, status, time, evidence source, links | Running, passed, blocked, incomplete, failed ingestion |
| `/assessments/:id` | Assessment detail | Exact subject SHA, policy version, required vs observed checks, tool/evidence provenance, findings, deterministic gate decision, optional AI explanation | New SHA invalidates current status; incomplete != pass |
| `/findings` | Findings worklist | Severity, category, repository, affected PR/revision, file/path where supported, evidence, status, filters and drill-down | RBAC and evidence redaction; no unsupported root-cause claims |
| `/quality-gates` | Merge-readiness governance | Recent PR gate decisions, enforcement mode, required-check completeness, GitHub check publishing status and reasons | Observe/Advisory/Enforce; GitHub ruleset required to actually block merge |
| `/engineering-standards` | First-party pack catalogue | Versioned Baseline, Security, Backend, Frontend and IaC packs; applicability, supported/planned checks, Default/Recommended/Strict profiles | P0 browse/selection; P1 evidence map; P2 evaluation; P3 execution |
| `/policies` | Effective organizational policy | Pack assignment, repository/branch scope, versions, thresholds, policy preview, approvals, changelog, enforcement | Only authorized managers publish/activate; no silent upgrade |
| `/contributors` | Contributor overview | Authorized contributor list, search, filters, activity KPIs, assessment coverage, policy adherence, charts and freshness | P3; bots/private members/unlinked identities and incomplete evidence labeled |
| `/contributors/:id` | Contributor detail | Repositories, commits, authored/merged PRs, reviews, assessments, findings and evidence-backed trends | Scoped source links; no opaque employee ranking |
| `/integrations` | Integration health | GitHub App installation, permissions, selected repositories, webhook/CI evidence status and troubleshooting | Secret-safe, reconnect/disconnect RBAC |
| `/access-control` | RBAC management | Organization membership, predefined roles, repo grants, audit and revocation | Only permitted actions; backend enforces |
| `/settings` | Workspace settings | Organization details, identity/session settings, supported AI provider/model routing controls when shipped, operational preferences | Do not show secrets; unavailable features hidden |
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

No large marketing hero, decorative globe or fake percentage. Charts should have axis labels, source/time range, empty states and accessible table alternatives.

### Dashboard metric definitions

- **PRs Assessed:** distinct eligible PR head revisions assessed in selected period; label if counting PRs instead of revisions.
- **Blocked PRs:** distinct currently open PRs whose latest applicable enforced gate is BLOCK; separate incomplete and advisory warnings.
- **Open Findings:** unique unresolved normalized findings in authorized scope, with deduplication policy.
- **Policy Coverage:** applicable required control instances with fresh trusted evidence / all applicable required control instances, reporting denominator and unknown/incomplete count.
- **Readiness:** counts of latest assessment decisions by PR/repository context; avoid combining incomparable objects in one percentage.
- **Contributor adherence:** first-pass and final adherence only over fully assessed eligible PRs, always shown beside assessment coverage and policy version.

## End-to-end MVP journeys

**New organization:** OIDC/owner bootstrap → connect GitHub App → select repository → discover profile → recommend and select policy packs → show missing controls and next steps. The Overview should be an onboarding state until real assessments exist.

**Developer PR:** signed webhook → pin SHA → import trusted CI evidence or approved isolated scan → normalize checks/findings → deterministic policy decision → publish exact-SHA GitHub check → show readiness and required corrective action. A missing required check is INCOMPLETE, not PASS.

**Policy Manager:** inspect built-in pack → assign version/profile → preview effective policy → authorize advisory/enforced mode → audit change. AI cannot enable enforcement.

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
