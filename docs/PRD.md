# Preflyt — Product Requirements Document

**Product:** Preflyt  
**Positioning:** AI-native Shift Left engineering platform  
**Tagline:** Engineering confidence before production  
**Owner:** Lyrisoft Technologies  
**Status:** Product roadmap for engineering and product review; implemented capabilities and remaining scope are tracked in README and the incremental delivery plan
**Version:** 0.5 — GitHub-first identity and inherited organization onboarding
**Date:** 2026-10-09
**Source of architectural decisions:** [ADR-0001](architecture/ADR-0001-typescript-first-stack.md) · [ADR-0002](architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md) · [ADR-0003](architecture/ADR-0003-oidc-user-authentication.md) · [ADR-0004](architecture/ADR-0004-shift-left-assessment-governance.md) · [ADR-0007](architecture/ADR-0007-github-first-identity-and-organizations.md)

---

## 1. Executive summary

**Preflyt is a self-hosted, AI-native Shift Left engineering platform that helps organizations find and prevent security vulnerabilities, software defects, infrastructure misconfigurations, reliability failures, and other engineering risks earlier in the software development lifecycle (SDLC).**

Preflyt does not replace Git hosting, CI/CD or software scanners. It combines engineering standards, deterministic technical checks, imported CI evidence, AI-assisted engineering assessment and source-control feedback into a **continuous engineering assessment and quality-gate system**.

Preflyt has three core engines:

1. **Engineering Validation Engine:** discover what needs checking, run/ingest eligible scanners and tests, normalize results and retain trustworthy evidence.
2. **Engineering Governance Engine:** apply versioned policies, calculate evidence-backed readiness and enforce explicit PASS/WARN/BLOCK/INCOMPLETE outcomes across repositories and lifecycle stages.
3. **Engineering Intelligence Engine:** use optional AI agents to explain findings, investigate risks and propose next steps without owning policy decisions or editing source code.

The **primary entity is an Assessment**: evaluation of a design artifact, change, commit, pull request, or release candidate against a specific set of rules at a pinned revision. The **primary deliverable is an Engineering Readiness Report**, not a remediation PR.

**Automated code editing and remediation PRs are not the core product and are not required for MVP or V1.** A separately authorized future remediation module may use the previously designed evidence/reproduction contract in ADR-0002.

The planned application stack is **Node.js + TypeScript, React + Vite, NestJS, PostgreSQL/Prisma, Redis/BullMQ**, and optionally LiteLLM for frontier or self-hosted models. Docker Compose packages the current release; Kubernetes with an approved hardened sandbox is the production execution target.

## 2. Problem and opportunity

Engineering organizations shift important validation too far right. Security findings, broken API contracts, migration mistakes, expensive infrastructure, missing telemetry and unsafe deployment behaviour can be discovered during QA, staging, audits, or production incidents.

Existing engineering tools are numerous but fragmented. Developers may see several CI checks without understanding which are required, whether evidence is current, whether failures matter to their change, or whether an engineering standard has been met.

### Problems to solve

| Problem | Consequence | Shift Left response |
| --- | --- | --- |
| Inconsistent security, test and infrastructure checks | Defects escape code review | Repository-aware assessment profiles and required checks |
| Disconnected tools and reports | Slow interpretation, missing context | Unified evidence, provenance and normalized findings |
| Policies exist only in documents | Standards not consistently applied | Versioned machine-evaluable policy and quality gates |
| Failure evidence arrives too late | More expensive fixes | PR/CI feedback with future local/design-stage extensions |
| AI suggestions are not evidence | Incorrect prioritization or false confidence | AI interpretation distinctly labeled as advisory |
| Missing/expired test results appear green | Unsafe merges | Explicit INCOMPLETE states and revision-bound freshness |
| Security, reliability and cost reviewed in silos | Incomplete readiness decisions | Unified, domain-based engineering assessment |
| No systematic learning from escaped defects | Repeat regressions | Trend/evidence analysis and evolving engineering standards |

### Value proposition

**Prevent engineering issues before production through continuous evidence-based assessments and enforceable, explainable quality gates.**

Do not claim that Preflyt guarantees vulnerability-free software, regulatory certification, lower cloud bills, or zero downtime.

## 3. Target users and jobs

| Persona | Primary job |
| --- | --- |
| Software developer | Receive early, actionable feedback tied to the exact code change, with evidence and recommended improvements |
| Tech lead / reviewer | See whether a change satisfies required standards and why a gate passed/failed |
| Platform / DevOps engineer | Configure and reuse engineering assessments across teams and repositories |
| SRE | Define checks for graceful shutdown, health, reliability, timeouts, retries, deployment readiness and observability |
| AppSec engineer | Govern SAST, dependencies, secrets, containers and IaC compliance, including justified exceptions |
| Database engineer | Catch dangerous schema changes and compatibility risks before deployment |
| Engineering manager | Understand coverage, recurring classes of risk, enforcement adoption and escaped defects |
| Organization administrator | Govern identity, integrations, source-code/model egress, executor profiles, budgets and approval rights |

### User stories

- As a developer, I want changes assessed during PR/CI so I can correct defects before merge.
- As a tech lead, I want a single report showing which required checks passed, failed or lack evidence.
- As a platform engineer, I want baseline policies inherited across repositories with controlled overrides.
- As an SRE, I want executable production-readiness checks and clear warnings where only heuristic analysis is possible.
- As AppSec, I want confirmed security evidence and no AI ability to waive mandatory rules.
- As an administrator, I want a read-only source integration for ordinary assessments, with model traffic and job execution restricted by policy.
- As an engineering manager, I want trends based on observed checks rather than opaque health scores.

## 4. Product principles and non-goals

### Principles

1. **Shift left across the SDLC, not just CI failure response.**
2. **Assessment first:** every run has a subject, revision, policy, plan and traceable evidence.
3. **Deterministic governance:** quality gates rely on check results and rules, never LLM confidence alone.
4. **No evidence is not success:** missing, skipped, timed-out or stale mandatory checks cannot yield PASS.
5. **AI is optional:** deterministic assessments work without an AI model or external inference API.
6. **Safe execution from day one:** tests, scanners, build scripts and parsers processing repository code are untrusted workloads.
7. **Integrate rather than replace:** GitHub/GitLab and CI remain the systems of record for code and build execution.
8. **Provenance and freshness:** identify whether a result was imported or executed, and the exact revision it covers.
9. **Developer-friendly feedback:** actionable, low-noise, explainable results with controlled rollout and exceptions.
10. **Self-hosted with provider choice:** open-source components, configurable frontier-model keys, and local-model option.

### Non-goals

- Building a general-purpose autonomous coding agent or IDE.
- Automated code modification or remediation PRs as core MVP/V1 requirements.
- Replacing source control, CI/CD pipelines, vulnerability databases, or specialized testing frameworks.
- Allowing AI to pass quality gates or authorize changes.
- Fully automatic compliance certification, cost accuracy guarantees or incident prediction.
- Providing multi-tenant SaaS isolation in the initial self-hosted single-organization installation.
- Automatically running all possible scanners against every repository regardless of relevance.
- Requiring frontier-model API keys to obtain deterministic validation.

## 5. Core product engines

### 5.1 Engineering Validation Engine

**Responsibility:** evaluate proposed changes and repository baselines using deterministic checks, imported third-party evidence, or approved isolated jobs.

Capabilities:

- Build a **Repository Engineering Profile** by inspecting languages, manifests, lockfiles, CI configuration, frameworks, test tooling, Dockerfiles, database migration tools, IaC and telemetry configuration. Unknowns are recorded.
- Identify applicable checks from organization policies, repository profile, touched files, lifecycle stage and configured environment.
- Ingest GitHub CI/check status, test artifacts and supported scanner reports with provenance.
- Execute configured checks in **approved execution sandboxes only**, when a suitable runtime is available.
- Normalize findings, scan results, check coverage, status, location, category, severity, evidence references, revision and timestamps.
- Distinguish observed findings from heuristic or AI-suggested concerns.
- Produce a consistent, versioned **AssessmentPlan** and evidence registry.

**Validation domains** (not all equally deep in MVP):

| Domain | Representative checks | Target stage |
| --- | --- | --- |
| Security | SAST, dependency/SCA, secrets, container vulnerabilities, API security, IaC misconfiguration | PR and CI |
| Testing and code quality | Lint/typecheck, unit/integration/contract tests, changed-path requirements, regression results | Local, PR and CI |
| Reliability | Health/readiness, graceful shutdown, timeout/retry contracts, connection lifecycle, resilience tests | PR, CI and pre-production |
| Infrastructure | Terraform/OpenTofu validation/plan, Kubernetes manifest policy, Docker hardening | PR and CI |
| Database | Destructive migration detection, expand/contract compatibility, query performance tests | PR and CI |
| Performance | Comparable benchmark baselines, latency/resource regression, k6 evidence | CI and pre-production |
| Observability | Log/tracing/metrics instrumentation, propagation, health endpoints, expected telemetry | PR and CI |
| Compliance | Organization-defined controls and evidence obligations | Design through release |
| Cost | IaC cost-delta estimates and budgets | Infrastructure PR and pre-deploy |

**MVP must ship usable Security, Testing/Quality and Infrastructure assessment adapters** with a general mechanism for the other categories. Reliability, performance, observability, database, compliance and cost deepen in later stages. "Supported" always refers to specific tested checks, not a blanket claim of full-domain coverage.

### 5.2 Engineering Governance Engine

**Responsibility:** determine whether observed engineering evidence meets organizational standards and produce quality-gate outcomes.

Capabilities:

- Define versioned policies at organization, repository, branch/environment and lifecycle-stage scopes.
- Specify required vs advisory checks, applicability criteria, severity thresholds, owners, evidence-source acceptance rules, freshness and enforcement mode.
- Evaluate evidence with **deterministic rules**; optionally use OPA later.
- Return **PASS / WARN / BLOCK / INCOMPLETE / NOT_APPLICABLE**, with precise reasons.
- Permit explicitly scoped, time-limited waivers with named approver and full audit trail; non-waivable system security controls remain enforced.
- Publish the assessment outcome to the exact GitHub commit/PR as a check run/status when permitted, with deep links to findings.
- Support advisory-only rollout before switching policies to blocking mode; never silently default incomplete evidence to green.
- Maintain policy evolution and historical evaluation results without rewriting past outcomes.

**Gate semantics:**

| Gate | Meaning |
| --- | --- |
| PASS | Every applicable mandatory check has fresh trusted passing evidence and no blocking policy finding |
| WARN | Mandatory checks are complete; advisory warnings remain |
| BLOCK | Confirmed blocking policy violation or required check failure |
| INCOMPLETE | Required evidence missing, invalid, stale, skipped, timed out, or untrusted |
| NOT_APPLICABLE | Deterministically established that the policy/check does not apply, with reason |

A gate's **enforcement** (advisory versus merge-blocking) is separate from its **evaluation result**. A PASS is not an authorization to merge, and an AI explanation never changes the underlying decision.

### 5.3 Engineering Intelligence Engine

**Responsibility:** add contextual intelligence without becoming a coding agent or policy decision authority.

Capabilities:

- Explain scanner/test findings and their relevance to the changed code.
- Correlate related evidence across domains, such as a risky Terraform change combined with missing network policy.
- Investigate likely causes of failed assessments, with evidence-linked hypotheses and uncertainty.
- Recommend remediation approaches, test scenarios, safer configurations and relevant engineering standards.
- Identify missing checks or blind spots as **advisory** findings; do not fabricate passing evidence.
- Summarize engineering readiness for developers, reviewers and leaders.
- Optionally use external frontier models through LiteLLM or local inference, gated by organization policy and redaction.

**Required separation:** AI can recommend improvements and explain risks, but must not set PASS/BLOCK directly, grant policy exceptions, execute arbitrary code without a validated tool boundary, merge PRs or deploy.


### Built-in Engineering Standards Library

Preflyt ships first-party versioned policy packs for baseline engineering, application security, backend/frontend apps, infrastructure, APIs, databases, production readiness, performance and compliance evidence. Rules specify applicability, required/advisory classification, severity, accepted check evidence, capability availability and policy version. An organization can browse, combine and pin packs using Default, Recommended or Strict profiles. Repository discovery recommends packs with reasons. Missing or unsupported checks cannot count as passing. P0: working catalogue and selection. P1: evidence mapping. P2: deterministic quality-gate enforcement and controlled pack upgrades. P3: approved native execution for supported checks. AI recommendations cannot activate enforcement or grant exceptions. Full specification: [Engineering Standards Library](product/engineering-standards-library.md).

### RBAC and resource authorization requirements

Preflyt targets GitHub identity and inherited GitHub organizations under [ADR-0007](architecture/ADR-0007-github-first-identity-and-organizations.md), with current OIDC retained during migration, plus **NestJS-enforced organization and repository-scoped RBAC**, predefined roles and least-privilege action permissions. **P0** includes verified GitHub owner onboarding, member selection, roles, repository grants, server-side checks and audit; preserve legacy OIDC bootstrap until migration; **P1** scopes assessment/evidence access; **P2** separates policy publishing/enforcement/exception approvals; **P3** requires independent execution admission; **P4** scopes AI provider/model management; later phases add QA, performance and production permissions. No self-approved policy waivers, implicit cross-organization access or frontend-only enforcement. See [RBAC specification](product/rbac-and-authorization.md).

### Engineering Contributors module

Preflyt shall provide a **Contributors** item in the Engineering sidebar when implemented in P3. The list shows authorized GitHub contributors, activity metrics, charts, policy adherence and assessment coverage, with repository/time filters. Selecting a contributor opens a detail page with their repositories, commits, PRs, reviews, assessments, findings and policy evidence. P1 captures identity/activity metadata; P2 links revision-specific gate evidence; P3 ships the complete usable list and drill-down; P10/P11 add advanced trends. Missing evidence and private GitHub membership are explicitly represented. No opaque AI-generated employee productivity scores. See [Engineering Contributors](product/engineering-contributors.md).

### MVP experience contract

The [MVP Product Experience Contract](product/mvp-product-experience.md) is the authoritative target for navigation, enterprise dashboard, repository/assessment/finding/policy/contributor pages and role-aware states. The [Enterprise UI Guidelines](design/enterprise-ui-guidelines.md) and [Codex/Claude implementation guardrails](agents/product-implementation-guardrails.md) require API-backed, evidence-based, accessible, incremental implementation while preserving existing Shadcn Admin and P0–P11 order. These documents do not imply unimplemented pages already exist.

### GitHub organization ruleset governance (P2)

Preflyt shall expose **Governance → Quality Gates → GitHub Rulesets** with Standard, Strict and Custom safe-default profiles, repository/branch targeting, exact Preflyt Check Run source mapping, preflight, preview/diff, explicit authorization, deploy, drift and rollback. GitHub Actions supplies CI evidence; Preflyt's deterministic gate publishes a stable check; GitHub enforces it. Use a separately authorized organization Administration-write integration; never silently change unmanaged rulesets or activate an unverified required check. See [GitHub Ruleset Management](product/github-ruleset-management.md).

**Ruleset Insights (P2.R5):** each GitHub ruleset detail includes an Insights tab with source-backed evaluation counts, trend charts, failures by rule/repository, bypass events where attributable, filtered history and GitHub evidence links. Preflyt quality-gate outcomes are displayed separately. Attribution must use the detailed Rule Suites API's matching ruleset source ID, not suite-level results or fabricated totals. See [Ruleset Management](product/github-ruleset-management.md).

### Core multi-provider AI and stage routing

P0: administrators configure multiple providers, encrypted/write-only keys, hosted/local endpoints, connectivity tests, per-stage primary/fallback routes, egress restrictions and budgets. P1: evidence-linked AI interpretation of imported CI failures via PR/CI route. P4: advanced cross-domain intelligence. These requirements are additive and do not retroactively invalidate completed P0 development. Model failure never changes deterministic gate results.

### Notification Engine

Preflyt requires tenant- and repository-scoped notifications driven by durable events. P1 provides a working in-app inbox and top-bar bell for assessment activity; P2 adds quality-gate/policy/exception events and configured email delivery; P3 adds security findings; P4 adds AI availability/budget alerts; later phases add QA/performance/production events and Slack/Teams/webhooks. Recipient resolution uses RBAC; deduplication, retries, preferences and audit are mandatory. Notifications do not determine gate results. See [Notification Engine](product/notification-engine.md).

### PR Code Quality Review and AI Review Skills

Code quality is a first-class assessment domain. P1 imports lint, typecheck, coverage and static-analysis evidence with exact revision/provenance and optional read-only AI review; P2 provides a versioned Code Quality policy pack and deterministic gates; P3 adds native analyzers only after sandbox approval; P4 adds contextual multi-skill AI review and optional deduplicated GitHub inline feedback; P5 reuses findings in CLI/IDE. Agents may apply approved versioned instruction-only skills (candidate examples: Ponytail and Thermo-Nuclear Code Quality Review), subject to license/security review, model routing, egress and RBAC. Skill output is advisory and cannot block a PR without independent deterministic evidence. See [Code Quality Review](product/code-quality-review.md) and [Skill-Based Review](product/skill-based-code-review.md).

### Teams and scoped policy assignments

Preflyt shall support locally created and GitHub-imported teams. Authorized administrators can assign versioned standards/policies at **organization, team or individual repository** scope; team assignments apply automatically to explicitly approved policy-scoped repositories, including repositories shared by multiple teams. GitHub team access is **not** policy ownership or a grant of Preflyt RBAC. P0 additive team creation/import/sync, P1 repository provenance, P2 deterministic effective-policy compilation and conflict preview, P3 team reporting. No automatic enforcement expansion from new GitHub access without approval. See [Teams and Policy Inheritance](product/teams-and-policy-inheritance.md).

## 6. Supported SDLC stages and user journeys

### 6.1 Lifecycle coverage

| Stage | Primary goal | Planned workflow | Release slices |
| --- | --- | --- | --- |
| **Developer laptop** | Prevent defects before commit/push | Explicit CLI/pre-commit lint, secrets, types, tests, IaC/migration checks and local policy feedback | P5 |
| **Repository** | Establish engineering posture/standards | Discover stack, profile controls, baseline and later scheduled drift assessment | P0, P1–P3, P11 |
| **Pull request / CI** | Enforce change quality before merge | Import CI evidence, diff-aware planning, revision-bound gates, approved native validation and optional AI advice | P1–P4 |
| **QA / functional validation** | Validate functional and compatibility readiness | Unit/integration/E2E/contract/regression evidence and QA gate | P6 |
| **Performance / staging** | Catch latency and resilience regressions | k6 smoke, load, stress, spike, soak, breakpoint, scalability, regression, budgets and baselines | P7–P9, P11 |
| **Production feedback** | Convert escaped defects into earlier preventive controls | Link incident/deploy evidence to missing checks and propose owner-approved policy changes | P10 |

Requirements/design artifact validation is a later optional entrypoint alongside these six stages; production monitoring itself remains Shift Right and is used to improve earlier gates.

**Authoritative full-stage user journeys:** [Preflyt across the SDLC](product/sdlc-capabilities.md). **Authoritative incremental release and implementation-task breakdown:** [Deployable delivery plan](roadmap/incremental-delivery.md).

### 6.2 User journey A: GitHub onboarding and baseline

1. Administrator chooses Continue with GitHub, connects the organization App installation, and proves active GitHub organization ownership. Preflyt creates the matching workspace automatically and establishes its first Owner; no separate organization creation is required. GitHub login and verified onboarding are implemented behind a deployment flag; existing OIDC remains available during migration. Existing workspaces use explicit verified linking rather than automatic identity merging.
2. Preflyt discovers languages, manifests and CI/infra signals and drafts a Repository Engineering Profile.
3. Administrator reviews the profile and selects the applicable policy baseline.
4. Preflyt explains which checks are imported, which run in approved sandboxes, and which remain unavailable.
5. Initial read-only baseline assessment is triggered.
6. Repository detail displays findings, missing evidence, policy coverage and current readiness.
7. An authorized Preflyt Owner/Admin selects existing GitHub organization members or enters a GitHub username, verifies the account, and grants a Preflyt role and repository access. Those users sign in with GitHub; neither contributor activity nor organization membership alone grants Preflyt access.

### 6.3 User journey B: Pull request assessment (MVP primary flow)

1. A GitHub PR is opened/updated; authenticated webhook resolves exact head SHA and relevant base state.
2. Assessment Planner identifies changed paths, repository profile, stage and versioned policies.
3. Validation Engine collects already available CI evidence and runs eligible checks **only** if an approved sandbox is available.
4. Normalized evidence and findings are evaluated deterministically.
5. Intelligence Engine optionally provides evidence-linked analysis and recommendations.
6. A revision-bound Readiness Report is generated; GitHub check status/comment links to the report according to installed permissions.
7. Any new commit invalidates the previous report as *current*; a new assessment is scheduled.

~~~mermaid
flowchart TD
  PR["PR / CI event"] --> PROFILE["Repository profile + changed paths"]
  PROFILE --> PLAN["Versioned assessment plan"]
  PLAN --> SOURCE["Import CI evidence / approved sandbox checks"]
  SOURCE --> FIND["Normalized findings + provenance"]
  FIND --> RULES["Deterministic policy evaluation"]
  FIND --> AI["Optional AI assessment"]
  RULES --> REPORT["Engineering readiness report"]
  AI --> REPORT
  REPORT --> GATE{"Gate result"}
  GATE --> PASS["PASS / WARN"]
  GATE --> HOLD["BLOCK / INCOMPLETE"]
  PASS --> FEEDBACK["PR / dashboard feedback"]
  HOLD --> FEEDBACK
~~~

### 6.4 User journey C: Engineering standard enforcement

1. Platform/AppSec/SRE owner defines policy (e.g., no critical dependency CVEs, required test results, no public database exposure, or graceful shutdown test).
2. Policy starts in advisory mode with visible applicability and required evidence definitions.
3. Teams monitor observed pass/fail/unknown rates and tune false positives.
4. Authorized owner activates blocking enforcement for scoped repositories/branches.
5. Exceptions require reason, approver, expiry and audit; no agent can grant them.

### 6.5 User journey D: AI-assisted assessment explanation

1. Developer opens a failed assessment.
2. Preflyt shows deterministic failed checks and evidence **before** any model-generated analysis.
3. AI explains likely impact and reasonable next steps, differentiating observed evidence from hypotheses.
4. If the model is unavailable or source-code egress is disallowed, the deterministic assessment and quality gate remain available.

## 7. Delivery scope and roadmap

### 7.0 Shipping principle: each phase independently usable

No phase is considered delivered merely because a database, frontend shell, queue, infrastructure module or model gateway exists. **Every phase must ship a complete, deployable, user-visible vertical slice**, with its own installation/upgrade path, auth/security and safe-execution controls, end-to-end success/failure tests, observability, configuration, supported limitations and tested rollback. Earlier phases must keep working after later upgrades.

The sequence of independently useful releases is: **P0 Repository Posture → P1 CI Evidence → P2 Policy Gates → P3 Secure Native Validation → P4 Advanced AI Engineering Intelligence → P5 Developer CLI → P6 QA Readiness → P7 k6 Evidence/Gates → P8 Managed k6 Smoke/Load → P9 Advanced Performance → P10 Production Feedback → P11 Provider/Scale Extensions**.

Implementation tasks, dependencies, release criteria and rollback gates for every slice are in [docs/roadmap/incremental-delivery.md](roadmap/incremental-delivery.md). Do not treat the umbrella MVP/V1 labels below as excuses to defer a usable outcome until all their components are implemented.

### 7.1 Technical proof of concept — validate assessments, not code generation

**Required vertical slice:**

**GitHub PR → repository discovery → import/approved execution of security, tests and IaC checks → normalized findings → versioned policy evaluation → PASS/WARN/BLOCK/INCOMPLETE readiness report → GitHub feedback.**

Prove one seeded security failure, one missing required test result and one IaC violation, plus a clean PR, a stale revision and an AI-disabled run.

The PoC does **not** need to generate a patch or remediation PR. If a future separate coding-remediation experiment is authorized, fixture-only Git writing is governed by ADR-0002 and is **not part of this PoC's acceptance criteria**.

### 7.2 MVP — continuous engineering assessments

**MVP target outcomes, delivered incrementally by P0–P3:**

- Self-hosted initial organization onboarding inherited from a verified GitHub organization installation, GitHub user login, scoped authorization and audit; retain current OIDC as a compatibility option during migration. GitHub login, verified owner onboarding, workspace linking and member grants are implemented behind the login flag. Legacy identity merging, revocation events, reconciliation and full migration acceptance remain pending.
- GitHub integration, selected-repository onboarding, webhook signatures and idempotent PR/CI event ingestion.
- Repository Engineering Profile and changed-path applicability detection.
- Versioned baseline engineering policy with inherited repo scope, mandatory/advisory checks, enforcement mode.
- Security, testing/code-quality and infrastructure assessment adapters, with imported CI evidence support.
- Safe isolated repository execution **before** any Preflyt-run scanner, test, install/build or command on real repositories; ingest-only fail-safe fallback.
- Normalized findings and source/provenance/freshness; deterministic quality-gate engine.
- Readiness Report and revision-bound GitHub check/status feedback.
- Optional AI explanation and analysis through approved model gateway (**P4 extension**); **all core P0–P3 workflows must function without AI**.
- Basic Overview, Repositories, Assessments, Findings, Policies, Models/Integrations and Audit screens.
- Structured traces/metrics and per-run costs where models are used.
- Docker Compose local/evaluation setup; supported Kubernetes deployment path for approved real-repo execution.

**Explicitly excluded:** general automatic code edits/fix PRs, custom general-purpose coding agents, Kubernetes/CI replacement, advanced SRE incident remediation, GitLab initially, unbounded workflows, comprehensive domain-wide scanner coverage, multi-tenant SaaS.

### 7.3 V1 — broaden prevention across the SDLC

Deliver as separate working releases, not one all-or-nothing project:

- **P5 Developer Experience:** independently usable P5.1 shared local engine/CLI, P5.2 authenticated organization/policy sync, P5.3 VS Code diagnostics, P5.4 AI explanation and PR gate visibility, P5.5 opt-in Git hooks/editor compatibility. See [developer CLI and IDE specification](product/developer-cli-ide-extension.md).
- **P6 QA readiness:** import test suites and release candidate evidence, then add API-contract/database compatibility checks and QA gates.
- **P7 Performance evidence:** import existing k6 result artifacts, apply performance budgets and publish comparable baseline reports **without needing a Preflyt-owned load generator**.
- **P8 Managed performance:** authorized non-production k6 **smoke and load** tests using controlled execution, thresholds, results and cancellation.
- **P9 Advanced performance:** safe **stress, spike, soak/endurance, breakpoint, scalability and regression** scenarios with workload limits, meaningful baselines and reporting.
- Optional domain extensions: reliability/observability readiness, versioned exceptions and approval workflows, GitLab and design/requirements checks, each delivered as a separate usable vertical slice.

Complex distributed k6 Operator execution and organization-wide trends are later extensions unless validated demand justifies an earlier deployable slice.

**Automated remediation remains a separately proposed optional extension**, not a condition for V1 completion.

### 7.4 V2 — production feedback and broader engineering intelligence

- **P10 Production feedback:** read-only incident/deployment context, correlation with prior engineering evidence, owner-reviewed proposed checks, and recurrence tracking.
- **P11 Expansion:** GitLab and other provider adapters, scheduled posture/drift reports, optional distributed k6 Operator execution, observability correlations and broader cost/compliance/reliability policies.
- Broader cross-repository assessment trends, context-aware AI *advice*, and additional local/design-stage integrations may ship as independently useful follow-on releases.
- Automated code remediation remains a **separately authorized optional module**, not a condition for any stage to be usable.

**Roadmap gate:** features advance based on validated effectiveness, safety and user adoption, not assumed model autonomy.

## 8. Functional requirements

Use **M** for MVP, **V1** for next stage and **V2** for expansion. Every requirement must have testable acceptance evidence.

### 8.1 Identity, integrations and repository profiles

| ID | Stage | Requirement | Acceptance |
| --- | --- | --- | --- |
| FR-001 | M | Authenticate users with GitHub; establish server-owned sessions, verified organization membership and explicitly assigned Preflyt roles; preserve OIDC during migration | Login, identity-linking, session, revocation and authorization tests pass per ADR-0007; legacy OIDC remains secure |
| FR-ID-01 | M | Create workspace identity from a verified GitHub organization installation; no separate manual organization creation | Verified GitHub owner initializes one workspace; non-owner/duplicate/foreign-installation claims are rejected |
| FR-ID-02 | M | Select active GitHub organization members or resolve usernames to stable account IDs and grant scoped Preflyt access | Only authorized admins can grant access; non-members, bots, pending invitations and unassigned accounts are denied |
| FR-ID-03 | M | Limit access to user GitHub rights, installation/selected repositories and Preflyt grants | Private evidence and cached summaries cannot escape the intersection; role changes apply on the next request |
| FR-ID-04 | M | Revoke access using verified provider events and reconciliation, with authorization evidence at most five minutes old | Provider removals disable affected access; stale/unavailable verification fails closed without treating a transient outage as logout |
| FR-002 | M | Connect explicitly selected GitHub repositories with least-privilege permissions | No access to unselected repositories; no code-write scope required |
| FR-003 | M | Verify webhooks and process events idempotently and revision-aware | Duplicate/out-of-order deliveries cannot overwrite newer assessment |
| FR-004 | M | Discover repository languages, manifest/test/CI/IaC signals with unknown-state reporting | Profile links to observed evidence and supports authorized corrections |
| FR-005 | M | Create assessment from PR, CI event, or authorized manual request at a specified revision | Assessment records source event/actor, SHA, stage and scope |
| FR-006 | V1 | Add GitLab using repository/CI provider adapters | Provider contract tests match GitHub semantics |

### 8.2 Engineering Validation Engine

| ID | Stage | Requirement | Acceptance |
| --- | --- | --- | --- |
| FR-010 | M | Generate versioned AssessmentPlan from profile, changed paths and scoped policy | Applicable checks and skip/nonapplicable reasons deterministic |
| FR-011 | M | Import GitHub check results and supported test/scanner artifacts | Provenance, source, revision, age and trust classification visible |
| FR-012 | M | Support initial security, testing/quality and IaC check adapters | Seeded positive, negative and malformed evidence cases pass |
| FR-013 | M | Execute applicable scans/tests in **approved repository sandboxes only** | Missing approval blocks run; no fallback to API/worker shell |
| FR-014 | M | Normalize check results and findings, preserve occurrences and immutable artifacts | Fingerprinted findings show category, severity, location and source |
| FR-015 | M | Distinguish pass, fail, error, skipped, stale, inconclusive and not applicable | Missing mandatory evidence never becomes passing status |
| FR-016 | V1 | Add reliability, DB migration, observability and performance validation adapters | Each domain has defined evidence and benchmark fixture cases |
| FR-017 | V1 | Add configurable local/design/pre-production assessment entrypoints | Inputs identify lifecycle stage and immutable subject revision |

### 8.2A Built-in policy library requirements

| ID | Phase | Requirement | Acceptance |
| --- | --- | --- | --- |
| FR-POL-01 | P0 | Browse first-party versioned packs and see supported/planned checks | Five initial packs can be inspected and selected |
| FR-POL-02 | P0 | Recommend packs from detected stack and save organization/repository profile | Backend and IaC repositories receive explainable recommendations |
| FR-POL-03 | P1 | Map CI evidence to required template checks | Missing evidence remains INCOMPLETE |
| FR-POL-04 | P2 | Compile and evaluate effective versioned policy, with manual upgrade approval | Same rule/evidence yields same gate; update never silently changes enforced policy |
| FR-POL-05 | P3+ | Enable supported native check adapters and later specialized packs | Unsupported pack checks never report PASS |

### 8.3 Engineering Governance Engine

| ID | Stage | Requirement | Acceptance |
| --- | --- | --- | --- |
| FR-020 | M | Manage versioned org/repo/stage quality policies and required/advisory check definitions | Policy version tied to report and audit record |
| FR-021 | M | Evaluate PASS/WARN/BLOCK/INCOMPLETE/NOT_APPLICABLE deterministically | Fixture permutations produce unambiguous expected outcome |
| FR-022 | M | Publish revision-bound readiness as GitHub check/status, with advisory or blocking mode | New commit cannot inherit stale green result |
| FR-023 | M | Preserve rule applicability, trusted evidence source and exclusion reason | Unavailable or stale required evidence produces INCOMPLETE |
| FR-024 | V1 | Permit authorized time-limited exception/waiver with reason and approver | AI and ordinary developers cannot self-waive mandatory rules |
| FR-025 | M | Support initial policy rollout in advisory mode with explicit enforcement change | No accidental blocked merge before configured enforcement |

### 8.4 Engineering Intelligence Engine

| ID | Stage | Requirement | Acceptance |
| --- | --- | --- | --- |
| FR-030 | M | Provide evidence-linked optional AI explanation and triage of findings | Distinguishes observed from inferred and cites check/evidence |
| FR-031 | P0 | Configure multiple providers with encrypted write-only credentials and connectivity tests | Two providers can be independently configured and tested |
| FR-031A | P0 | Define stage-specific primary/fallback models, data-egress policy and budgets | Routing preview and restrictions verified |
| FR-031B | P1 | Explain imported CI failures through approved PR/CI model route | Evidence-linked response and recorded model; gates unchanged |
| FR-032 | M | Never delegate deterministic gate decision, authorization or waiver to AI | Adversarial AI response cannot set PASS or change policy |
| FR-033 | M | Work normally without any model/API key | Scans, policy and readiness operate when inference is disabled |
| FR-034 | V1 | Provide optional specialized domain advisory analysis | No automatic code edits or Git PR writes implied |

### 8.5 Stage-specific capabilities and deployable increments

The [SDLC capability document](product/sdlc-capabilities.md) defines inputs, outputs and rules for all six stages. The [delivery plan](roadmap/incremental-delivery.md) breaks every stage into independently deployable slices. The following requirements ensure that the roadmap produces real usable outcomes:

| ID | Phase | Required capability | Acceptance |
| --- | --- | --- | --- |
| FR-050 | P0 | Repository engineering profile and missing-control view | One selected GitHub repository produces a useful profile in a clean installation |
| FR-051 | P1 | CI evidence assessment | A sample PR displays imported checks, exact revision, provenance and failed/missing evidence |
| FR-052 | P2 | Policy quality gate | A required failing check BLOCKs, absent evidence is INCOMPLETE and a new commit does not inherit old PASS |
| FR-053 | P3 | Safely executed native scanners/tests | Seeded issue detected in approved sandbox; missing approved executor fails closed to ingest-only |
| FR-054 | P4 | Optional AI explanation | Evidence-linked explanation never changes a deterministic gate; no-AI operation remains usable |
| FR-055 | P5 | Local developer checks | CLI detects seeded local issue and marks its result advisory, not a trusted CI pass |
| FR-056 | P6 | QA release readiness | Release candidate includes test-suite identity, required contract checks and incomplete/failing gate semantics |
| FR-057 | P7 | Import k6 reports and evaluate budgets | Existing k6 result becomes an evidence-backed performance report without managed load generation |
| FR-058 | P8 | Execute bounded k6 smoke/load on registered non-production target | Achieved workload, p95/error thresholds, evidence and safe cancellation are visible |
| FR-059 | P9 | Advanced k6 stress/spike/soak/breakpoint/scalability | Workload-specific limits, emergency stop, baseline comparability and complete results are enforced |
| FR-060 | P10 | Production feedback to earlier engineering standards | SRE links incident and release to previous control gaps and produces an owner-reviewable policy proposal |
| FR-061 | All | Complete deployable usable vertical slice | Phase can be installed/upgraded, demonstrated, monitored and safely rolled back without later phases |

### 8.6 User interface, feedback and audit

| ID | Stage | Requirement | Acceptance |
| --- | --- | --- | --- |
| FR-040 | M | Overview lists assessment coverage, open findings, gate outcomes and freshness | Counts reconcile to reports; no opaque ungrounded score |
| FR-041 | M | Repository page shows profile, applicable policies, checks, findings and assessment history | User can identify missing and blocked evidence |
| FR-042 | M | Assessment detail shows plan, check timeline, evidence, policy reasons, optional AI advice | Reviewer can reconstruct gate decision for exact revision |
| FR-043 | M | Audit model, policy, integration, execution and report publication operations | Actor, timestamp, policy version and resource retained |
| FR-044 | V1 | Add comparative trends and risk/domain breakdowns | Coverage and uncertainty visible; apples-to-apples comparisons |
| FR-045 | M | Show executor availability and evidence-only fallback explicitly | No false green results when sandbox is blocked |

## 9. Data model and interface contracts

### 9.1 Primary logical entities

Organization, User, Membership, IdentityProviderConfiguration, GitInstallation, Repository, RepositoryProfile, AssessmentRequest, Assessment, AssessmentPlan, AssessmentCheck, CheckEvidence, Finding, FindingOccurrence, PolicySet, PolicyRule, PolicyEvaluation, PolicyException, ReadinessReport, WorkflowRun, ToolExecution, EvidenceArtifact, ModelUsage, AuditEvent.

RemediationAttempt and RemediationPR belong to a **separate future optional module**, not the primary MVP data model.

### 9.2 Assessment and evidence contract

The normative architecture is in [ADR-0004](architecture/ADR-0004-shift-left-assessment-governance.md). Key requirements:

- Assessment subject: stable org/repo ID, PR number or asset, original commit SHA, base/integration context and lifecycle stage.
- Plan: policy version and applicability computed **before** running checks.
- Evidence: trust/provenance, source/imported-vs-executed, outcome, artifact integrity digest, freshness, tool version, and pinned environment where executed.
- Report: check coverage, findings, rule decisions, gate output, current-at-observed-revision status and separate optional AI explanation.
- No evidence payload may be substituted by a model-generated assertion of test success.
- Historical results remain immutable; subsequent commits or changed policy produce new assessments.

### 9.3 Adapter interfaces

- **RepositoryProvider:** repository profile, PR diff, commit/branch context, GitHub/GitLab check-state publishing.
- **CIProvider:** run/check status, logs and report artifacts with source verification.
- **CheckProvider:** configured scanner/test execution plan and normalized result schema.
- **SandboxBackend:** admission verification, create/run/cancel, resource and egress controls, artifacts, cleanup.
- **AssessmentPlanner:** subject, profile, policy -> applicable checks and data collection plan.
- **PolicyEvaluator:** immutable plan + normalized evidence -> deterministic decisions and reasons.
- **IntelligenceProvider:** read-only evidence context -> explanation/recommendations, with model/effect limits.
- **ArtifactStore / SecretProvider / AuditSink:** scoped storage, lifecycle/rotation and traceability.

## 10. Technical architecture

~~~mermaid
flowchart TD
  SOURCE["GitHub / GitLab later / CI"] --> API["NestJS integration + assessment API"]
  USER["React + TypeScript"] --> API
  API --> P[("PostgreSQL / Prisma")]
  API --> QUEUE[("Redis / BullMQ")]
  API --> POLICY["Policy store + ruleset versions"]
  QUEUE --> PLANNER["Assessment planner"]
  PLANNER --> EXEC["Evidence import / approved execution controller"]
  EXEC --> SCAN["Sandboxed scans and tests"]
  EXEC --> NORMAL["Normalization + evidence provenance"]
  SCAN --> NORMAL
  NORMAL --> GATE["Deterministic governance evaluator"]
  NORMAL --> INTEL["Optional TypeScript AI assessment worker"]
  INTEL --> MODEL["LiteLLM -> frontier or local models"]
  GATE --> REPORT["Engineering Readiness Report"]
  INTEL --> REPORT
  REPORT --> API
  API --> CHECK["GitHub revision-bound check/status"]
  API --> AUDIT["Object storage + OTel / optional APM"]
~~~

### Technology decisions (unchanged)

- **Frontend:** **Pull the [Shadcn Admin](https://github.com/satnaing/shadcn-admin) source at a reviewed, pinned full Git commit SHA and build Preflyt directly on that dashboard codebase in `apps/web`**, adapting its React + Vite + TypeScript structure, layout, navigation, router and components. The upstream README explicitly calls it **not a starter template**, but this does not prevent using its source as a foundation after license/security review. Preserve audited license notices/source provenance, remove unwanted demo pages/data, and replace Clerk/mock authentication with Preflyt server-managed sessions and the GitHub-first target, preserving OIDC compatibility during migration. Integrate into pnpm/Turborepo and use compatible Tailwind/shadcn/ui, TanStack Query/Table and validated forms. See [ADR-0005](architecture/ADR-0005-shadcn-admin-frontend.md).
- **API/control plane:** Node.js, NestJS and TypeScript.
- **Background workers:** TypeScript with Redis/BullMQ for bounded durable work. Workers are separate from the API process.
- **Caching:** optional Redis/Valkey metadata cache with bounded TTLs and deployment-scoped keys. Cached data must never authorize access; Redis outages fall back to authoritative sources. Cache storage must be separate from durable BullMQ queue storage/eviction policy.
- **Database:** PostgreSQL + Prisma; large evidence/artifacts in scoped object storage.
- **Model plane:** LiteLLM as an independently deployed gateway; external provider API keys and/or local inference, with redaction and provider policy.
- **Execution:** TypeScript Docker/Kubernetes controller; approved stronger sandbox runtime for real repository code execution.
- **Packaging:** Docker Compose evaluation deployment is implemented for current services; Helm/Kubernetes deployment remains planned.
- **Observability:** OpenTelemetry and optional SigNoz.

Open-source component/rule/model license checks are mandatory before redistribution or commercialization.

### Complete Compose and APM configuration requirements

Every release must publish images and a **complete single-command Docker Compose install** for its current services (frontend, NestJS API, PostgreSQL, Redis, workers, LiteLLM and object store where needed), with versioned `.env.example`, startup/health checks, safe migrations, durable volumes, upgrade and rollback instructions. Configured users should start all required services via `docker compose up -d` with no host application dependency installation. Optional OTEL Collector and local model services may be separate Compose profiles.

**OpenTelemetry must be vendor-neutral.** The root example environment declares standard OTEL exporter endpoint, protocol, header, traces/metrics/logs exporters, resource metadata, propagation and sampling; Compose injects shared settings and distinct `OTEL_SERVICE_NAME` values into first-party services. Users can configure any compatible OTLP endpoint without editing code. Failures of telemetry exporters must not make core application requests fail. See [OTel contract](deployment/opentelemetry-env.md). **Current implementation:** root `.env.example`, complete Compose services, optional collector and API/worker OTLP traces, metrics and structured logs are implemented. Published images require the release workflow to succeed; future model gateway/evidence storage and Kubernetes execution remain planned.

### Kubernetes deployment architecture

**Selected mode:** Docker Compose for standalone self-hosting; **Helm-bootstrapped Preflyt Operator and CRDs for Kubernetes**. Helm installs the controller and CRDs, and a Preflyt custom resource describes the application desired state. Helm's standard CRD packaging cannot be toggled with ordinary chart values; `--skip-crds` is supported when administrators manage CRDs separately. Operator lifecycle management must cover readiness, secrets references, safe upgrades, stateful dependency ownership and drift. A direct Helm application chart is an optional fallback. Kubernetes implementation is **planned** and must not block existing Compose releases. See [ADR-0006](architecture/ADR-0006-kubernetes-operator-deployment.md).

### Execution trust boundary: mandatory in MVP

**Every Preflyt-executed command touching a connected repository—including scanner parsers, package install scripts, tests and builds—must run under the security-reviewed isolation contract in ADR-0002.** Do not assume Docker or an ordinary Kubernetes Job alone is sufficient for untrusted repositories.

For real repositories, require approved stronger isolation, pinned checkout/image, no platform/model/Git write credentials, default-deny egress, worker/node separation, non-root/no host socket, quotas/deadlines, clean artifacts, effective runtime checks and escape/exfiltration tests.

If no safe execution runtime is available, Preflyt is **INGEST_ONLY**: use external CI evidence, mark unsupported/missing required checks INCOMPLETE and never run code unsafely. A local Docker runner may be used only with explicitly designated disposable fixtures.

### Security and authentication

- GitHub login and inherited organization/member onboarding are the accepted routine-access target under [ADR-0007](architecture/ADR-0007-github-first-identity-and-organizations.md). Retain server-managed sessions, explicitly scoped Preflyt roles, OIDC compatibility during migration and the separate deployment-configured local Super Admin recovery path.
- Current implementation: valid configured GitHub login can operate without OIDC. If both routine providers are absent/disabled, configured Super Admin permits recovery-only operation. Partial OIDC configuration or failed discovery fails closed; GitHub configuration/token-key validation also fails closed. Legacy identity merging and full migration acceptance remain pending; no provider outage silently changes the authenticated identity.
- Signed webhook validation, idempotency, replay handling and exact revision association.
- Least-privilege Git installation access: read repository/CI data plus authorized check-run/status publishing; no general branch write needed.
- Encryption/rotation of model credentials; source-code egress policy; model tools cannot access CI/SCM secrets or grant themselves new rights.
- Sandbox and API/worker isolation, resource quotas, default-deny egress and secret redaction.
- Protected immutable evidence and time-bounded retention, with access controlled at organization/repository levels.
- Prompt injection from repository/PR/CI text is untrusted input; AI is advisory only.

## 11. UI structure and example output

**Core navigation:** Overview · Repositories · Assessments · Findings · Policies & Quality Gates · Standards/Profiles · Integrations · Models & AI · Audit · Settings.

**Assessment detail must present** exact repository/revision/PR, policy version, lifecycle stage, planned vs completed checks, source provenance and freshness, deterministic gate reasons, domain findings with severity and location, and separate AI advice.

An illustrative report:

~~~text
Preflyt / payment-api / PR #184
Revision: pinned SHA
Assessment stage: Pull request
Policy: production-readiness-v3

Security            PASS
Testing             PASS
Infrastructure      PASS
Reliability         BLOCK    Graceful shutdown integration test failed
Performance         INCOMPLETE   Comparable benchmark absent

Overall gate: BLOCK
AI advice: Check request draining during SIGTERM; add a reproducible shutdown test.
Action: Fix the failing check and rerun the assessment. Preflyt does not edit your code.
~~~

Readiness status must never be based on fabricated AI tests or an unexplained aggregate score.

## 12. Non-functional requirements and initial targets

| ID | Requirement | Initial target / test |
| --- | --- | --- |
| NFR-01 | Webhook durability | Authenticate + persist event before asynchronous acknowledgement; duplicates do not create duplicate assessments |
| NFR-02 | Revision correctness | Every report and Git status bound to exact SHA; stale results cannot pass a newer change |
| NFR-03 | Performance | Aim for p95 webhook acknowledgement under 2 seconds excluding upstream delivery; validate during staging |
| NFR-04 | Determinism | Same evidence and ruleset version produce the same gate outcome |
| NFR-05 | Safe execution | No real-repository execution without approved isolation; negative egress/exfiltration tests pass |
| NFR-06 | Evidence correctness | Imported vs executed, complete vs inconclusive, fresh vs stale are never conflated |
| NFR-07 | AI independence | With AI disabled, deterministic assessment and quality gate still complete |
| NFR-08 | Traceability | Every check has provenance, policy/revision, timestamps, outcome and evidence refs |
| NFR-09 | Operational limits | Jobs have timeout, CPU/memory/disk, request volume, concurrency and spend ceilings |
| NFR-10 | Deployment | Tested Compose evaluation deployment and separately tested approved Kubernetes execution |
| NFR-11 | Privacy | Secrets and prohibited data absent from agent context, logs and externally transmitted payloads |
| NFR-12 | Audit | Config, policy, report and exceptional enforcement changes tied to actor and time |

Availability SLOs, RTO/RPO, retention and size limits are to be set before production rollout.

## 13. Success metrics and evaluation

**Primary metrics:** percentage of PRs assessed before merge, required-check evidence coverage, mean time to actionable findings, blocking/waiver rates, escaped defects by category, and developer-reported usefulness.

**Operational metrics:** assessment p50/p95 duration, check failure rate, dropped/late events, stale report rate, execution costs, model costs, executor admission failures, and policy-evaluation reproducibility.

**Evaluation fixtures for MVP:**

1. Known vulnerable dependency is found and security rule blocks.
2. Missing required test result yields INCOMPLETE, **not** PASS.
3. Unsafe IaC configuration is detected by configured scanner/policy.
4. Clean PR yields PASS with evidence.
5. New commit invalidates the previous report's claim of current readiness.
6. AI/model endpoint unavailable: deterministic gate still works.
7. Unapproved sandbox: code does not execute; imported CI evidence remains available.
8. Malicious PR comments/code cannot alter policy, leak credentials or authorize a quality gate.
9. Advisory-mode rules do not accidentally block branch protection; explicitly blocking rules do.

Avoid claiming engineering incidents were prevented without observing policy enforcement or subsequent defect escape trends.

## 14. MVP acceptance criteria

- [ ] GitHub integration supports selected repos and signed, idempotent events.
- [ ] GitHub login, inherited organization onboarding, member grants, repository isolation, provider revocation and migration comply with ADR-0007; existing OIDC compatibility and local Super Admin recovery remain protected.
- [ ] Repository profile identifies relevant check inputs and unknowns.
- [ ] An AssessmentPlan is versioned, reviewable, and derived from scope/changed paths.
- [ ] At least security, testing/quality and infrastructure checks have functional adapters or documented imported evidence.
- [ ] Preflyt-executed real-repository code is rejected without approved isolation and negative security tests.
- [ ] Evidence provenance, freshness, hashes and subject commit are recorded.
- [ ] Gate outcomes are deterministic, including INCOMPLETE when mandatory evidence is missing.
- [ ] Report shows domain results, findings, evidence and rule reasons for exact SHA.
- [ ] GitHub gets correctly scoped, revision-bound status with advisory/blocking distinction.
- [ ] AI explanation is clearly advisory; absent model/API key does not break core functionality.
- [ ] No general code editing, fix-PR workflow or code-writing SCM token is needed to deliver the MVP.
- [ ] Docker Compose evaluation path and approved Kubernetes production execution path are documented and tested.

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Broad domain scope causing shallow coverage | Weak product value | Ship tested security, testing and IaC vertical slices first |
| Scanner noise / false positives | Low adoption | Evidence provenance, applicability, suppression governance, advisory rollout |
| Missing mandatory CI evidence | Stalled PR checks | INCOMPLETE with actionable missing-check reason and policy owner |
| Unsafe execution of repository code | Critical security exposure | Mandatory approved sandbox and ingestion-only fallback |
| AI interpretation mistaken for authority | Unsafe policy decisions | Explicit advisory separation and deterministic gate engine |
| Stale/incorrect PR revision | Misleading readiness | SHA-bound results, reconciliation and freshness handling |
| Costly model inference | Unexpected spend | AI opt-in, budgets, routing, deterministic no-AI operation |
| Provider permissions over-scoped | Repository compromise | Read/check-status permissions only for core MVP |
| Licensing conflicts | Distribution risk | Tool, ruleset, model and SDK license inventory |
| Non-comparable performance benchmarks | False regression claims | Fixed context/environment and explicit confidence/evidence constraints |

## 16. Open decisions

1. Default policy baseline and check applicability configuration schema.
2. Core supported scanner versions/rules, import formats and commercialization rights.
3. Approved real-repository sandbox runtime/cluster profile and independent security signoff.
4. Default advisory rollout period and who can enable blocking enforcement.
5. Evidence freshness windows, imported-CI authenticity checks and check-run publication permission boundaries.
6. Benchmark environment requirements for meaningful reliability/performance statements.
7. Initial model gateway SDK/provider choices and source-code egress policy.
8. Minimum single-organization deployment size and backup/recovery targets.
9. API contract and persistence schemas for AssessmentPlan, CheckEvidence and PolicyEvaluation.
10. Whether any future remediation module should be built or integrated with an external coding tool; **not a blocker for the core platform**.

## 17. Engineering workstreams and release task ownership

The release ownership model is **end-to-end vertical slices**, not standalone infrastructure workstreams. Each phase in [the task breakdown](roadmap/incremental-delivery.md) contains the minimum frontend, API, provider, storage, job, policy, test, security, documentation, deployment and rollback tasks required for the promised user action.

- **P0–P3:** repository profile → imported CI evidence → required quality gate → approved native scans/tests.
- **P4:** optional read-only AI explanation, isolated from policy evaluation.
- **P5–P6:** local developer checks and QA/release-candidate assessments.
- **P7–P9:** k6 performance evidence/imports, managed smoke/load, then advanced controlled performance profiles.
- **P10–P11:** production feedback, provider expansion, scheduled baselines and advanced operations.

A task can be developed behind a feature flag in parallel, but it cannot be counted as delivered until its **usable phase-level acceptance test** and rollback procedure pass.

### Related documents

- [ADR-0001 — TypeScript-first stack](architecture/ADR-0001-typescript-first-stack.md)
- [ADR-0002 — Safe execution and optional future remediation contract](architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md)
- [ADR-0003 — Legacy OIDC authentication](architecture/ADR-0003-oidc-user-authentication.md)
- [ADR-0007 — GitHub-first identity and organizations](architecture/ADR-0007-github-first-identity-and-organizations.md)
- [ADR-0004 — Shift Left assessment and governance architecture](architecture/ADR-0004-shift-left-assessment-governance.md)
- [ADR-0005 — Pinned Shadcn Admin source import](architecture/ADR-0005-shadcn-admin-frontend.md)
- [Capabilities across the SDLC](product/sdlc-capabilities.md)
- [Engineering Standards Library](product/engineering-standards-library.md)
- [Incremental delivery phases and task breakdown](roadmap/incremental-delivery.md)
- [README](../README.md)

---

**Decision for review:** Approve the **assessment-first Shift Left** scope and MVP gates. Do not start coding-agent/remediation development as if it is required for Preflyt to deliver value.
