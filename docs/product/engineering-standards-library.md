# Preflyt Engineering Standards Library

**Status:** Built-in catalogue, repository selection, CI evidence mapping, versioned organization authoring and policy/check governance are implemented in source. Native execution, broader inheritance and live enforcement acceptance remain pending.
**Applies to:** Repository onboarding, assessments, CI/PR quality gates, and later SDLC stages
**Related:** [PRD](../PRD.md) · [Incremental delivery plan](../roadmap/incremental-delivery.md) · [ADR-0004](../architecture/ADR-0004-shift-left-assessment-governance.md)

## Purpose

Preflyt must ship with **first-party, versioned engineering policy packs** that organizations can adopt without writing custom rules. Packs contain declarative requirements, applicability, expected check evidence, and recommended enforcement defaults—not simply documentation or AI prompts.

An organization can inspect, enable, combine, configure and later update built-in packs, or create organization-managed policies. AI may recommend packs and explain results, but **only authorized users choose or change enforcement** and the deterministic policy engine issues gate decisions.

## Initial policy pack catalogue

The first five packs are implemented. API, database, production-readiness, performance and compliance packs below are target scope; listing them does not mean they are installed or executable.

| Pack ID | Template | Representative controls | Initial introduction |
| --- | --- | --- | --- |
| `baseline-engineering` | Baseline Engineering | Secret checks, required tests, type/lint checks, dependency hygiene, minimum CI coverage | P0 catalogue → P2 enforcement |
| `application-security` | Application Security | SAST, SCA/CVEs, secrets, image vulnerabilities, evidence freshness | P0 → P2/P3 |
| `backend-service` | Backend Services | Required builds and tests, API error/contract checks, timeout/retry guidance | P0 → P2, deeper V1 |
| `frontend-application` | Frontend Applications | Typecheck/lint/build, component tests, dependency security | P0 → P2/P3 |
| `infrastructure-as-code` | Infrastructure as Code | Terraform/OpenTofu policy, Kubernetes/Docker security, unsafe exposures | P0 → P2/P3 |
| `api-engineering` | API Engineering | OpenAPI validity, consumer/provider compatibility, breaking changes | P0 catalogue, enforce when adapters available |
| `database-engineering` | Database Engineering | Destructive migrations, compatibility, controlled schema-change evidence | P0 catalogue → P7 |
| `production-readiness` | Production Readiness | Readiness/health, graceful shutdown, timeouts, telemetry assertions | P0 catalogue → V1 |
| `performance-engineering` | Performance Engineering | Approved k6 thresholds, baseline comparability, latency/error budgets | P0 catalogue → P8–P10 |
| `compliance-baseline` | Compliance Evidence Baseline | Organization-defined control evidence and audit requirements | P0 catalogue → later |

Catalogue presence **does not imply executable support**. Each rule declares `available`, `import_only`, `executable`, or `planned` capability and must never appear compliant when the required adapter/evidence is missing.

## Template contract

Every pack has an immutable version, owner, description, lifecycle stages, supported languages/repository types, rules, source data requirements, changelog and tested schema version.

Each rule contains:
- **Stable ID**, title, risk description, evidence/check identifier and rule version.
- **Applicability** conditions: repo profile, stage, branch/environment, changed paths and required capabilities.
- **Required vs advisory**, severity, evaluation operator and deterministic pass/fail/unknown semantics.
- **Allowed evidence source** (imported CI, sandboxed native scan, approved manual attestation), provenance and freshness limits.
- **Recommended default enforcement**: Observe, Advisory, Enforce; actual organization choice and branch protection remain independent.
- **Configurable thresholds** and documented safe defaults, compatibility constraints, exception eligibility.
- **Remediation guidance** and links to engineering rationale.
- **Capability status** so unavailable built-in checks never silently become PASS.

Example proposed pack (illustrative, not implemented):

~~~yaml
schema_version: 1
id: baseline-engineering
version: 1.0.0
recommended_profile: recommended
stages: [repository, pull_request, ci]
rules:
  - id: secrets.no-detected-credentials
    severity: critical
    required: true
    applies_to:
      languages: ["*"]
    evidence:
      check: secret_scan
      accepted_sources: [imported_ci, approved_sandbox]
      max_age_hours: 24
    on_missing: incomplete
    on_failure: block
    default_enforcement: advisory
    capability: import_only
~~~

## Code Quality policy pack

Add a versioned `code-quality` pack with lint, typecheck, build, complexity, duplication and changed-code coverage requirements **only where supported by trusted evidence**. P1 maps CI results; P2 enables deterministic enforcement; P3 expands native adapters. AI review skills may recommend improvements but are advisory and cannot independently determine PASS/BLOCK. Missing required coverage or unavailable analyzers must produce INCOMPLETE rather than invented compliance. See [Code Quality Review](code-quality-review.md) and [Skill-Based Review](skill-based-code-review.md).

## Built-in adoption profiles

| Profile | Intent | Behaviour |
| --- | --- | --- |
| **Default** | Minimal friction | Core known-safe checks, observe/advisory first |
| **Recommended** | Balanced engineering assurance | Broader required evidence, advisory rollout then owner-enabled gates |
| **Strict** | High-assurance protected branches | Stronger mandatory checks and potentially blocking enforcement **only after administrator activation** |

A built-in profile recommends configuration; it must not silently enable blocking GitHub branch protections or substitute for repository policy ownership. Defaults should be safe, explainable and adjustable.

## Recommendation and application flow

1. P0 repository discovery identifies languages, framework, manifests, CI, IaC and available evidence.
2. Preflyt recommends relevant packs based on deterministic applicability, explains the reason and marks unsupported/planned checks.
3. Administrator reviews selected pack versions, chooses Default/Recommended/Strict and approves organization/repo/stage/branch scope.
4. P1 maps imported CI evidence to template check identifiers and identifies missing controls.
5. P2 activates a versioned deterministic evaluation with observe/advisory/enforce modes, reporting PASS/WARN/BLOCK/INCOMPLETE/NOT_APPLICABLE.
6. P3 native approved sandboxes execute eligible checks; later phases implement QA, database, reliability, performance and production controls.
7. A template update creates a new **candidate version** and diff; administrators explicitly approve upgrade/overrides and enforcement changes.

## Composition and governance rules

- **Inheritance:** first-party pack → organization-assigned version → optional repository overrides → stage/branch applicability. Show an effective-policy preview and each rule's provenance.
- **Conflicts:** duplicate rule IDs and incompatible thresholds must resolve deterministically with explicit explanation. Never silently weaken a mandatory organization control through repo override.
- **Immutable evaluated versions:** existing assessments retain the exact template/policy version and evidence digests used.
- **Updates:** upstream/built-in pack upgrades are not auto-applied to enforced policies. Present changelog, added/removed rules, changed severity and projected impact before authorized upgrade.
- **Exceptions:** authorized owner, justification, scope, expiration and audit trail; non-waivable execution security boundary remains in force.
- **Missing evidence:** skipped, unsupported, expired, invalid or missing required checks yield **INCOMPLETE**, not PASS.
- **AI:** recommends pack selection, explains findings, may propose a draft policy change; cannot select/activate enforce mode, grant exceptions, or modify a quality gate.
- **Licensing:** license/rulepack distribution rights must be reviewed for included third-party rules; built-in metadata does not imply redistribution permission for all external scanner rule sets.

## Team-scoped policy inheritance

**Target, not implemented:** organization standard authoring is available, but organization/team inheritance and team assignments remain pending.

Organizations can assign versioned standards at organization, **team** or individual repository scope. A GitHub-imported team's accessible repositories are **not** automatically its policy scope: an administrator explicitly approves repository associations. Effective policies compose mandatory organization baseline, all applicable approved team assignments and repository rules, with branch/stage applicability, source provenance, deterministic deduplication and explicit conflict resolution. Repository overrides cannot silently weaken inherited mandatory requirements. Preview affected repositories and require approval for enforced scope expansion. See [Teams and Policy Inheritance](teams-and-policy-inheritance.md).

## Phased deliverables

**P0 — catalogue and recommendations:** deliver actual browsable pack details, supported-vs-planned tags, deterministic stack-based recommendations and authorized organization/repository selection stored by version. This adds usable value to repository posture **even before policy enforcement**.

**P1 — evidence mapping:** map imported CI checks to selected pack rule IDs, show satisfied/missing/unsupported/expired evidence per rule and assess observed coverage.

**P2 — template-driven quality gates:** implement deterministic policy compilation/evaluation, effective policy previews, profiles, authorized overrides, versioning and first GitHub advisory/enforced results. Ensure change of commit or policy never reuses stale green.

**P3 — native check support:** add eligible security/testing/IaC adapters running in approved execution environments. Use capability reporting, not fictitious green checks.

**P7–P10 — specialized packs:** expand contract testing, database/reliability, k6 budgets and advanced performance gate evidence.

**P11+ — feedback and recommendations:** incident-derived suggestions for policy revisions requiring human approval; add organization libraries and trend analytics.

## P0 acceptance

- [ ] At least five first-party packs (Baseline, Application Security, Backend, Frontend, Infrastructure) are browseable with IDs, versions, description, supported stages and example rules.
- [ ] A detected Node.js backend receives correct recommended packs with reasons and an unknown/unsupported status for unavailable checks.
- [ ] Admin may choose profile and assign pack versions to one GitHub repository and inspect the resulting policy selection.
- [ ] Repository's posture page displays **missing required engineering controls** with evidence and no unearned passing status.
- [ ] Unknown or unsupported policies remain visible as planned/import-only, never silently PASS.
- [ ] Changes to pack selections/overrides are authenticated, authorized and audited.
- [ ] P0 Compose deployment provides the working template catalogue and selection without needing a model, scanner sandbox or P1/P2.

## P2 acceptance

- [ ] The same frozen rule version and evidence set produce the same gate result.
- [ ] A missing required test yields INCOMPLETE; an actual failed required test yields BLOCK once enforced.
- [ ] Default/Recommended/Strict profiles apply transparent differences but never bypass branch protection.
- [ ] Owners can preview affected repositories before adopting a new built-in pack version.
- [ ] AI cannot enable enforcement, waive critical checks or forge evidence.

**P0 implementation:** five frozen packs, stack recommendations, authorized append-only repository selection and configuration-gap preview are available. See the [operations guide](../operations/engineering-standards.md) for supported capabilities, tests, deployment and limits. CI evidence mapping, deterministic policy evaluation, publication and flag-gated single-repository ruleset activation are implemented; see [publication limits](../operations/github-check-publication.md). Organization standards authoring is described below. Full organization/team inheritance, advanced overrides, native execution and specialized adapters remain pending. Source implementation does not imply phase-level live release acceptance.


### Editing draft branch policies

Users with repository-scoped `policy.draft` permission can edit a DRAFT policy from its review panel, including after the saved standards change. Editing uses the latest saved standards and allows optional rules to be made required. The target branch and policy version stay the same; use a new policy for another branch. Approved, published, and replaced revisions are locked.

Saving checks both the expected draft hash and the current standards selection in a serializable transaction. Concurrent edits or standards changes require a reload. The editor becomes the draft author, so independent approval applies to the edited definition (with the existing audited local Super Admin exception). The audit history retains the previous definition, hash, standards selection and author. Editing does not activate GitHub enforcement.


### Branch-specific repository discovery

Repository details offers a searchable **Inspect branch** dropdown populated from GitHub. Branches load when opened, in pages of 100 with a Load more action; search filters the loaded choices. Pages are cached for five minutes in Redis and the browser query cache. Cached server responses still recheck GitHub repository access and active local repository selection. It defaults to the last inspected branch, or the GitHub default branch for a new profile. Select a branch, then refresh/discover the profile. The reader verifies `refs/heads/<branch>` and pins inspection to its exact commit and tree. It does not change the GitHub default branch or inspect tags. Repository details and the Overview repository table display the saved profile's inspected branch. Each discovery stores a new historical profile; failures preserve the prior one. Existing callers that omit the branch continue to inspect the GitHub default branch. Language/framework detection remains based on supported file extensions and Node.js dependency manifests, with the existing bounded inspection limits.

### Organization standards: create, edit and adopt

**Engineering Standards** now separates **Organization standards** from **Built-in standards**. Owner/Admin users with `standards.manage` can create a named standard, choose existing check definitions, customize a built-in copy or edit an organization standard. The editor starts with baseline checks selected. Cards show support counts and open a check-details drawer; the library and version history paginate. Read-only users can inspect the same library without mutation controls.

Each save creates an append-only version with a stable standard ID, definition digest, author and audit event. Editing requires the expected latest version ID and conflicts on concurrent edits. Built-ins remain immutable. Existing repository selections embed a verified complete organization definition; later library changes cannot alter existing policy/assessment evaluation. To adopt an update, use **Policies → Standards → Edit selection**, choose the desired version, save, and review/update the policy separately. Saving a standard never activates GitHub protections.

This authoring slice composes the existing supported check contracts. It supports editing the standard's name, description and included checks; it does not introduce arbitrary executable rules, scanner commands, capability claims, thresholds or automatic enforcement. Adding a new check type still requires a tested evidence adapter. Unavailable or missing required checks remain incomplete. Existing Default/Recommended/Strict requirements apply to each selected check.

The server scopes all library versions to the active organization, validates check IDs, limits stored versions, rechecks mutation authority in a serializable transaction and records changes atomically with audit. Cross-tenant adoption, stale edits and altered definitions are rejected. Deploy migration `20261010003000_organization_standards` and regenerate Prisma. No worker or GitHub workflow changes are required.


### Advisory AI reviews (2026-10-09)

Owners/Admins can add named AI reviews to organization standard versions using approved enabled skills. The server pins skill ID, integer version and content digest; review stages select repository/PR applicability. Definitions are frozen by explicit repository adoption and policy review. AI reviews remain advisory and outside required deterministic gate rules. The current runtime reviews saved check evidence only. The standard editor is a wide responsive dialog with details on the left and separate filtered/paginated Deterministic checks and AI Reviews tabs on the right. No new analyzer, shell command or AI waiver can be authored through this form. See [review skills](../operations/review-skills.md).

## Organization check editing

In the standard editor, use Add check to create a named test-report (JUnit) or scan-report (SARIF) check. Edit check changes its name and remediation guidance. New checks use the existing verified CI evidence path; creating a check does not run commands, grant source trust or mark missing evidence as passed. Connect its pipeline result in Policies → CI jobs and use an approved execution contract for its exact check ID. Saving a standard creates a version; existing policies and assessments retain their frozen definitions. Built-in evaluator requirements cannot be rewritten through this editor.
