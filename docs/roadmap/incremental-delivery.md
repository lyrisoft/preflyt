# Preflyt incremental delivery plan: usable vertical slices

**Status:** Proposed development roadmap, not an implementation claim  
**Version:** 0.1 · **Date:** 2026-10-08  
**Related:** [SDLC capability model](../product/sdlc-capabilities.md) · [PRD](../PRD.md) · [ADR-0004](../architecture/ADR-0004-shift-left-assessment-governance.md)

## 1. Definition of a phase

**Every phase must be independently deployable and usable**, delivering an end-to-end user action and observable outcome. A database schema, microservice, queue, UI shell, scanner integration or agent SDK **alone does not count as a phase**.

Every phase must specify:
- **User value:** what a developer, platform owner, SRE or QA engineer can actually do when deployed.
- **Vertical implementation tasks:** minimal UI/API, persistence, event/worker, provider integration, evidence/policy handling and security work needed for that scenario.
- **Entry dependencies:** capabilities that must be working from earlier phases; later features are not required to operate it.
- **Acceptance demonstration:** a concrete use case, expected result and negative/failure-path test.
- **Deploy/operate:** Docker Compose or Helm artifacts for supported environment, configuration/secrets, health, telemetry, smoke run, migration and rollback.
- **Feature flags:** incomplete/new capabilities are explicitly gated; upgrade preserves earlier working stages.
- **Documentation:** admin setup, limitations, operational runbook, end-user instructions and an issue/PR checklist.

Phases below are **ordered release slices**, not promises of calendar duration. Workstreams can implement internal components in parallel, but no phase is marked done before its complete vertical slice passes. The initial deployment is a **self-hosted single-organization installation**.

## 2. Release overview

| Phase | Release capability users can use | Entry point | Planned functionality / value |
| --- | --- | --- | --- |
| **P0** | **Repository Posture v0** | GitHub + web UI | Connect a selected repository, inspect an evidence-backed profile and missing engineering controls |
| **P1** | **CI Evidence Assessments** | GitHub PR/CI + UI | Import check/test results, view revision-bound assessment without executing repo code |
| **P2** | **Policy Quality Gates** | PR/CI + UI | Apply mandatory/advisory policy, publish exact-SHA status and clear PASS/WARN/BLOCK/INCOMPLETE |
| **P3** | **Native Secure Validation** | PR + approved executor | Execute security/testing/IaC scans safely and enrich findings beyond imported evidence |
| **P4** | **Advanced AI Engineering Intelligence** | SDLC assessments | Advanced model-routed investigations and recommendations; deterministic gates remain independent |
| **P5** | **Developer Experience: CLI + IDE** | Laptop / VS Code | Shared local engine, CLI, policy sync, inline diagnostics, AI explanations and optional Git hooks |
| **P6** | **QA Release Readiness** | QA/CI + UI | Import end-to-end/contract/regression evidence and validate release candidate readiness |
| **P7** | **k6 Performance Evidence** | Existing k6/CI + UI | Import k6 results and gate comparable performance evidence against budgets |
| **P8** | **Managed k6 Smoke & Load** | Performance UI + approved runner | Run approved smoke/load tests, view reports and thresholds safely |
| **P9** | **Advanced Performance Profiles** | Performance UI | Stress/spike/soak/breakpoint/scalability with safety controls and baselines |
| **P10** | **Production Feedback Loop** | Read-only incident/deploy integration | Link escaped incidents to releases and earlier checks; propose human-approved improvements |
| **P11** | **Operational Expansion** | GitLab / scheduled profiles | Expand providers, distributed k6, trends, observability correlations and cost/compliance checks |

**P0–P3 form the first commercially meaningful MVP foundation.** P4 expands the core AI intelligence capability; P5–P9 deepen Shift Left through local, QA and performance workflows; P10 moves production learnings earlier; P11 expands scale and integrations. The first deliverable is P0, **not** an empty architecture scaffold.

## 3. Detailed per-phase tasks and completion gates

### P0 — Repository Posture v0

**User value:** An administrator can sign in, connect one or more selected GitHub repositories, inspect discovered engineering characteristics and see clearly labeled missing/unknown controls.

**Tasks:**
- P0.1 Set up pnpm/Turborepo, NestJS API, Prisma/PostgreSQL and minimum health/telemetry; **pull the existing Shadcn Admin source at a reviewed, pinned full upstream Git SHA, build it, then integrate its React/Vite code into `apps/web`** as Preflyt's frontend foundation, rather than independently scaffolding the dashboard. Preserve source/license attribution and audit dependencies/customized components.
- P0.2 Implement GitHub-first login, verified organization-owner onboarding, inherited organization identity and GitHub member selection per [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md). Current OIDC login/bootstrap and scoped RBAC remain operational during additive migration; this target is not yet implemented.
- P0.3 Implement GitHub App installation and repository selection with least-privilege *read* permissions, store secrets server-side.
- P0.4 Discover pinned-commit profile: language/framework, manifest/lockfiles, CI, tests, Docker/IaC, migration hints; evidence and unknown labels.
- **P0.4a:** Ship a browsable, versioned first-party Engineering Standards Library (baseline, security, backend, frontend, IaC); recommend applicable packs based on detected stack and allow authorized Default/Recommended/Strict profile selection. Mark unsupported checks clearly.
- P0.5 **Refactor the imported Shadcn Admin layout, routing and navigation** into Preflyt-branded functional screens; remove unrelated demos and mock data, replace upstream Clerk/demo auth with server-session-guarded routes, implement the actual repository list/detail/profile with loading/empty/error states, basic audit and missing-control report. No AI, fake future-feature pages or repository code execution.
- P0.6 Package versioned prebuilt images and **complete Docker Compose deployment** (frontend, API, PostgreSQL, Redis, required workers, model gateway and evidence storage as applicable), with a root `.env.example`, DB migrations, health checks, persistent volumes, backup and safe upgrade/rollback. **All current-release services start through `docker compose up -d` after configuration; no host-side application dependency installation.** Include standard OpenTelemetry exporter environment variables for any OTLP-compatible APM, per-service names, and an optional collector profile; see [OTel deployment contract](../deployment/opentelemetry-env.md).

**Done when:** On a clean deployment an authorized user logs in, selects a GitHub repo and sees a correct profile and missing-control report; an unauthorized user cannot view it. Deleting/losing a provider token gives a visible, non-misleading error. Rollback preserves repository/profile records.

- **P0.RBAC:** Implement predefined organization roles, repository-scoped membership/grants, authorization-aware navigation and NestJS resource checks. Test cross-organization denial, assignment/revocation, audit, verified GitHub owner onboarding and legacy owner-bootstrap protection. See [RBAC specification](../product/rbac-and-authorization.md).

### P0 AI configuration extension (additive)

- **P0.AI1:** Multiple provider connections, encrypted write-only keys, local/compatible endpoints and connectivity testing.
- **P0.AI2:** Primary/fallback model routing for laptop, repository, PR/CI, QA, performance/staging and production feedback, with egress, budget and RBAC restrictions.
- **P0.AI3:** Working Settings → AI Providers & Routing interface with audit and route preview. Preserve already completed P0 functionality.

### P0 GitHub-first access update (implementation pending)

**Accepted foundational access update:** Deliver ADR-0007 within P0 access-control scope without adding/reordering phases. Build additive provider links and migration first, then GitHub login/organization-owner onboarding, member-directory and username grants, repository access intersection, revocation/reconciliation and bounded authorization caching. Demonstrate renamed usernames, unassigned/non-member denial, owner-claim races, private-repository isolation, provider outage handling, OIDC migration and safe rollback before making GitHub login the default. This does not mark current P2 enforcement work complete.

### P1 — CI Evidence Assessments

**User value:** A developer opens a PR or a CI run completes and can inspect an assessment with collected test/check status and provenance.

**Tasks:**
- P1.1 GitHub signed webhook, replay/idempotency and revision-aware event processing; Redis/BullMQ worker with persistence/reconciliation.
- P1.2 Ingest GitHub check/CI status and common test/scanner artifact formats without executing connected code.
- P1.3 Define AssessmentRequest/Plan, imported CheckEvidence, result/status vocabulary and artifact integrity references.
- **P1.3a:** Map imported CI evidence to selected versioned pack rules and expose missing or unsupported evidence.
- P1.4 Assessment list/detail screen, exact SHA, required evidence provenance, evidence freshness, run state and failure reasons.
- P1.5 Exercise webhook retry/out-of-order cases, artifact rejection, CI outage, and redacted logs.

**Done when:** A real sample PR receives a versioned assessment populated by externally executed CI; the user can identify failures and missing evidence. New commits create new current assessments; import failure does not masquerade as PASS. Deployed service remains usable without runners, AI or model keys.

- **P1.RBAC:** Restrict CI evidence, assessments and findings to authorized repository members; validate worker context and artifact access.

- **P1.Contributors:** Capture GitHub contributor IDs, PR authors, reviewers and commit associations with signed-event provenance; show verified identities on PR/CI details. See [Contributors specification](../product/engineering-contributors.md).

- **P1.AI1:** Evidence-linked CI explanation through PR/CI route; log provider/model and cost; never alter deterministic gates.

- **P1.N1:** Deliver durable notification events/outbox, RBAC-aware recipients and a working in-app inbox for assessment activity; see [Notification Engine](../product/notification-engine.md).

### P2 — Policy Quality Gates

**User value:** A policy owner defines a simple standard and a developer sees an accurate advisory or blocking GitHub quality check.

**Tasks:**
- P2.1 Versioned first-party policy pack composition and organization/repository/branch baselines: required vs advisory, applicability, severity, allowed evidence source, effective-policy preview and authorized overrides.
- P2.2 Deterministic evaluator returning PASS/WARN/BLOCK/INCOMPLETE/NOT_APPLICABLE with reason codes.
- P2.3 Publish check/status for **exact** SHA; advisory rollout default, explicit authorized blocking activation.
- P2.4 Policy UI, readiness report, failed/missing evidence explanation, audit of changes; show template version diffs and require explicit approval before upgrading enforced policy versions.
- P2.5 Test stale commits, skipped required tests, unsupported check, and required test failed; ensure each reports correct result.

**Done when:** A deliberately broken PR is blocked by an activated required check, a clean PR passes, a missing required check is INCOMPLETE, and a changed PR never inherits the prior commit's green status. Existing P0/P1 remains functional.

- **P2.RBAC:** Separate policy drafting, publication, enforcement and exception approval permissions; reject self-approval.

- **P2.Contributors:** Attribute deterministic gate outcomes and evidence completeness to PR authors and revisions, with first-pass and final assessment status; do not conflate missing evidence with compliance.

- **P2.R1–R5 — GitHub Ruleset Management:** read organization rulesets; Standard/Strict/Custom safe-default wizard; publish and preflight stable Preflyt PR check; authorized diff/approval/deploy; sync, drift and rollback. Each increment independently usable; never require a check before publishing is verified. See [GitHub Ruleset Management](../product/github-ruleset-management.md).

- **P2.R5 Insights:** Extend ruleset synchronization with GitHub Rule Suites ingestion, ruleset-ID-based detailed evaluation attribution, metrics/charts, filtered history and evidence drill-down. Separate GitHub evaluations from Preflyt gate outcomes; enforce RBAC and rate-limit-aware pagination. See [Ruleset Management](../product/github-ruleset-management.md).

- **P2.N1:** Notify blocked/incomplete PRs, policy/ruleset changes and exceptions through in-app and configured email delivery with retry/audit.

### P3 — Native Secure Validation

**User value:** Preflyt can perform useful code/security/IaC validation itself, rather than depending exclusively on existing CI.

**Tasks:**
- P3.1 Approved isolated executor with non-root, no privileged/container socket/host access, quotas, short-lived jobs, default-deny egress, no platform/model/Git-write credentials.
- P3.2 Independently test effective sandbox isolation and prohibit all real-repository tasks until the approved stronger runtime passes review; retain INGEST_ONLY mode.
- P3.3 Pin repository SHA, tool/container digest, command, environment, outcome and evidence hashes; add artifact collection/reconciliation.
- P3.4 Integrate first tested security (secrets/SCA/SAST), test/lint and Terraform/Kubernetes policy adapters; handle tool license restrictions.
- P3.5 Add UI toggle to select imported vs run checks and distinguish evidence sources; display blocked executor explicitly.

**Done when:** A seeded vulnerability, failing test and unsafe IaC config are caught on pinned repos in an approved sandbox and affect the P2 gate; no untrusted job runs if approval/egress/security preflight fails. An ingest-only installation remains usable.

- **P3.RBAC:** Enforce separate execution admission and least-privilege worker identities; repository access alone never authorizes unsafe execution.

- **P3.Contributors:** Deliver a functional **Contributors** sidebar entry with searchable/paginated contributor list, activity/coverage/adherence metrics, charts, repository filters and individual detail pages (PRs, commits, reviews, findings, policy evidence). Include RBAC and source drill-down; see [Contributors specification](../product/engineering-contributors.md).

### P4 — Advanced AI Engineering Intelligence

**User value:** A developer sees an evidence-linked explanation and recommended action for an assessment finding.

**Tasks:**
- P4.1 LiteLLM container and approved hosted/local model configuration; secret encryption, per-organization egress rules and budgets.
- P4.2 TypeScript read-only intelligence worker with structured responses, evidence references and observed-vs-inferred labels.
- P4.3 Optional UI “Explain findings” action, latency/cost telemetry, cancellation, safety/redaction filters.
- P4.4 Negative tests for prompt injection, policy override claims, credential leakage, hallucinated results and provider outage.

**Done when:** A security finding has a traceable explanation and recommended remediation, but the exact deterministic quality gate **never changes** when AI is enabled, disabled or malicious. All P0–P3 workflows work without model keys.

- **P4.RBAC:** Restrict AI provider credentials, model routing, usage visibility and data-egress policy to authorized roles.

### P5 — Developer Experience: CLI and IDE Extension

**Incremental release contract:** P5.1 shared local engine and installable CLI; P5.2 authenticated repository link and cached policy; P5.3 installable VS Code extension with inline diagnostics; P5.4 AI explanation and revision-bound PR gate visibility; P5.5 opt-in Git hooks and tested compatible editors. Each is independently usable and deployable. See [developer CLI and IDE specification](../product/developer-cli-ide-extension.md).


**User value:** A developer runs fast local checks and gets actionable feedback before pushing code.

**Tasks:**
- P5.1 Ship signed/reproducible Node.js/TypeScript CLI package with documented install/update/remove.
- P5.2 Local fast lint/typecheck/secret/dependency checks on a working tree, per-tool scope and execution consent.
- P5.3 Cache approved repository policy and show cache freshness; add explicit opt-in pre-commit integration.
- P5.4 Present local findings with file/line; optionally submit redacted evidence or ask for AI explanation with consent.
- P5.5 Tests for offline mode, dirty tree, missing tools, revoked identity, policy cache age and safe uninstall.

**Done when:** Developers can install and run the CLI locally, discover a seeded issue without pushing to CI, and work without a model key. Local PASS is labeled **advisory**, never a trusted CI green result.

### P6 — QA Release Readiness

**User value:** QA can evaluate a real release candidate using traceable functional test and compatibility evidence.

**Tasks:**
- P6.1 Release candidate/environment identity, deployment SHA/image, test-suite inventory and QA evidence import.
- P6.2 Unit/integration/E2E/regression/contract test adapters and correct discovered/executed/skipped counts.
- P6.3 Database migration/API compatibility check templates using isolated test environments and fixtures.
- P6.4 QA readiness policy and optional authorized sign-off, report and audit.
- P6.5 Test missing mandatory suites, zero tests, failed contract, stale candidate and manually approved exception.

**Done when:** QA can select a candidate, see required suites and contract findings, and make an evidence-backed pass/block/incomplete decision without depending on AI or P7+ capabilities.

### P7 — k6 Performance Evidence and Budgets

**User value:** A team already running k6 in CI can import a run and receive a performance assessment/gate, **without** Preflyt running load.

**Tasks:**
- P7.1 Performance target/profile metadata (approved environment, service/revision, workload identity).
- P7.2 k6 summary/threshold parser with tool-version, script/config digest and artifact provenance.
- P7.3 Performance budget policy (latency percentiles, error rate, throughput/iterations, dropped iterations).
- P7.4 First comparable baseline record and clear INCOMPARABLE/INCOMPLETE cases; performance report in UI.
- P7.5 Test missing metrics, absent threshold, underachieved load, mismatched revisions and invalid artifact.

**Done when:** One existing k6 report can be imported and compared to a configured budget, producing a defensible quality-gate result. No execution permissions or Operator are needed.

### P8 — Managed k6 Smoke and Load

**User value:** An authorized engineer can configure and execute a controlled smoke/load test against a registered non-production target.

**Tasks:**
- P8.1 Target service/environment registry, ownership verification, scoped test auth and script versioning.
- P8.2 Performance profiles, VUs/arrival-rate settings, duration/ramp and threshold setup in UI.
- P8.3 k6 runner adapter on approved isolated runtime with resource quotas, egress restrictions, non-production target allowlist, cost controls and cancellation.
- P8.4 Test lifecycle and live progress, results, artifacts, operator audit, error/timeout states.
- P8.5 Verify no arbitrary URLs, SSRF redirects/DNS pivots, credentials in scripts/logs, unbounded request rates or load-generator saturation marked falsely as app regression.

**Done when:** A user runs a smoke and a bounded load test on an approved staging service, sees achieved VUs/iterations/RPS/latency/errors and a budget gate, and can cancel safely. P7 imported-run functionality remains available.

### P9 — Advanced Performance Testing

**User value:** Performance engineers can execute and compare stress, spike, soak, breakpoint and scalability workloads with safe automated stop conditions.

**Tasks:**
- P9.1 Add advanced workload profiles/stage shapes, recovery windows, stop-on-threshold and budget alerts.
- P9.2 Profile-specific approvals for higher-impact tests and dedicated runner pools/regions where needed.
- P9.3 Comparable multi-run baselines, runner-vs-target saturation detection, latency drift and test reproducibility.
- P9.4 Optional SigNoz/OpenTelemetry/Prometheus correlation and AI-assisted explanation with evidence links.
- P9.5 Safety tests for long soak cancellation, spike rate clamps, runaway breakpoint ramp, target outage and production default-deny.

**Done when:** One stress, spike and soak scenario each produces a safe, interpretable evidence-backed report and is cancelled/stopped under its policy. Production load tests remain prohibited without separate explicit operational approval.

### P10 — Production Evidence Feedback

**User value:** An SRE links a production incident to a released version and an earlier missing or failed engineering check, then proposes an improved PR/release policy.

**Tasks:**
- P10.1 Read-only incident/alert/telemetry or deployment evidence connector (start with one provider and one release mapping).
- P10.2 Correlate incident, service, deployment SHA/version, prior assessments and missing controls; distinguish hypothesis from proved cause.
- P10.3 Create a **policy improvement proposal**, separate from active policy enforcement.
- P10.4 Authorized owner review/approval, audited policy version change and later effectiveness reporting.
- P10.5 Validate with known incident fixture plus ambiguous and stale/insufficient evidence cases.

**Done when:** A real or fixture incident produces a sourced, reviewable prevention recommendation; an engineering owner can choose to apply it as a new policy, and Preflyt does not directly modify production or auto-remediate.

### P11 — Operational expansion

**User value:** Teams can onboard more systems and run validated broader engineering assessments without replacing existing installations.

**Tasks:**
- P11.1 GitLab adapter with repository/CI/check provider parity and scope-tested auth.
- P11.2 Scheduled baseline/drift assessments, historical quality coverage and trend reporting.
- P11.3 Distributed k6 Operator support (when justified), workload topology policy and runner health.
- P11.4 Broader cost/compliance/observability rules with domain-specific evidence and applicability.
- P11.5 Migration and scaling/reliability tests, concurrent organizations only after explicit tenant-isolation review.

**Done when:** At least one new provider/domain/scale workflow works end-to-end with documented compatibility and no regressions to already deployed stages. Optional sub-slices can be independently released rather than waiting for all P11 tasks.

## 4. Capability breakdown within each SDLC stage

These subphases map to the global deployment phases above and may be tracked as issue groups, **not separate undeployable feature branches**.

| Stage | Usable first slice | Second slice | Third slice | Advanced slice |
| --- | --- | --- | --- | --- |
| Laptop | P5.1 shared engine + CLI | P5.2 organization policy sync | P5.3 VS Code diagnostics; P5.4 AI and PR status | P5.5 Git hooks/editor compatibility |
| Repository | R1 discovery/profile (P0) | R2 baseline policies/evidence (P1–P3) | R3 scheduled drift (P11) | Cross-repo standards |
| PR/CI | P1 CI evidence viewer | P2 deterministic quality gate | P3 isolated scanner/test jobs | P4 AI explanation |
| QA | Q1 imported suite/candidate report (P6) | Q2 contract/migration tests (P6) | Q3 QA quality gates/sign-off (P6) | Cross-service matrix later |
| Performance | F1 import k6 reports (P7) | F2 smoke/load execution (P8) | F3 advanced workload profiles (P9) | F4 distributed/correlation (P11) |
| Production | O1 incidents/deploy mapping (P10) | O2 correlation to missed checks (P10) | O3 policy proposal and approval (P10) | Outcome trends later |

Built-in pack lifecycle: **P0 catalogue and recommendations → P1 evidence mapping → P2 deterministic enforcement → P3 native checks → P6–P9 specialized QA/performance packs → P10 owner-approved policy improvements**. See [Engineering Standards Library](../product/engineering-standards-library.md).

## Kubernetes packaging decision

**Preferred Kubernetes mode:** Helm installs Preflyt CRDs and the Preflyt Operator; a Preflyt custom resource causes the Operator to reconcile the application. Docker Compose remains the fully supported standalone path. P0 records the CRD/operator configuration and packaging design without delaying current implementation; P1–P3 add a usable minimal Operator as an independently tested Kubernetes deployment slice; later phases expand lifecycle support. Helm `--skip-crds` permits externally managed CRDs; packaged CRDs are not automatically upgraded/deleted. The direct application Helm chart is an optional fallback. See [ADR-0006](../architecture/ADR-0006-kubernetes-operator-deployment.md).

## 5. Definition of deployable and usable: mandatory phase checklist

A phase **cannot be marked complete** until all applicable entries below are satisfied.

- [ ] A user can complete the promised workflow end-to-end in a clean deployment, with sample evidence/output and documented limits.
- [ ] UI, API and worker workflows agree on statuses; there is no dead-end placeholder screen or unfinished dependency on a future phase.
- [ ] **Every release** has published versioned images, a working full-stack Docker Compose file, and documented root `.env.example` supporting standard OTLP environment variables. After configuring required secrets/endpoints, `docker compose up -d` boots all release-required services without host installs; migrations, health, persistence, startup order, upgrades and rollback are tested. Kubernetes/Helm remains an optional deployment target.
- [ ] Authentication, role scoping, secrets, event signatures, safe execution boundaries and target authorization relevant to this phase are validated.
- [ ] Provider outages, invalid evidence, unavailable executors and disabled AI **fail safely with useful messages**.
- [ ] Check/report semantics preserve exact revision and deterministic gate decisions, with INCOMPLETE for missing mandatory evidence.
- [ ] OpenTelemetry/operational logs, health checks, retry/idempotency and bounded timeouts are present for the implemented path.
- [ ] Basic smoke test runs post-deployment and verifies the user-facing capability; automated tests include one expected success and at least one failure/unauthorized path.
- [ ] Feature flags default disabled for features not yet supported; turning them on does not expose experimental unsafe execution.
- [ ] Upgrade preserves preceding phase data and functions. A tested rollback procedure and compatible DB migration path are documented.
- [ ] Operator setup, user instructions, security assumptions, release notes and known limitations are updated in the repo.
- [ ] Human review of deployment evidence and source PR occurs before merging; **no automatic PR merges or production deployments by Preflyt**.

**Task/issue template:** Title, stage, phase, user value, exact scope, dependencies, implementation tasks, contracts/API/UI affected, test fixtures, safety gates, end-to-end demonstration, deployment/rollback steps, acceptance evidence, exclusions. Split an issue if any subtask lacks a testable deliverable; avoid umbrella issues that silently contain multiple releases.

## 6. Phase dependencies and security gates

~~~mermaid
flowchart TD
    P0["P0 Repo Profile"] --> P1["P1 CI Evidence"]
    P1 --> P2["P2 Quality Gates"]
    P2 --> P3["P3 Safe Native Scans"]
    P3 --> P4["P4 Optional AI Explanations"]
    P3 --> P5["P5 CLI + IDE Extension"]
    P3 --> P6["P6 QA Readiness"]
    P2 --> P7["P7 Imported k6 Gates"]
    P7 --> P8["P8 Managed Smoke / Load"]
    P8 --> P9["P9 Advanced Performance"]
    P6 --> P10["P10 Production Feedback"]
    P2 --> P10
    P9 --> P11["P11 Provider / Scale Expansion"]
~~~

AI is a core product capability introduced in P0/P1; inference is optional at runtime, and deterministic checks remain functional without model access. P7 (import k6 results) can be prioritized soon after P2 because it needs **no managed load generator**. P8 requires separately verified target/runner safety; P3 real-repository execution approval is not bypassed by test infrastructure.

P0 deployment is intentionally useful without a scanner, model or extensive policy framework. All subsequent releases **add** capability without requiring a full platform rewrite.

## 7. Measurement by release

For each phase record: number of real users/repositories, successful end-to-end assessments, time to meaningful result, missing-evidence cases handled safely, false-positive reports, regression/escape defects where meaningful, operational errors, CPU/network/model expense, and user acceptance. **Passing a benchmark fixture is an acceptance condition, not proof of market value.**

The platform should demonstrate improvements at the earliest stage practical, while production telemetry remains a feedback mechanism feeding earlier standards.

## 8. Existing architectural decisions retained

- Node.js / TypeScript / React, NestJS, Prisma/PostgreSQL, BullMQ/Redis, LiteLLM as optional inference gateway.
- GitHub-first user authentication and role-scoped GitHub App identity per ADR-0007, with OIDC compatibility preserved during migration.
- Real-repository code execution requires independently approved isolation; evidence-only mode works without it.
- AI analysis is advisory. Coding-agent and automated remediation PRs are **not a prerequisite or default part of the core release plan**.
- All changes go through reviewable PRs and normal human merge controls.

See [ADR-0004](../architecture/ADR-0004-shift-left-assessment-governance.md) for the core assessment semantics and [SDLC capabilities](../product/sdlc-capabilities.md) for user-facing behaviours.
