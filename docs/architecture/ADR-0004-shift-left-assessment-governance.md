# ADR-0004: Shift Left assessment and governance architecture

**Status:** Accepted product direction; implementation pending  
**Date:** 2026-10-08  
**Decision owner:** Preflyt Product / Engineering  
**Supersedes:** Remediation-first prioritization in the original product definition (not the safety rules in ADR-0002)  
**Related:** [Product requirements](../PRD.md), [TypeScript stack](ADR-0001-typescript-first-stack.md), [Execution safety and optional remediation](ADR-0002-safe-execution-fixtures-remediation-contract.md), [OIDC authentication](ADR-0003-oidc-user-authentication.md)

## Context

Preflyt was initially described as a Shift Left platform but scoped around autonomous CI investigation and fix PRs. That framing confused a **coding-agent workflow** with the wider engineering practice of preventing defects and reducing risk earlier across requirements, design, development, pull requests, continuous integration and pre-production.

Preflyt is **not a coding agent**. Coding remediation may be enabled in a separately authorized future capability; it must not define the platform's core architecture, UI, or MVP success criteria.

## Decision

Preflyt is an **AI-native Shift Left engineering platform** with three product engines:

1. **Engineering Validation Engine:** selects and runs applicable deterministic checks, or ingests trusted external evidence, across code, security, tests, infrastructure, databases, reliability, performance, observability, compliance and cost.
2. **Engineering Governance Engine:** manages versioned standards, applicability rules, policy evaluations, quality gates, waivers and auditable approvals. Deterministic policy decisions—not LLM opinions—control enforcement.
3. **Engineering Intelligence Engine:** uses optional AI assessment workers to correlate evidence, explain engineering impact, triage/investigate findings, identify missing evidence and recommend improvements. AI does **not** grant quality-gate passes, waive required checks or need permission to modify source code.

**Primary entity:** an *Assessment* of a defined subject (design artifact, proposed change, commit/PR, repository baseline, deployment candidate) at a specific lifecycle stage and revision.

**Primary output:** a versioned, evidence-backed *Engineering Readiness Report* and associated quality-gate decision, not a generated patch.

## Lifecycle coverage

| Stage | Illustrative evidence | Initial direction |
| --- | --- | --- |
| Requirements and design | Architecture decision, API contract, requirements checklist, threat-model artifacts | Templates, checklists, and AI advisory review when artifacts are provided; advanced automatic design interpretation deferred |
| Local development | Lint/typecheck/unit tests, dependency and secret scans | CLI/pre-commit adapter is a planned later extension; use existing developer tools in MVP |
| Pull request | Diff, dependency manifests, IaC plans, CI status, test reports | **MVP primary trigger**: applicable checks, normalized findings, engineering gate, feedback |
| Continuous integration | Test results, SAST/SCA/secrets/IaC output, optional isolated scans | **MVP primary trigger**: ingest or execute approved jobs, evaluate policies |
| Pre-production/release candidate | Integration/performance evidence, migration compatibility, release configuration, smoke test records | Add progressively in V1 with explicit evidence requirements; do not claim predictive guarantees |
| Production feedback | Incident and escape defect records, run telemetry, change-failure signals | Feed policies and validation improvements, not substitute for early controls |

No single check is universally applicable. Assessment *plans* depend on repository characteristics, touched paths, changed capabilities, organization standards and stage context.

The [six-stage SDLC capability model](../product/sdlc-capabilities.md) distinguishes **developer laptop, repository, PR/CI, QA, performance/staging, and production-feedback** use cases, alongside optional requirements/design checks. Production integration is **feedback into earlier assurance**, not a production auto-remediation or APM platform.

**Delivery rule:** each phase must produce a **deployable and usable** product slice, not only an architecture component. The [P0–P11 incremental delivery plan](../roadmap/incremental-delivery.md) is the implementation release contract. Later stages must extend a common Assessment/Policy/Evidence model without blocking earlier useful releases.

## Assessment model

**State machine:** REQUESTED -> PLANNED -> COLLECTING -> EVALUATING -> COMPLETED / INCONCLUSIVE / FAILED / CANCELLED.

**Engineering quality-gate result:** PASS / WARN / BLOCK / INCOMPLETE / NOT_APPLICABLE.

- **PASS:** all required applicable checks have trustworthy passing evidence and no blocking policy findings.
- **WARN:** only warnings remain; mandatory evidence is complete.
- **BLOCK:** confirmed policy violation or failed required check.
- **INCOMPLETE:** required check missing, skipped, invalid, timed out, untrusted, or inaccessible; **never** counted as PASS.
- **NOT_APPLICABLE:** only when applicability was determined under a versioned deterministic rule, with reason.
- **AI uncertainty:** stored separately from check status; a model's confidence or recommendation never overrides policy.

The admission/enforcement choice (advisory vs blocking) is an explicit versioned policy per organization/repository/branch or stage. A PASS assessment does not authorize merging; branch protection and human review continue to apply.

### Core versioned contracts

- **AssessmentRequest:** organization/repository, subject kind, exact revision/PR and base context, trigger (manual/webhook/CI), lifecycle stage, requested profile, actor.
- **RepositoryProfile:** languages, manifests, existing CI/scanners, tests, deployment/IaC, frameworks, migration systems, declared services; report evidence and unknowns.
- **AssessmentPlan:** matched policy version, selected checks, applicability reasons, execution mode (imported CI or isolated job), mandatory/advisory classification, limits.
- **CheckEvidence:** check identity/version, commit/ref, input hashes, source/provenance, execution environment and tooling versions where run by Preflyt, actual result, timestamps, artifact hash and immutable pointer, coverage/freshness/verification status.
- **Finding:** unique fingerprint, check reference, severity, category, file/line or asset, evidence, observed vs inferred status, remediation guidance, occurrence history.
- **PolicyEvaluation:** deterministic ruleset version, input evidence digests, explicit decisions/reasons, evaluated-at revision, exception/waiver ID and expiry if applicable.
- **ReadinessReport:** fixed subject revision + policy version, checks planned/observed, required evidence coverage, findings, gate result, AI explanation clearly separated, audit references, freshness and source-control status.

All external data (CI logs, comments, repository files) is **untrusted input**. Imported evidence provenance and freshness must be labeled; Preflyt-executed checks are distinct. Reports are historical snapshots: when source changes, a new assessment is required to claim current readiness.

### Example report (illustrative, not a shipped API)

~~~json
{
  "contract_version": "1.0",
  "assessment_id": "assess-example",
  "subject": {"repository_id": "repo-123", "kind": "pull_request", "pr": 184, "head_sha": "PINNED_COMMIT_SHA"},
  "stage": "pull_request",
  "policy_version": "baseline-v1",
  "checks": [
    {"id": "secret_scan", "required": true, "status": "pass", "provenance": "preflyt_sandbox"},
    {"id": "unit_tests", "required": true, "status": "pass", "provenance": "external_ci"},
    {"id": "iac_security", "required": false, "status": "not_applicable", "reason": "no_iac_changes"}
  ],
  "findings": [{"category": "reliability", "severity": "high", "source": "declared_shutdown_test", "evidence_ref": "artifact://report/shutdown"}],
  "gate": {"result": "block", "reason": "required_reliability_check_failed"},
  "ai_advice": {"enabled": true, "authority": "advisory"},
  "freshness": {"status": "current_at_observed_revision"}
}
~~~

The illustration omits full required production evidence hashes and validation fields; the production schema must validate them.

## Architecture and process boundaries

~~~mermaid
flowchart TD
  DEV["Developers / GitHub / GitLab / CI / manual"] --> EVENT["Event and integration gateway"]
  EVENT --> PROFILE["Repository profile + assessment planner"]
  PROFILE --> POLICY["Versioned governance rules"]
  PROFILE --> JOBS["Redis / BullMQ work dispatch"]
  JOBS --> EVIDENCE["Imported CI evidence or approved isolated validators"]
  EVIDENCE --> NORMAL["Normalization and provenance store"]
  NORMAL --> GOVERN["Deterministic policy evaluator"]
  NORMAL --> AI["Optional TypeScript AI assessment worker"]
  AI --> GATEWAY["LiteLLM / private or frontier inference"]
  GOVERN --> REPORT["Readiness report + source-control quality gate"]
  AI --> REPORT
  REPORT --> FEEDBACK["PR / dashboard / CI feedback"]
  REPORT --> HISTORY["Audit and trend analysis"]
~~~

**Technology choices remain those in ADR-0001:** Node.js + TypeScript, NestJS, React/Vite, PostgreSQL/Prisma, Redis/BullMQ, LiteLLM, Docker Compose and Kubernetes, OpenTelemetry. No new mandatory agent framework is required to build an MVP assessment.

**Execution controls remain those in ADR-0002:** every real-repository scanner, dependency installation, test, build, or command executed by Preflyt needs the approved MVP isolation boundary. If isolation is unavailable, do not execute repository code; import supported external CI evidence instead and mark missing mandatory checks INCOMPLETE. A read-only assessment does not mean repository code execution is safe.

**Identity controls remain those in ADR-0003:** authenticated users, role-based authorization, and scoped GitHub installation permissions; write access is limited to authorized status/check reporting, not code modification.

## Validation domains and checks

| Domain | Check categories | Evidence approach |
| --- | --- | --- |
| Security | SAST, SCA, secrets, containers, API contracts, IaC posture | Semgrep CE/Trivy/Gitleaks/Checkov or imported CI output; license review |
| Software quality & testing | lint/typecheck, unit/integration/contract tests, changed-path requirements, regression | Project CI/tests and versioned schemas |
| Reliability | shutdown/readiness, timeouts, retries, connection handling, resilience tests | Executable checks and deployment manifests; AI recommendations only when not verifiable |
| Infrastructure & cloud | Terraform validation/plan checks, Kubernetes policies, container configuration | Terraform/OpenTofu evidence, IaC scanners, policy-as-code |
| Database | destructive migration patterns, expand/contract checks, compatibility tests | Migration parser and approved test database jobs, not production DB credentials |
| Performance | latency regression against recorded baseline, benchmark trends, resource budgets | CI benchmarks (e.g. k6), comparable test environment and statistical caveats |
| Observability | presence of trace/log/metric instrumentation and health checks | Configuration/contract checks, telemetry assertions where testable |
| Compliance | organization-defined evidence obligations and security controls | Rules/controls with provenance and policy exceptions, not automatic certification |
| Cost | IaC estimated cost deltas and budgets | Validated plans / cost tools; estimates clearly labeled and nonbinding |

**MVP user-value slices:** P0 connects and profiles selected GitHub repositories; P1 imports CI evidence; P2 publishes an actual deterministic PR quality gate; P3 adds safe native scanners/testing in an independently approved executor. Each can be deployed and used without the later releases. AI explanation is an **optional P4 enhancement**, not a prerequisite.

Subsequent phases use the same planning/reporting contracts: P5 local developer CLI, P6 QA readiness, P7 k6 result ingestion/performance budgets, P8 managed k6 smoke/load, P9 advanced controlled stress/spike/soak/breakpoint/scalability, P10 production-feedback-based policy improvement and P11 optional provider/scaling extensions. Compare test results only where environment and workload are meaningfully comparable; gate impact is determined by recorded evidence and policy, not AI.

## Built-in engineering policy packs

The Engineering Governance Engine includes a **first-party versioned Engineering Standards Library**. Initial packs cover baseline, application security, backend, frontend and IaC; additional packs for APIs, databases, production readiness, performance and compliance expand in later phases. Packs are declarative, stage/repository aware and require explicit rule evidence and capability status. P0 supports catalogue/recommendations and policy selection, P1 evidence mapping, P2 deterministic quality gates, and P3 approved native checks. Unsupported or missing evidence never becomes PASS. Updates are pinned and owner-approved before changing enforcement. AI may recommend, but cannot activate or waive policy. See [Engineering Standards Library](../product/engineering-standards-library.md).

## Governance and quality gates

- Every rule declares **scope**, trigger/stage, applicability, data source, severity, mandatory/advisory, expiration/exception handling, and enforcement mode.
- Unavailable required evidence -> **INCOMPLETE**, not PASS. Fail-closed policies may block merging via a provider-required check; staged rollout should begin in advisory mode to avoid unintentionally disrupting teams.
- Source-control check is bound to exact commit SHA and report/policy version. New commits invalidate old readiness; late-arriving webhook events cannot overwrite current status.
- Waivers require named authorized approver, reason, expiry, and audit trail; AI cannot issue exceptions. Certain mandatory security boundaries cannot be waived by an engineering policy.
- AI is **optional and explanatory**. If inference is disabled/unavailable, deterministic validation and governance continue working; display AI analysis unavailable rather than blocking unrelated checks.
- Compliance and cost estimates must not be portrayed as legal assurances or exact billing predictions.
- Sandbox/job permissions must be distinct from permission to publish GitHub status/check results. General code-branch writes/remediation are not required.

## Relationship to earlier remediation design

ADR-0002 contains a substantial **fixture-only PoC and future remediation-contract specification**. Keep its security and reproducibility controls available for a separately prioritized optional module. They are **not prerequisites** for the assessment platform's MVP, except its **MVP sandbox isolation requirements**.

Accordingly:

- Remove general automated remediation PR creation from Preflyt's core MVP and V1 success criteria.
- Do not represent coding agents, code generation or fix PRs as Preflyt's principal user journey or differentiator.
- No new PoC with fixture-only remediation is needed to prove the assessment MVP; if such an experiment is authorized later, ADR-0002 remains its governing security boundary.
- The assessment platform can recommend a change without editing source code.
- Future remediation integration must remain optional, independently authorized, and separately validated.

## Phase-level operability and usability

Every increment must include a working end-to-end user workflow, named trigger and target, minimal UI/API/persistence/worker path, documented installation/upgrade, safe default configuration, audit/telemetry, expected success and failure tests, operator rollback and backward compatibility. **A foundation-only deployment is not a complete phase.**

The GitHub PR pipeline begins with imported evidence and does not wait for a sandbox; P3 enables native execution only after the mandatory ADR-0002 isolation approval. The k6 pathway starts with imported reports and budgets before Preflyt performs any load testing. Production evidence is read-only and requires human approval before policies change.

## Acceptance criteria for this decision

- [ ] A GitHub PR change is assessed against a versioned ruleset with exact revision-bound, evidence-backed quality gate.
- [ ] A scan/test executed by Preflyt on real repository code is denied without the approved stronger isolation runtime.
- [ ] An existing CI result can be imported in ingest-only mode with provenance/freshness.
- [ ] Security, testing and infrastructure checks can be selected based on repository profile and changed paths.
- [ ] Unknown or skipped required check yields INCOMPLETE, never PASS.
- [ ] AI-disabled mode still produces a deterministic report and gate.
- [ ] AI output cannot mark a failing check passing, grant a waiver, or set the GitHub quality-gate decision.
- [ ] Report differentiates deterministic observations from AI advice.
- [ ] No code-writing GitHub permission is required to run the product's core flow.
- [ ] Reports and check runs are tied to an exact commit SHA and cannot be reused as current results after code changes.
- [ ] All six SDLC stages share typed assessment/evidence/policy contracts with stage-specific triggers, environment and evidence types.
- [ ] Every delivered phase is independently deployable/usable, has an end-to-end success case, a safe failure path and a tested rollback.
- [ ] The first deployable P0 delivers an actual connected-repository profile; it is not only service scaffolding.
- [ ] Imported k6 result assessment works before Preflyt-run load generation is enabled.
- [ ] Production telemetry cannot autonomously alter gate enforcement or deploy changes.

**Implementation status:** architecture decision only. This ADR does not claim any checks, control plane, UI, sandbox or source-control integration has shipped.
