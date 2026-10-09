# Preflyt across the Software Development Lifecycle

**Status:** Target capabilities across six lifecycle stages. Repository profiling, imported PR/CI assessments and flag-gated GitHub governance are implemented in source; native execution, AI intelligence and later lifecycle stages remain unfinished. See [current capabilities](../../README.md) for deployment limits.
**Version:** 0.1 · **Date:** 2026-10-08  
**Positioning:** AI-native Shift Left engineering assessment and governance platform, **not a coding agent**  
**Related:** [PRD](../PRD.md) · [Incremental delivery plan](../roadmap/incremental-delivery.md) · [ADR-0004](../architecture/ADR-0004-shift-left-assessment-governance.md) · [ADR-0002](../architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md)

## 1. One platform across six SDLC stages

**Workflow:** Discover → Assess → Validate → Enforce → Improve.

All stages use the same **Assessment → CheckEvidence → Finding → PolicyEvaluation → EngineeringReadinessReport** contracts. The Validation Engine ingests/runs applicable checks, the Governance Engine determines policy and gate outcomes, and the optional Intelligence Engine explains findings. **AI cannot make a check pass, waive a rule, write code or deploy production.**

| Stage | Goal | Inputs | Product outputs | Initial target |
| --- | --- | --- | --- | --- |
| **Developer laptop** | Prevent defects before commit/push | Optional CLI / pre-commit / IDE | Fast local findings, policy feedback, suggestions | V1 |
| **Repository** | Establish engineering standards and baseline | Selected GitHub repo, schedules | Repository profile, baseline and missing-control findings | MVP |
| **PR / CI** | Prevent bad merges | PR head SHA, diff, CI check artifacts | Revision-bound assessment, policy quality gate, review feedback | MVP |
| **QA** | Validate functional correctness and compatibility | QA automation, contract tests, test reports | Release-candidate functional readiness | V1 |
| **Performance / staging** | Find regressions and resilience problems before production | Approved k6 profiles/runs and environment telemetry | Budgets, comparisons, reports, quality gates | V1 basic; V2 advanced |
| **Production feedback** | Convert escaped defects into earlier controls | Incidents, deployments, observability evidence | Proposed policy improvements, trend analysis | V2 |

**Outcomes:** PASS / WARN / BLOCK / INCOMPLETE / NOT_APPLICABLE, with evidence and versioned rules. Missing, skipped, stale, timed-out or untrusted **mandatory** evidence is INCOMPLETE, not PASS. A failed mandatory check under an enforced policy is BLOCK. Policy enforcement mode (advisory vs blocking) is distinct from evaluation result.

## 2. Developer laptop — before commit

**Planned experience:** shared local assessment engine powering an opt-in Preflyt CLI and VS Code extension in P5.1–P5.5, with pre-commit integration and additional editor compatibility delivered incrementally. See [developer CLI and IDE specification](developer-cli-ide-extension.md). Developers run deterministic fast checks on their working tree: lint/typecheck, changed-path unit tests, secret scanning, dependency manifests, Terraform/Kubernetes/Docker configuration, API/schema contracts and database migration patterns.

~~~text
preflyt check
Policy: backend-standard-v3 (cached)
✓ Typecheck
✓ Secrets
✗ Database migration: unsafe column drop
⚠ Changed API route lacks expected tests
Local status: 1 blocker, 1 warning
~~~

Local policy sync, offline cached checks and optional consent-based AI explanations come incrementally. Tool execution occurs only by explicit developer action under their workstation permissions, **not** as a secretly privileged agent. A local pass is never presented as a trusted server-side CI gate; label policy-cache freshness and dirty working tree.

**Usable increments:** L1 basic CLI with local checks; L2 policy sync and repo-aware applicability; L3 expanded tests/IaC/migration checks and optional AI explanation.

## 3. Repository — baseline engineering posture

When onboarded, Preflyt inventories language/runtime, manifest/lockfiles, test tooling, existing CI, scanners, Dockerfiles, IaC, schema migrations, observability hints and supported ownership signals. It creates a **Repository Engineering Profile** and identifies unknown/unverified fields.

An authorized engineering owner applies versioned policy baselines. Preflyt reports required checks, imported evidence, unsupported checks, gaps (e.g. secret scanning absent), and compliance with defined engineering standards. Later scheduled reassessments detect changes in dependencies or engineering policy coverage, independently of code merges.

**Usable increments:** R1 connect/discover/display the profile; R2 baseline control coverage and policies; R3 scheduled posture rechecks and drift trends.

## 4. Pull request / CI — primary MVP gate

~~~mermaid
flowchart TD
  PR["GitHub PR / CI event"] --> PIN["Pin commit and relevant base"]
  PIN --> PLAN["Repository profile + changed-path assessment plan"]
  PLAN --> EV["External CI evidence OR approved isolated validators"]
  EV --> FIND["Normalized findings and provenance"]
  FIND --> POLICY["Deterministic engineering governance"]
  FIND --> AI["Optional advisory AI analysis"]
  POLICY --> REPORT["Readiness report"]
  AI --> REPORT
  REPORT --> GH["Exact-commit GitHub check + dashboard"]
~~~

Initial areas: SAST/SCA/secrets, required lint/typecheck and unit/integration checks, container/IaC security and applicable organization rules. All check evidence records source, SHA, timestamps, tool version, artifact digest, outcome, freshness and whether it was imported or executed.

The gate reports named reasons and developer actions; a new PR head SHA requires new readiness. Default to advisory rollout until authorized blocking policy is enabled. AI may describe likely root causes but cannot override scan, test, policy or authorization decisions.

**Usable increments:** P1 import CI and show revision-bound assessment; P2 versioned policy and SCM gate; P3 additional scanners/tests through approved sandbox and optional explanations.

## 5. QA — before release approval

Preflyt works with existing QA frameworks rather than replacing QA tooling. Ingest or orchestrate evidence from unit, integration, E2E, API contract, regression, smoke and error-path tests; record suite/version, tests discovered/executed, passes/failures/skips, release-candidate app image/git SHA, environment, artifact integrity and provenance.

Add contract compatibility (provider/consumer) and database expand-contract migration tests. A missing mandatory suite or zero discovered tests produces INCOMPLETE; a required failure produces BLOCK. Human QA sign-off is an auditable independent approval, not generated by AI.

**Usable increments:** Q1 evidence import and candidate report; Q2 contract/migration checks; Q3 QA release gates and explicit sign-off.

## 6. Performance / staging — non-functional prevention

Use **self-hosted Grafana k6** as the workload generator. Preflyt provides scenario/profile management, approved target execution, versioned budgets, baseline comparison, quality gates, optional telemetry correlation and reports. It does **not** implement its own load-testing engine.

| Test type | Intended validation |
| --- | --- |
| **Smoke** | Low-impact script and target behaviour |
| **Load** | Expected sustained/peak traffic |
| **Stress** | Controlled overload and degradation |
| **Spike** | Sudden surges and recovery |
| **Soak/endurance** | Long-running leaks and resource exhaustion |
| **Breakpoint** | First bounded failing capacity/SLO threshold |
| **Scalability** | Capacity and throughput per resource/replica level |
| **Regression** | Comparable candidate vs approved baseline |

**User journey:** Repository → Performance → Profiles / Runs / Baselines / Reports. Select an approved target environment; script digest, scenario, VUs or iteration arrival rate, duration, test data and stop conditions; threshold policy and comparison baseline. Capture **achieved** load and request/iteration rates, latency percentiles, error rate, k6 checks, dropped iterations, runner health, execution environment and exact release SHA.

Use dedicated load generators. A virtual user does **not** equal one request per second. A regression requires comparable scenario, test dataset, hardware/resource allocation, application revision, load-generator setup and other relevant dimensions; otherwise label INCOMPARABLE/INCOMPLETE.

**Safety:** explicitly registered target ownership, egress/redirect/DNS restrictions, no arbitrary URL load generation, VU/rate/concurrency/duration/spend caps, stop/cancel controls. Production defaults to limited approved synthetic checks; high-impact stress/spike/breakpoint/soak requires separately authorized operational controls. Do not execute real destructive transactions without fixtures and permission. Treat untrusted k6 scripts as code and use an approved safe executor for real repositories.

k6 supports Docker execution and a separately assessed Kubernetes/k6 Operator adapter; the latter is a scale-up option, not a mandatory MVP dependency. k6 thresholds determine gates, while SigNoz/OpenTelemetry/Prometheus correlations can help explain bottlenecks without becoming the decision authority.

**Usable increments:** F1 import existing k6 evidence with budget gates; F2 managed smoke/load on approved targets; F3 stress/spike/soak/breakpoint with safety policies; F4 distributed runs, comparability and telemetry analysis.

## 7. Production — shift-right evidence feeding earlier controls

Production monitoring is a **feedback source**, not an invitation to turn Preflyt into another APM tool, incident responder or autonomous production fixer.

Read-only integrations may collect release/version metadata, incident records and authorized observability evidence (OpenTelemetry/SigNoz, Sentry, Prometheus/Grafana where supported). Correlate escaped defects to revisions and missing earlier tests or policy coverage. Recommend a new or modified rule for SRE/AppSec/engineering-owner approval.

Example: deployment 502s correlated with missing connection-draining tests → suggest a mandatory shutdown/readiness integration test in future PR gates. A recommendation is not automatically a proven root cause; retain provenance and approval history.

**Usable increments:** O1 incident + release context; O2 correlate production evidence to earlier assessment gaps; O3 propose owner-approved policy improvements and measure recurrence.

## 8. Shared stage contracts and authorization

- **Subject:** stable org/repo, lifecycle stage, trigger, revision/ref or release/deployment, target environment, policy version.
- **AssessmentPlan:** selected checks, applicability, mandatory/advisory classification, allowed evidence source and execution mode.
- **Evidence:** timestamps, source/provenance, SHA/artifact hashes, tool and environment, observed outcome, freshness.
- **Readiness:** normalized findings, deterministic rule explanations, PASS/WARN/BLOCK/INCOMPLETE, advisory-vs-blocking enforcement and report links.
- **AI:** optional, read-only, provider/data-egress policy controlled; always separate from deterministic rule decisions.
- **Safe execution:** **all** Preflyt-run scanner/test/install/build/k6-script jobs against real untrusted repository content need independently approved isolation under ADR-0002. Missing safe executor -> import CI evidence only, and report required missing checks as INCOMPLETE; no unsafe fallback. Local user-initiated CLI checks are explicitly not server-side trusted CI evidence.
- **Revision correctness:** old results cannot silently mark new source commits/releases as ready.

## 9. Metrics and acceptance

| Stage | Measure |
| --- | --- |
| Laptop | Local check adoption, fast feedback, locally detected defects |
| Repository | Connected profiles, policy coverage, missing-control trend |
| PR/CI | Assessment coverage, gate accuracy, missing evidence, escaped defects |
| QA | Required-suite evidence, contract/migration issues caught before release |
| Performance | Valid workload completion, comparable regressions, budget adherence, test cost |
| Production | Evidence-linked escaped-defect reports, approved improvements and recurrence trends |

Acceptance conditions: stage and exact revision are visible on all reports; missing mandatory evidence never passes; AI-disabled checks work; safe executor is required for real repository jobs; local CLI does not impersonate CI; performance results show actual achieved load and comparability; production evidence cannot silently change engineering policy; no stage depends on a coding agent.

**Delivery requirement:** every stage increment must be usable, deployable, have an end-to-end acceptance test and a rollback path. See the [incremental release and task breakdown](../roadmap/incremental-delivery.md).
