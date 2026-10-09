# Preflyt incremental delivery plan: usable vertical slices

**Status:** Ordered delivery roadmap with explicit source-implementation notes. Only entries marked implemented describe current code; phase completion still requires its deployment and live acceptance gates.
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
- P0.2 Implement GitHub-first login, verified organization-owner onboarding, inherited organization identity and GitHub member selection per [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md). Current OIDC login/bootstrap and scoped RBAC remain operational during additive migration; GitHub login, verified owner onboarding, workspace linking and member grants are implemented behind the login flag; legacy identity merging, revocation events and reconciliation remain pending.
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
- **P0.AI3:** Working AI Intelligence → Models / Model routing interface with audit and route preview. Preserve already completed P0 functionality.

### P0 GitHub-first access update (partially implemented)

**Implemented:** GitHub login, verified owner onboarding, existing-workspace linking, member sync/grants and bounded provider-access checks. Existing OIDC/recovery Owner/Admin sessions can manage the linked directory through read-only App access; GitHub users retain their own credential/access verification.

**Remaining acceptance and migration work:** Deliver ADR-0007 within P0 access-control scope without adding/reordering phases. Preserve the implemented provider links, onboarding, directory and repository access intersection; complete legacy identity migration and provider revocation/reconciliation. Demonstrate renamed usernames, unassigned/non-member denial, owner-claim races, private-repository isolation, provider outage handling, OIDC migration and safe rollback before making GitHub login the default. This does not mark current P2 enforcement work complete.

### P0 Teams extension (additive; do not reopen completed P0)

- **P0.T1:** Create Preflyt teams and import selected GitHub teams with stable provider IDs, membership/repository-access snapshots, pagination and sync status.
- **P0.T2:** Keep imported GitHub repository access separate from administrator-approved team policy scope; no implicit RBAC grants or policy enforcement. See [Teams and Policy Inheritance](../product/teams-and-policy-inheritance.md).

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

- **P1.N1 (implemented, flag-gated):** Durable assessment events/outbox, Redis delivery, RBAC-aware recipients, unread bell, filtered in-app inbox, read state and assessment preferences; see [Notification Engine](../product/notification-engine.md).

- **P1.CQ:** Import and normalize revision-specific lint/typecheck/coverage and static-analysis evidence, with optional bounded read-only AI review using approved skills. See [Code Quality Review](../product/code-quality-review.md).

- **P1.Teams:** Show verified team associations and policy-source provenance in repository profiles and assessments.

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

- **P2.R1 first slice (implemented):** Quality Gates → GitHub Rulesets displays paginated repository rulesets and inherited parent rulesets, branch patterns and required-check sources using Metadata read. Organization-wide discovery and resolved effective branch protection remain pending; see [current limits](../operations/github-rulesets.md).

- **P2.R2 single-repository draft wizard (implemented):** Searchable branch selection, Standard/Strict/Custom profiles, server-generated configuration preview, paginated local drafts and scoped create/read/edit APIs. Saved standards versions and optimistic edit protection prevent stale saves. Broader organization/repository targeting and exclude patterns remain pending; local drafts stay disabled; activation is a separately approved deployment.

- **P2.R3 publisher foundation (implemented):** Manual reviewed non-passing readiness checks, exact-PR revision preflight, scoped Checks-write tokens, audited publication receipts, paginated history and bounded retry recovery. Published-policy evaluation and pinned attested execution contracts now support verified passing manual checks. Durable automatic publication and invalidation are implemented with repository controls. Live disposable-repository acceptance remains pending. See [publication setup](../operations/github-check-publication.md).

- **P2 private-repository proofs (implemented):** Organization-key verification supports pinned asymmetric public keys and exact report/repository/SHA/workflow/run identity without Enterprise-native attestations. The KMS signing helper and production trust-boundary setup are documented; signer deployment and live enforcement acceptance remain pending. See [private report setup](../operations/organization-signed-ci-reports.md).

- **P2.R4 single-repository activation (implemented):** Independent approval, exact branches, source App binding, current passing canary, PR impact review, durable write recovery, read-back receipts, drift verification and rollback of only the managed ruleset. Deployment flags default off; live passing/failing/incomplete enforcement acceptance is still pending.

- **P2.R1–R5 — GitHub Ruleset Management:** read organization rulesets; Standard/Strict/Custom safe-default wizard; publish and preflight stable Preflyt PR check; authorized diff/approval/deploy; sync, drift and rollback. Each increment independently usable; never require a check before publishing is verified. See [GitHub Ruleset Management](../product/github-ruleset-management.md).

- **P2.R5 Insights (first slice implemented):** Repository-scoped, paginated GitHub suite detail attribution, filtered history, current-page rule counts and failed-rule chart are available in the ruleset drawer. Active/evaluate/bypass semantics and repository permissions remain separate. Retained snapshots, bounded worker ingestion, freshness/retention controls and a saved-history selector are implemented behind a default-off flag. Broader trend/comparison views and exact assessment links remain pending. Extend ruleset synchronization with GitHub Rule Suites ingestion, ruleset-ID-based detailed evaluation attribution, metrics/charts, filtered history and evidence drill-down. Separate GitHub evaluations from Preflyt gate outcomes; enforce RBAC and rate-limit-aware pagination. See [Ruleset Management](../product/github-ruleset-management.md).

- **P2.N1 (partially implemented):** Policy publication, confirmed automatic blocked/incomplete PR checks, managed activation/rollback and detected drift notices are implemented, with opt-in SMTP, scoped recipient authorization, deduplication and delivery status/retries. Exception notices remain pending until the exception workflow is implemented. Scheduled read-only drift checks are implemented with live actor authorization, bounded polling, failure freshness and deduplicated audit/notifications.

- **P2.CQ:** Deliver a versioned Code Quality policy pack, deterministic check evaluation, and a reviewed skill catalogue/enablement workflow. AI findings remain advisory.

- **P2.Teams:** Support organization/team/repository policy assignments, approved team repository scope, deterministic effective-policy composition, conflict handling, preview, audit and enforcement impact. No silent weakening of inherited controls.

### P3 — Native Secure Validation

**User value:** Preflyt can perform useful code/security/IaC validation itself, rather than depending exclusively on existing CI.

**Tasks:**
- **P3 admission preflight (implemented, not execution):** A separately deployed TypeScript controller uses one signed observation protocol for operator-selected Kubernetes or Docker runtime preflight. API/worker imports have no runtime-control authority; Docker inspection stays in the dedicated process. Scoped assessment UI reports imported-only, missing review, changed controls and verified preflight. Native jobs default disabled; the reviewed Docker controller now supports opted-in dispatch. Live independent sandbox acceptance and complete adapter coverage are still required. See [Native execution](../operations/native-execution.md).
- P3.1 Approved isolated executor with non-root, no privileged/container socket/host access, quotas, short-lived jobs, default-deny egress, no platform/model/Git-write credentials.
- P3.2 Independently test effective sandbox isolation and prohibit all real-repository tasks until the approved stronger runtime passes review; retain INGEST_ONLY mode.
- **P3 recorded-commit planning (implemented, not dispatch):** Scoped check-plan API/UI binds saved source SHA and standards to fixed scanner command contracts, deployment-reviewed image/config digests, bounded resources and report paths. Missing/expired tools and unsupported adapters remain blocked. Exact-commit source verification and durable request/cancellation records are implemented in the later increment below. Authenticated Docker source delivery, durable worker/controller dispatch and native gate evidence are implemented and fixture-tested; Kubernetes-native job dispatch is now implemented and simulated-lifecycle-tested; complete adapter and live deployment acceptance remain pending. Generated Docker scanner/test/IaC fixtures are now verified in the separate increment below.
- **P3 Docker fixture foundation (implemented, not production acceptance):** Pinned scanner wrapper images, private read-only source materialization, effective container-control checks, report bounds and cleanup ownership are verified with fifteen disposable fixtures: seeded secrets/JavaScript and Python SAST/lint/unsafe Terraform and Kubernetes/failing tests fail, clean fixtures pass and zero/skipped tests remain incomplete. Independent effective runtime approval, SCA database coverage, complete lint/security coverage, live Kubernetes acceptance and complete adapter acceptance remain outstanding; signed result ingestion and native policy evaluation are implemented and fixture-tested and are connected to reviewed Docker execution behind explicit opt-in. See [runner verification](../deployment/native-runner/README.md).
- P3.3 Pin repository SHA, tool/container digest, command, environment, outcome and evidence hashes; add artifact collection/reconciliation.
- P3.4 Integrate first tested security (secrets/SCA/SAST), test/lint and Terraform/Kubernetes policy adapters; handle tool license restrictions.
- P3.5 Add UI toggle to select imported vs run checks and distinguish evidence sources; display blocked executor explicitly.

**Done when:** A seeded vulnerability, failing test and unsafe IaC config are caught on pinned repos in an approved sandbox and affect the P2 gate; no untrusted job runs if approval/egress/security preflight fails. An ingest-only installation remains usable.

- **P3.RBAC:** Enforce separate execution admission and least-privilege worker identities; repository access alone never authorizes unsafe execution.

- **P3.Contributors:** Deliver a functional **Contributors** sidebar entry with searchable/paginated contributor list, activity/coverage/adherence metrics, charts, repository filters and individual detail pages (PRs, commits, reviews, findings, policy evidence). Include RBAC and source drill-down; see [Contributors specification](../product/engineering-contributors.md).

- **P3.N1:** Notify authorized security owners of critical findings and assessment execution failures.

- **P3.CQ:** Integrate tested code-quality analyzers in the approved isolation boundary and correlate verified findings with skill-based review; do not execute untrusted skill scripts.

- **P3.Teams:** Deliver source-backed team engineering readiness and policy adherence reporting, scoped by RBAC and assessment coverage.

### P4 — Advanced AI Engineering Intelligence

**User value:** A developer sees an evidence-linked explanation and recommended action for an assessment finding.

**Tasks:**
- P4.1 LiteLLM container and approved hosted/local model configuration; secret encryption, per-organization egress rules and budgets.
- P4.2 TypeScript read-only intelligence worker with structured responses, evidence references and observed-vs-inferred labels.
- P4.3 Optional UI “Explain findings” action, latency/cost telemetry, cancellation, safety/redaction filters.
- P4.4 Negative tests for prompt injection, policy override claims, credential leakage, hallucinated results and provider outage.

**Done when:** A security finding has a traceable explanation and recommended remediation, but the exact deterministic quality gate **never changes** when AI is enabled, disabled or malicious. All P0–P3 workflows work without model keys.

- **P4.RBAC:** Restrict AI provider credentials, model routing, usage visibility and data-egress policy to authorized roles.

- **P4.CQ:** Multi-skill contextual PR review with pinned skill versions, evidence validation, deduplication, cost/egress controls and opt-in GitHub inline feedback. See [Skill-Based Review](../product/skill-based-code-review.md).

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

### P3 increment: verified source export and durable requests

Implemented exact-commit Git object verification with bounded credential-free bundles, scoped native request/cancellation APIs, atomic audit and idempotency, and a paginated assessment request interface. Supported required checks are preselected; optional checks remain explicit. Migration `20261010002000_native_execution_requests` is applied locally and Prisma regenerated. This earlier source/request increment recorded only BLOCKED attempts; the later Docker dispatch increment below adds reviewed opt-in execution. The later Docker/Kubernetes increments below implement source materialization, dispatcher leases/deadlines and cleanup. Effective independent sandbox and live end-to-end deployment acceptance remain pending. Signed native receipts, immutable assessment ingestion and native policy evaluation are implemented; generated scanner fixtures and receipt/database fixtures pass. See [native execution](../operations/native-execution.md). P3/P4 are not complete.

### User-requested standards authoring increment

Organization standards can now be created, copied from built-ins and edited through append-only versions. Owner/Admin management is separate from policy approval/enforcement. Repository selections freeze complete verified custom definitions; explicit adoption is required before a new library version affects policy drafts or assessments. Compact cards, filtered/paginated library, check drawer and version history are implemented. This increment composes existing check contracts; arbitrary new analyzers/commands and rule-threshold editing are not shipped. See [standards authoring](../product/engineering-standards-library.md).

### P3 native receipt-to-policy integration

Implemented the internal signed execution result sink and current policy evaluation for approved native evidence. Dedicated temporary-database fixtures cover immutable persistence, duplicate delivery, cancellation, membership/selection/attempt/lease revocation and full-policy PASS/BLOCK/INCOMPLETE outcomes. Raw scanner/source text is excluded from receipts. Newest live attempts supersede older receipts, and current runtime/tool reviews are rechecked before publication. Migration `20261010005000_native_execution_receipts` is verified in the disposable database; the local additive migration is applied after PostgreSQL recovery and a protected backup. Worker dispatch/controller admission are connected by the next increment; complete adapter coverage and independently reviewed live execution acceptance still remain. P3 is not yet fully accepted.

### P3 durable Docker dispatch increment

Connected explicit reviewed admission, authenticated exact-commit source delivery, bounded worker leases, immutable attempt IDs, a private durable controller journal, fixed Docker check execution, cancellation/restart cleanup, signed receipts and current policy gates. API and worker retain no Docker/Kubernetes runtime authority. Older preflight-only controllers cannot admit jobs; UI exposes readiness and polls active requests. Compose forwards required client configuration and defaults execution off; the same HTTP client works in the Kubernetes application deployment with a separate reviewed Docker controller. Tests cover the real controller HTTP protocol with generated-source fixture executors, isolated database queueing, source/plan/scope tampering, worker restart, membership revocation, simultaneous admission and unconfirmed cleanup.

Remaining P3 work is concrete: complete test/lint/SAST/SCA/IaC coverage, live Kubernetes acceptance, effective independent runtime acceptance and versioned release/end-to-end deployment evidence. Do not mark P3 complete or enable real-repository execution based solely on these fixtures. P4's advisory inference must remain independent of gate decisions.

### Kubernetes execution implementation (2026-10-09)

Implemented the opt-in Kubernetes launcher through the existing dedicated controller and durable request journal. Fixed Job/Pod/source contracts use a reviewed runtime class, credential-free sandbox identity, scheduling-gate admission, whole-source verification, shared bounded report parsing, current runtime/tool reviews and UID-scoped confirmed cleanup. Simulated API tests cover clean/failing results, injected sidecars/credentials/host mounts, wrong runtime/source/ownership, cancellation, ambiguous creation, review revocation and cleanup failure. Docker behavior remains covered by regression tests.

This is implementation evidence, not a live cluster release certificate. The initial serialized source delivery limit is 512 KiB. Independent runtime acceptance, full supported-project analyzer coverage/fresh offline dependency databases and versioned live deployment acceptance remain required for P3 completion. P4 implementation may proceed while those external acceptance gates stay explicitly recorded and real-repository execution remains disabled.

### P4 connection and routing increment (2026-10-09)

Implemented organization-scoped provider setup and model routing behind a default-off flag. Owner/Admin users create and approve models through AI Intelligence → Models / Model routing. Keys are authenticated-encrypted, write-only and bound to endpoint transport definitions. Connection tests send metadata only; revisions, organization scope, access revocation, response bounds, throttling and freshness are enforced. Source sharing and new connections/routes start disabled. Unit, UUID-disposable-database API and Chromium interaction tests verify these boundaries. See [AI configuration](../operations/ai-configuration.md).

This connection-only increment partially implemented P0.AI1/P4.1/P4.RBAC. Its initial unavailable-inference state is superseded by the review skills increment below. LiteLLM deployment, contextual PR review, actual billing telemetry and full P4 acceptance remain open.

The additive `20261010004000_ai_configuration` migration was applied locally after a protected database snapshot; the Prisma client was regenerated. No execution/provider flags were enabled and no real model requests or repository code were run by these tests.

### P4 admin model approval refinement (2026-10-09)

Models are created and approved directly by organization Owner/Admin users in **AI Intelligence → Models**. Removed the deployment endpoint allowlist; the admin form accepts a model endpoint, hosting type, model ID and encrypted key. Saving records a revision-bound approval audit. Approval and a successful connection test are separate: enabled routes still require tested connections, and source sharing stays off. Hosted DNS/address validation and connection pinning prevent unintended private/metadata access; explicitly self-hosted servers remain supported. The additive endpoint migration preserves existing records. Model outages and AI output have no gate authority.

Migration `20261010006000_admin_ai_models` was applied locally after a protected snapshot and the Prisma client regenerated. Verification passed: 59 API/transport tests, 8 Chromium tests, web/API type checks and focused UI lint. Generated HTTP fixtures and UUID disposable databases were used; no live model inference or connected repository execution occurred.

### P4 built-in provider defaults (2026-10-09)

AI Intelligence now offers inactive OpenAI (ChatGPT), Claude, Gemini and DeepSeek presets. Activation needs only the provider API model name and key; server-owned endpoints and native authentication reduce setup decisions. Custom OpenAI-compatible/self-hosted connections remain available. Activation and a successful metadata test are separate, with test freshness still required for enabled routing. No inference or repository source is sent on activation. Credentials retain organization/connection/transport binding, now including the preset protocol; legacy custom connections keep their existing binding. This change requires no database migration. P4 inference and acceptance items above remain open.

Verification: 68 API/transport tests and 9 Chromium UI tests passed, alongside web/API type checks and focused UI lint. Tests used metadata fixtures and UUID disposable databases; no live provider credentials, inference requests or application-data mutations were used.


### P4 review skills and assessment evidence runtime (2026-10-09)

Implemented organization-scoped immutable instruction-only skill versions, reviewed digest approval, separate activation, stage/repository assignment, first-party templates and paginated catalogue UI. Explicit saved-assessment review requests freeze approved skills, SHA/hash and model configuration, reserve estimated primary/fallback cost against stage/day budgets, and run through the existing worker. Native provider protocols, cancellation, access/configuration revalidation, deadline/restart recovery, strict known-check references and inferred suggestions are implemented. No source/diff/log text is sent, and no model result mutates deterministic gates. Docker and Kubernetes settings default off. See [review skills](../operations/review-skills.md).

This advances P4.2/P4.3/P4.4/P4.CQ but does not complete contextual PR review: diff/changed-line evidence, language-specific selection, third-party import, automatic dispatch, GitHub feedback, actual billing telemetry and LiteLLM remain open. Fixture verification uses UUID disposable databases and generated provider HTTP responses; it is not live provider acceptance.

Verification: 100 API/transport tests and 19 Chromium tests passed, alongside API/web type checks and focused UI lint. The local additive migration was applied after a protected snapshot; Prisma regenerated. Local explicit reviews are enabled; deployment examples stay disabled. No live model inference was requested.


### P4 AI review-to-skill assignment (2026-10-09)

Organization standards now support named advisory AI reviews with approved immutable skill pins. Check stages control repository/PR applicability; policy review freezes the assignment and assessment requests accept only assigned check IDs. Disabling or replacing a skill cannot silently change a saved check. Deterministic rules and gate decisions remain separate. The standard editor now uses a wide rectangle, separate check tabs, filtering/pagination and visible actions. Selecting a self-hosted model defaults to optional authentication. This increment needs no database migration; contextual source review remains pending.


### P4 Markdown review skill documents (2026-10-09)

Implemented a wide Markdown Write/Preview editor, bounded UTF-8 `SKILL.md` uploads that open editable drafts, and organization-authorized exact-version downloads with digest verification. Files cannot approve or enable skills, import packages or run commands. Saving changed content creates a new disabled version; published policies retain their existing skill pins. Repository scope and license/provenance requirements are validated before saving. No database migration is required. Contextual PR source review and third-party package/script execution remain outside this increment. See [Markdown workflow and format](../operations/review-skills.md#markdown-editor-and-skillmd).


### Teams, policy assignment and impact preview (2026-10-10)

Administration → Teams now supports local teams, read-only GitHub import/manual sync and explicitly approved repository policy scope. Version-pinned team assignments compose stronger requirements, preview conflicts and atomically create repository selections and existing policy drafts. Approval/publication, assessments and gates retain source pins and validate current scope. Organization baselines, automatic reconciliation, nested scope and upgrades remain pending; phase order is unchanged. See [Teams implementation and remaining scope](../product/teams-and-policy-inheritance.md#implemented-slice-2026-10-10).
