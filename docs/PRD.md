# Preflyt — Product Requirements Document

**Product:** Preflyt  
**Positioning:** AI-native Shift Left engineering control plane  
**Tagline:** Engineering confidence before production  
**Owner:** Lyrisoft Technologies  
**Document status:** Draft for review  
**Version:** 0.1  
**Date:** 2026-10-08  
**Implementation status:** Not started; requirements are proposed, not statements of shipped functionality

---

## 1. Executive summary

Preflyt is a self-hosted engineering platform that detects, investigates, and helps remediate software quality, security, infrastructure, and reliability problems **before changes reach production**. It integrates with existing source-control and CI/CD systems rather than replacing them.

Preflyt collects deterministic evidence from tests, scanners, pull-request diffs, and CI failures. AI agents correlate that evidence, investigate likely causes, and—when authorized—reproduce failures and generate patches inside constrained execution sandboxes. The platform reruns relevant checks and opens remediation pull requests for **human review**, preserving a full audit record.

The initial product is an internal/self-hosted, single-organization platform supporting GitHub and TypeScript/Node.js and Python repositories. It uses open-source orchestration and scanning components, and offers **bring-your-own-model** inference through a configurable gateway: hosted frontier models via API keys or local inference. Docker Compose is the intended evaluation environment; Kubernetes is the production target.

**Product hypothesis:** Connecting detection to evidence-based AI investigation and verified, reviewable fixes will reduce engineer time spent diagnosing CI failures and remediating common defects without weakening security or change controls.

## 2. Problem statement

Engineering tools are fragmented. CI/CD systems identify failed steps; scanners identify suspicious code or dependencies; test frameworks report assertion failures. Developers and DevOps/SRE engineers must still gather context, reproduce defects, determine root causes, make fixes, and validate outcomes. Results are often scattered across PR comments, logs, chats, and incident reports.

Current gaps include:

1. **Disconnected signals:** a CI failure, a vulnerable dependency, and an IaC policy breach appear in different systems with little correlation.
2. **High investigation cost:** experienced engineers repeatedly sift through logs and repository history for routine failures.
3. **Late reliability checks:** shutdown handling, migrations, timeouts, and deployment safety are often discovered too late.
4. **Unverified AI suggestions:** conversational explanations and generated patches can appear convincing without a failing repro and passing regression checks.
5. **Inconsistent governance:** quality gates, model access, execution privileges, and developer approvals differ by repository.
6. **Weak organizational memory:** accepted fixes and known failure patterns are not systematically retained as reusable evidence.

Preflyt must close the gap between a detected engineering issue and a **validated, auditable remediation proposal**.

## 3. Goals, non-goals, and principles

### 3.1 Goals

| ID | Goal |
| --- | --- |
| G-01 | Reduce time from CI/scanner failure to an actionable, evidence-linked diagnosis. |
| G-02 | Make quality, security, and reliability checks available as early as PR and CI stages. |
| G-03 | Produce reproducible evidence before claiming that an AI-generated patch fixes an issue. |
| G-04 | Create developer-reviewable remediation PRs, never bypassing branch protection. |
| G-05 | Operate on customer-controlled infrastructure with optional external model inference. |
| G-06 | Centralize engineering policies, findings, investigations, and audit trails across repositories. |
| G-07 | Keep SCM, CI, model providers, scanners, and sandbox backends replaceable. |
| G-08 | Provide measurable effectiveness, latency, safety, and model-cost telemetry. |

### 3.2 Non-goals

- Replacing GitHub/GitLab, their CI systems, artifact registries, or an IDE.
- General-purpose agent access to production credentials or infrastructure.
- Autonomous merging, release approvals, or production deployments in MVP/V1.
- Guaranteeing security or correctness from an AI review or a passing test suite.
- Building a proprietary language compiler, SAST engine, or model from scratch.
- Predictive incident detection or full operational auto-remediation in MVP.
- Multi-tenant SaaS, on-prem air-gap guarantees, and regulatory certification in MVP.
- Running untrusted user repositories directly in privileged control-plane containers.

### 3.3 Principles

**Evidence before inference; least privilege; human-controlled delivery; reproducibility; fail closed; explainable outcomes; composability; privacy by configuration.** An agent's confidence statement must never substitute for a deterministic release policy.

## 4. Users and jobs to be done

| Persona | Jobs to be done | Main workflow |
| --- | --- | --- |
| Developer | Understand failing tests quickly; receive small, reviewable patches | Investigation → fix PR |
| Tech lead / reviewer | Assess root cause, evidence, risks, and patch quality | Findings / remediation review |
| Platform / DevOps engineer | Apply reusable standards across repositories | Integrations, repo profiles, workflows |
| SRE / reliability engineer | Shift startup, shutdown, retry, timeout, and compatibility risks earlier | Reliability findings and validations |
| Application security engineer | Prioritize scanner findings and review safe fixes | Security findings and policy exceptions |
| Engineering manager | Understand trends and time saved without misleading scoring | Overview, reports, audit |
| Organization administrator | Control users, model/API keys, repositories, and execution policy | Settings and access controls |

### 4.1 Primary user stories

- As a developer, when CI fails, I want a diagnosis linked to the exact failed job and relevant files.
- As a developer, I want the agent to distinguish a confirmed reproduction from a hypothesis.
- As a reviewer, I want to inspect the patch, test evidence, and commands run before approving any remediation.
- As a platform engineer, I want an organization-wide policy baseline with repository-specific overrides.
- As an administrator, I want to specify which models may receive source code, per-run cost caps, and retention rules.
- As a security engineer, I want secrets, destructive operations, and policy bypass attempts prevented independently of the AI model.

## 5. Scope and delivery stages

### 5.1 Proof of concept (technical validation)

Implement one end-to-end workflow on a controlled repository:

**GitHub failed check → collect evidence → investigate → reproduce in sandbox → patch → rerun tests → open a reviewable PR.**

Evaluate on intentionally broken fixtures and previously unseen, real failures. Prove access boundaries, timeout/cost termination, and repeatability before adding a broad UI.

### 5.2 MVP — Detect and explain

**In scope:**
- Single self-hosted organization; basic authentication and RBAC.
- GitHub installation or scoped integration; repository onboarding.
- Signed webhook ingestion and idempotent event tracking.
- Read-only retrieval of PR diff, CI checks, selected logs, and repository metadata.
- Repository profile for TypeScript/Node.js and Python.
- Existing test output ingestion plus configurable scanner runs (Trivy, Gitleaks, Semgrep CE); normalize and deduplicate findings.
- AI CI Failure Investigation Agent with evidence-linked diagnosis and uncertainty labels.
- Findings and investigation screens; audit and model-usage history.
- Organization/repository workflow enablement, basic model and privacy policy, execution budgets.
- Docker Compose evaluation path and a design validated for Kubernetes.

**Not yet in MVP:** autonomous write-back of patches, auto-created fix PRs, GitLab, specialized agent catalog, predictive risk scoring, enterprise SSO, custom visual workflow builder.

### 5.3 V1 — Validate and remediate

- Hardened ephemeral Kubernetes sandbox jobs; Docker sandbox option for controlled local evaluation.
- Agent code editing under repository/path/command scope.
- Failure reproduction, targeted validation, regression checks, bounded retries.
- Restricted Git write-back and remediation PR creation; never merge or approve.
- Independent deterministic quality gates and configurable policy enforcement.
- GitLab integration through a provider adapter.
- Reliability/IaC/database-migration validations where executable checks exist.
- More comprehensive permissions and workflow reporting.

### 5.4 V2 — Engineering intelligence

- Specialized security, reliability, database, infrastructure, test, and performance agents.
- Retrieval from approved prior investigations, accepted fixes, and incident documentation.
- Configurable multi-stage workflow templates, controlled escalations, and model routing.
- Cross-repository trend analysis, evidence-backed engineering health and recurring-failure patterns.
- Optional additional model runtimes, CI adapters, and organization deployment profiles.

V2 scope is directional and depends on measured MVP/V1 outcomes.

## 6. End-to-end product flows

### 6.1 CI failure investigation

~~~mermaid
sequenceDiagram
    participant Git as GitHub/CI
    participant Ingest as Webhook Gateway
    participant Ctrl as Preflyt Control Plane
    participant Job as Isolated Job
    participant AI as AI Investigator
    participant User as Developer

    Git->>Ingest: Signed failed-check event
    Ingest->>Ctrl: Validated, idempotent event
    Ctrl->>Git: Fetch check metadata and scoped logs
    Ctrl->>Ctrl: Create finding / investigation
    Ctrl->>Job: Run configured repro/check (when permitted)
    Job-->>Ctrl: Structured evidence and artifacts
    Ctrl->>AI: Evidence + approved context
    AI-->>Ctrl: Hypothesis, citations, next checks
    Ctrl->>User: Investigation report
~~~

### 6.2 Remediation workflow (V1)

~~~mermaid
flowchart TD
    A["Finding / failed CI run"] --> B["Policy and permission check"]
    B --> C["Collect and redact context"]
    C --> D["Isolated repro job"]
    D --> E{"Failure reproduced?"}
    E -->|No| U["Unverified diagnosis; report and stop"]
    E -->|Yes| F["Agent proposes bounded patch"]
    F --> G["Independent validation jobs"]
    G --> H{"Required checks pass?"}
    H -->|No, retry budget remains| F
    H -->|No, budget exhausted| I["Mark unresolved and escalate"]
    H -->|Yes| J["Restricted Git writer creates fix PR"]
    J --> K["Human review and protected-branch checks"]
~~~

**Definitions:** A finding is an observed issue or check result; an investigation is an evidence-gathering and reasoning run; a remediation is a proposed code or configuration change; a validated remediation passes the checks specified by policy and links to the original reproduction. Passing checks do not guarantee overall correctness.

### 6.3 Status model

- **Finding:** open → triaged → investigating → remediation proposed → resolved / accepted risk / false positive (authorized disposition).
- **Investigation:** queued → collecting evidence → running checks → analyzing → completed / inconclusive / failed / cancelled.
- **Remediation (V1):** proposed → patching → validating → PR opened / failed / cancelled; merged and declined statuses are synchronized from the SCM provider, not decided by an agent.
- Retries create linked attempts; no job is allowed to spin indefinitely.

## 7. Functional requirements

Each requirement is testable and has a delivery stage: M = MVP, V1 = V1, V2 = V2.

### 7.1 Identity, access, and repository connections

| ID | Stage | Requirement | Acceptance signal |
| --- | --- | --- | --- |
| FR-001 | M | Administrators can create a single organization and manage owner/admin/developer/viewer roles. | Unauthorized role attempts are denied and audited. |
| FR-002 | M | Connect selected GitHub repositories using minimally scoped integration credentials. | Unselected repositories are inaccessible. |
| FR-003 | M | Verify webhook signatures, ignore duplicates, and handle out-of-order events. | Replayed events do not spawn duplicate investigations. |
| FR-004 | M | Discover project language, CI configuration, lockfile, test commands, and relevant IaC files. | Profile includes evidence and editable settings. |
| FR-005 | M | Enable/disable workflows at org and repo level; configure path filters and branch scopes. | Nonmatching events do not run agents. |
| FR-006 | V1 | Support GitLab through the same repository/CI abstraction. | GitLab fixtures pass core integration contract tests. |
| FR-007 | V1 | Separate Git read, branch-write, and PR-create authorization. | Agent execution token cannot create PRs or read secrets. |

### 7.2 Events, scans, and findings

| ID | Stage | Requirement | Acceptance signal |
| --- | --- | --- | --- |
| FR-010 | M | Ingest PR and CI lifecycle events and associate them with exact commit SHA and run ID. | Each investigation links to original revision and check. |
| FR-011 | M | Execute configured scanners and project-native tests in bounded jobs, or ingest existing CI results. | Results distinguish imported and Preflyt-executed checks. |
| FR-012 | M | Normalize findings with source, rule, severity, file/location, evidence, timestamps, and run. | Users can filter, inspect, and trace each finding to a source. |
| FR-013 | M | Deduplicate repeated findings across reruns without losing occurrence history. | One logical issue, multiple observations. |
| FR-014 | M | Mark check outcomes as pass/fail/inconclusive/skipped/error; never equate skipped with passed. | UI and API preserve all states. |
| FR-015 | V1 | Support OPA-compatible policy decisions and scoped exceptions with expiry and approver. | Blocking checks cannot be waived by AI output alone. |

### 7.3 AI investigation and model control

| ID | Stage | Requirement | Acceptance signal |
| --- | --- | --- | --- |
| FR-020 | M | Use an agent adapter with LiteLLM or equivalent gateway; external and local models are configurable. | Same workflow can route to at least two configured model targets. |
| FR-021 | M | Allow admins to set API keys, permitted models, per-task budget, token limits, and data-egress policy. | Missing/forbidden provider is blocked before execution. |
| FR-022 | M | Generate diagnoses with observed evidence, hypotheses, uncertainty, affected files, and recommended checks. | Report links directly to supporting logs, tests, or diff. |
| FR-023 | M | Respect repo/org boundaries in every tool call and context retrieval operation. | Cross-repo unauthorized reads fail and are audited. |
| FR-024 | M | Redact known secrets/PII from log/model contexts and support opt-out from external model egress. | Injected test secrets are absent from outbound requests. |
| FR-025 | M | Terminate jobs at configured wall-clock, tool-step, token, and cost limits. | Exhausted task ends deterministically with reason. |
| FR-026 | V2 | Route subtasks to specialized agents with typed inputs/outputs and clear orchestration state. | Agent handoffs are reproducible and traceable. |

### 7.4 Reproduction, patching, and validation

| ID | Stage | Requirement | Acceptance signal |
| --- | --- | --- | --- |
| FR-030 | V1 | Reproduce the original defect on the exact commit in an ephemeral sandbox when feasible. | Original failure and command/environment are recorded. |
| FR-031 | V1 | Allow agents to edit only approved repository paths in their sandbox workspace. | Protected path modification is blocked. |
| FR-032 | V1 | Rerun relevant tests/scanners and required policy checks independently after a patch. | Patch must satisfy checks tied to the original failure. |
| FR-033 | V1 | Limit patch size, file count, attempts, duration, and model spend per task. | Exceeding a threshold stops and reports. |
| FR-034 | V1 | Open a separate remediation PR through a privileged, restricted Git writer only after required checks pass. | PR links finding, reproduction, patch, and validation. |
| FR-035 | V1 | Never automatically merge, self-review, deploy, or alter branch protection. | Automated tests demonstrate those actions are forbidden. |
| FR-036 | V1 | Mark a remediation inconclusive when it cannot reproduce a defect or cannot run required validation. | System does not label it “fixed.” |
| FR-037 | V1 | Capture human accept/reject/merge outcomes for agent evaluation. | GitHub state is reconciled without direct agent authority. |

### 7.5 User experience and administration

| ID | Stage | Requirement | Acceptance signal |
| --- | --- | --- | --- |
| FR-040 | M | Overview shows repository coverage, active investigations, open findings, and recent activity. | Counts reconcile with underlying records. |
| FR-041 | M | Repository page shows profile, integrations, checks, agents, and policy configuration. | Authorized users can see latest run details. |
| FR-042 | M | Investigation workspace displays timeline, evidence, tool executions, costs, and outcome. | A reviewer can reconstruct what happened. |
| FR-043 | M | Support manual read-only investigation trigger with repo and commit scope. | Manual run respects the same authorization/budgets as event runs. |
| FR-044 | M | Provide basic model/integration administration and an append-only audit-event API. | Configuration changes identify actor and timestamp. |
| FR-045 | V1 | Remediation workspace shows diff, reproduction proof, validations, and linked PR. | Reviewer can open SCM PR with full context. |
| FR-046 | V2 | Search approved historical investigations and accepted fixes using scoped retrieval. | No cross-repository/tenant context leakage. |

## 8. UI and information architecture

**Proposed navigation:** Overview; Repositories; Findings; Investigations; Remediations (V1); Agents; Workflows; Policies; Models; Integrations; Reports (later); Audit; Settings.

### 8.1 Overview

Summarize connected repos, recent failed runs, investigation outcomes, budget utilization, and urgent findings. Avoid an opaque “engineering health score” in MVP; show measurable underlying indicators instead.

### 8.2 Repository detail

Display branch/CI provider, languages, checks enabled, per-repo workflow policy, recent failed checks, and investigations. Provide a clear “Run investigation” action for authorized users.

### 8.3 Investigation workspace

Show **timeline + evidence + agent analysis** side by side. Every statement must be labeled as observed, inferred, or unverified. Display execution environment, exact commit, original failure, steps/commands, links to artifacts, token/model usage, cost, and final disposition.

### 8.4 Agent and model controls

Administrators manage allowed agents, model routes, execution budgets, source-code egress permissions, and remediation scope. Secrets are write-only after creation; rotate or revoke rather than revealing stored credentials.

## 9. Domain model and interfaces

### 9.1 Initial logical entities

- **Organization, User, Membership, Role**
- **IntegrationInstallation, Repository, RepositoryProfile**
- **WebhookEvent, PipelineRun, CheckRun, ScanExecution**
- **Finding, FindingOccurrence, Investigation, InvestigationStep**
- **EvidenceArtifact, ToolExecution, ModelUsage**
- **AgentDefinition, AgentRun, WorkflowDefinition, WorkflowRun**
- **Policy, PolicyEvaluation, PolicyException, AuditEvent**
- **RemediationAttempt, PatchArtifact, ValidationRun, RemediationPR** (V1)

Every record that contains repository context must carry organization/repository identity, trace identifiers, timestamps, and an authorization-aware access path.

### 9.2 Normalized finding contract (illustrative)

~~~json
{
  "finding_id": "fnd_example",
  "organization_id": "org_example",
  "repository_id": "repo_example",
  "commit_sha": "0123456789abcdef",
  "category": "ci_test_failure",
  "source": "jest",
  "rule_id": "test_suite_failed",
  "severity": "medium",
  "status": "open",
  "location": {"path": "tests/payment.test.ts", "line": 42},
  "evidence_refs": ["artifact://redacted/example"],
  "first_seen_at": "2026-10-08T09:00:00Z"
}
~~~

This is a **proposed contract**, not an implemented API. The schema must be versioned, validated, and refined during design.

### 9.3 Adapter contracts

Define typed, replaceable interfaces for:

- **SCMProvider:** repository metadata, PR diff, checks, comments, create branch/PR.
- **CIProvider:** run metadata, logs, checks, artifact references.
- **ScannerRunner:** inputs, findings schema, result provenance.
- **AgentRuntime:** context, allowed tools, action plan, structured output.
- **ModelGateway:** provider routing, token/cost accounting, policy enforcement.
- **SandboxBackend:** create, execute, stream output, stop, destroy.
- **PolicyEngine:** deterministic decision and reason codes.
- **ArtifactStore:** scoped evidence storage with expiry and retention.
- **SecretProvider:** write/rotate/revoke and scoped token retrieval.

## 10. Reference architecture and deployment

~~~mermaid
flowchart TB
    User["Web UI (React)"] --> API["Control API (NestJS)"]
    SCM["GitHub; GitLab later"] --> Hook["Webhook ingestion"]
    Hook --> API
    API --> DB[("PostgreSQL")]
    API --> Artifacts["S3-compatible artifact store"]
    API --> Queue["Durable workflow dispatch"]
    API --> Policy["Policy evaluator"]
    Queue --> Orchestrator["Workflow orchestrator"]
    Orchestrator --> Scanner["Isolated scan/test jobs"]
    Orchestrator --> Agent["Python agent service"]
    Agent --> Gateway["LiteLLM"]
    Gateway --> Frontier["Approved frontier APIs"]
    Gateway --> Local["Optional local model"]
    Agent --> Sandbox["Ephemeral code execution sandbox"]
    Sandbox --> Results["Validation evidence"]
    Scanner --> Results
    Results --> API
    API --> Writer["Scoped Git writer"]
    Writer --> SCM
    API --> Telemetry["OpenTelemetry exporter"]
~~~

### 10.1 Control plane

NestJS API owns auth, organizations, repository configuration, webhook/event normalization, workflows, findings, investigation state, policies, model usage, audit, and external integration permissions. PostgreSQL stores structured metadata. Large logs, diffs, test reports, and patches reside in object storage and are referenced by immutable IDs.

### 10.2 Execution plane

A dedicated execution controller dispatches jobs with immutable inputs and a narrow capability set. Jobs clone pinned commits, run scanners or tests, or host a coding-agent task. Artifacts are uploaded to scoped storage; workloads are destroyed on completion, timeout, or cancellation. Production environments require dedicated isolation and restricted network egress; no host Docker socket, privileged pods, or production IAM access.

### 10.3 Model plane

LiteLLM or an equivalent proxy enforces routing, allowlists, budget accounting, and API-key isolation. Initial supported configurations:

1. Hosted models, e.g. OpenAI/Anthropic/DeepSeek, using server-side credentials.
2. Self-hosted inference via an approved local endpoint.
3. “No external egress” mode that denies sending repository data to hosted models.

The selected provider's retention and data-use terms must be evaluated; a self-hosted gateway alone does **not** make remote inference private.

### 10.4 Runtime strategy

- **Development/evaluation:** Docker Compose for platform services; trusted-only sandbox evaluation with explicit warnings about isolation limitations.
- **Production:** Helm/Kubernetes deployments for control plane and isolated Jobs; Argo Workflows is a candidate once workflow durability and job topology are validated.
- **Isolation target:** separate worker pool/namespace, least-privilege service accounts, network policies, read-only base images, quotas, bounded lifetime; assess gVisor/Kata or equivalent stronger sandbox runtime.
- **Fault tolerance:** workflows must resume or terminate predictably after controller restarts; out-of-order events and repeated callbacks must not create duplicate PRs.

## 11. Security, governance, and threat model

### 11.1 Threats

| Threat | Required defense |
| --- | --- |
| Malicious code in connected repositories | Disposable sandboxes, no privileged runtime, deny-by-default egress, no production credentials |
| Prompt injection in code, PR text, CI logs, or web content | Treat as untrusted data, typed tool authorization, separate system policy, prevent tool privilege escalation |
| Exfiltration to model provider | Redaction, model/data allowlists, private-model option, outbound routing enforcement |
| Stolen or overprivileged SCM token | Minimal scopes, separation of read/write identities, rotation, protected branches |
| Secrets in logs, artifacts, or model traces | Secret scanning, redaction, restricted retention and access, encryption |
| Cross-organization/repository data leaks | Scoping in queries, object paths, caches, retrieval, jobs, and telemetry |
| Unsafe AI patch | Reproduction, scoped edits, independent tests, bounded changes, human PR review |
| Denial of service or cost runaway | Quotas, per-run limits, queues, rate limiting, cancellation |
| Forged/replayed SCM event | Signed webhook verification, idempotency keys, event deduplication |
| Supply chain / licensing issue | Version pinning, SBOMs, license review of tools, rules, models, and packaged binaries |

### 11.2 Enforceable controls

- Default read-only GitHub integration; enable write-capable Git service only for V1 remediation workflows.
- Agent workers cannot access model provider keys, stored integration tokens, or cluster-admin capabilities.
- Agents cannot change security configuration, bypass branch protections, approve/merge their own changes, or trigger production deployment.
- Per-repository editable path/command allowlists and protected-file rules.
- Human approval for all remediation PRs; policy exceptions require an authorized, logged approver with expiry.
- Encryption in transit/at rest; credential rotation/revocation; request-scoped audit and trace IDs.
- Configurable evidence retention, default minimum necessary collection, secure artifact deletion, and no unrestricted raw prompt logging.
- Software licenses and scanner rule-pack terms must be assessed before commercial redistribution.

**Multi-tenancy:** MVP targets one organization per installation. Data structures should be organization-scoped from the start, but multi-tenant SaaS is not a claim of MVP readiness and requires a separate isolation review.

## 12. Non-functional requirements and target SLOs

These are **initial acceptance targets** requiring validation against actual hardware, workflow types, and provider SLAs.

| ID | Area | Proposed target |
| --- | --- | --- |
| NFR-01 | Reliability | Webhook acknowledgement does not depend on completion of analysis; events persist before background processing. |
| NFR-02 | Idempotency | Duplicate event deliveries do not generate duplicate investigations or PRs. |
| NFR-03 | Latency | 95% of valid webhooks acknowledged within 2 seconds, excluding upstream delivery time. |
| NFR-04 | Diagnosis time | Median CI failure diagnosis under 5 minutes for benchmark fixtures with available logs. |
| NFR-05 | Bounded execution | Every workflow has configurable wall-clock timeout, retry cap, tool-call cap, and budget. |
| NFR-06 | Isolation | A sandbox cannot access platform API keys, protected SCM write tokens, or other repos by default. |
| NFR-07 | Observability | 100% of workflow runs have traceable IDs, terminal status, model spend record or explicit unavailable state, and evidence references. |
| NFR-08 | Security | Sensitive credentials never appear in standard UI, logs, artifacts, or outbound model context in seeded leakage tests. |
| NFR-09 | Deployment | A documented, tested Compose installation for evaluation; a separately tested Kubernetes deployment for production release. |
| NFR-10 | Compatibility | Node.js/TypeScript and Python fixture repos pass integration contract tests; others explicitly marked unsupported initially. |
| NFR-11 | Audit | Material actions and authorization decisions captured with actor, resource, action, outcome, and time. |
| NFR-12 | Recoverability | Durable job state supports safe restart/retry without duplicate external writes. |

Exact availability, RPO/RTO, concurrency, data retention periods, and maximum artifact sizes must be established before production rollout.

## 13. Telemetry, reporting, and economics

Instrument API, webhook processing, scan/test jobs, agent reasoning, sandbox execution, model-gateway calls, and Git writer actions with OpenTelemetry. Route to SigNoz or another compliant self-hosted observability backend.

Track:

- Time from failure event to first useful diagnosis.
- **Reproduction rate:** proportion of eligible defects reproduced in an approved environment.
- **Verified fix rate:** percentage of attempted fixes passing original repro + required regression/security checks.
- **PR acceptance rate:** human-accepted or merged patches; measure separately from “PR opened.”
- **Recurrence rate:** same defect reappearing after accepted remediation.
- **False-positive/inconclusive rate** and agent-caused regressions.
- Token usage, provider/model, cost per investigation, cost per accepted fix.
- Tool failure rates, queue wait, sandbox startup latency, runtime and cancellation reasons.
- Developer time saved (estimated using sampled baseline), and user satisfaction.

Never claim issues were “prevented” solely because an LLM identified a possible risk; measure actual enforcement, independent validation, or reviewed fixes.

## 14. Evaluation plan

Establish a fixed, versioned benchmark corpus:

- **CI case:** failed TypeScript/Python test due to realistic logic/configuration defect.
- **Security case:** known, fixable dependency finding with compatibility tests.
- **Reliability case:** missed graceful shutdown with executable failure and success checks.
- **Negative controls:** misleading logs, flaky tests, unsafe requested modifications, insufficient repro.
- **Adversarial controls:** prompt injections, synthetic credentials, attempted unauthorized tool actions.
- **Unseen evaluation:** historical real failures not used in agent prompt or tuning.

For each case capture baseline time, agent attempts, reproduction outcome, patch correctness, regressions, and cost. A suggested initial target is **≥70% verified resolution on controlled, reproducible fixtures**; this is a project threshold to test, **not** an external benchmark or claim about production accuracy. Report results on unseen real cases separately.

## 15. Acceptance criteria

### 15.1 Technical proof of concept

- [ ] A GitHub failed-check event starts exactly one investigation.
- [ ] CI logs and exact commit diff are collected with appropriate permissions.
- [ ] A bounded agent produces an evidence-linked diagnosis with uncertainty labels.
- [ ] An isolated run demonstrates reproduction of a known failing test.
- [ ] A proposed patch passes the original failing test plus required regression checks.
- [ ] A separate fix PR is created with a diff, reproduction proof, validation output, and linked finding.
- [ ] A human—not the agent—remains responsible for review and merge.
- [ ] Seeded prompt-injection and secret-leak tests cannot access protected capabilities.
- [ ] Timeouts and cost ceilings stop runaway runs.

### 15.2 MVP product acceptance

- [ ] Admin can configure an organization, users, selected GitHub repositories, models, and budgets.
- [ ] PR and CI events are authenticated, deduplicated, and mapped to the correct commit.
- [ ] Repository profiles drive applicable scanner/test configurations.
- [ ] Findings are searchable and source-traceable, with pass/fail/inconclusive states.
- [ ] AI CI investigation can be triggered automatically or manually within policy.
- [ ] The UI shows investigation evidence, hypotheses, costs, run status, and audit timeline.
- [ ] Docker Compose evaluation deployment is documented and tested.
- [ ] No claim of autonomous remediation is shown in the product UI until V1 is shipped.

### 15.3 V1 release acceptance

- [ ] Hardened Kubernetes execution isolation is security-tested.
- [ ] Agent edits and commands are restricted independently of prompt instructions.
- [ ] Reproduction and validation contracts cannot be silently skipped.
- [ ] Approved workflows can open remediation PRs; never merge them.
- [ ] An authorized user can cancel runs and revoke model/SCM credentials.
- [ ] GitLab adapter passes provider contract tests.
- [ ] End-to-end audit and cost records survive retry/controller restart.

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Low-quality AI patches | Wasted review time, regressions | Benchmark gates, independent tests, human review, attempt caps |
| Insufficient CI evidence | Hallucinated root cause | Explicit inconclusive status; ask for more evidence |
| Flaky or environment-dependent tests | Misleading fix validation | Stable fixtures, deterministic reruns, report non-reproducibility |
| Runner escape / data exposure | Severe security incident | Hardened execution plane, isolation testing, minimal credentials and egress |
| High inference spend | Unexpected cost | LiteLLM routing, budget caps, token telemetry, no hidden retries |
| GitHub/GitLab API limits | Delays, failed integrations | Backoff, pagination, caching, queueing, idempotency |
| Broad language/framework scope | Delays and fragile behaviour | Start with Node.js/TypeScript and Python; adapter contracts |
| Scanner/model licensing | Distribution restrictions | Maintain OSS/license inventory, assess each rule pack and model |
| Overbuilding orchestration | Slow delivery | Build one end-to-end workflow before multi-agent platform expansion |
| Misleading dashboards | False confidence | Report evidence-backed metrics and data coverage |

## 17. Open decisions

These items require explicit engineering/product decisions before implementation; they are not resolved by this draft.

1. Authentication for first deployment: built-in credentials, OIDC, or both?
2. GitHub integration mechanism: GitHub App preferred; required permission set and installation ownership?
3. Scope of allowed outbound network destinations per sandbox and external-model policy?
4. Sandbox choice for production isolation: hardened Jobs with gVisor/Kata or an alternative?
5. Agent SDK selection and license validation: OpenHands SDK, mini-SWE-agent, or a custom thin adapter?
6. Workflow engine: lightweight durable queue initially versus Argo Workflows from the first deployment?
7. Which scanner binaries/rules can be redistributed under Preflyt's eventual license?
8. Artifact retention defaults, data residency policy, and whether any personal data is persisted.
9. Which checks are mandatory before a remediation PR can be labeled “validated”?
10. Whether automatic comments on source PRs are enabled by default or require explicit opt-in.
11. Release concurrency, hardware sizing, Kubernetes support matrix, and recovery objectives.
12. Preflyt source-code license and external contribution policy.

## 18. Proposed engineering workstreams

**Workstream A — Platform foundation:** repository layout, API, auth, PostgreSQL schema, event contracts, UI shell, audit and tracing.

**Workstream B — GitHub and findings:** installation flow, webhook gateway, CI artifacts, repository profile, scanner adapters, deduplication.

**Workstream C — AI investigation:** model-gateway integration, evidence packaging/redaction, agent adapter, structured diagnosis, limits and evaluation.

**Workstream D — Execution safety:** immutable source checkout, sandbox controller, quotas, egress restrictions, artifact collection, hardening and threat tests.

**Workstream E — Remediation (V1):** bounded patching, independent validation jobs, scoped Git writer, remediation PRs, lifecycle sync.

**Workstream F — Operations:** Compose/Helm packaging, secret management, OTel/SigNoz, backup/recovery and operational runbooks.

### Suggested next documents

- Architecture Decision Records (agent adapter, workflow engine, sandbox model, model gateway).
- Threat model and data-flow diagram.
- API/events and database schema specification.
- MVP UX journeys and wireframes.
- Evaluation harness and benchmark fixture design.
- Engineering issue breakdown, dependencies, and release checklist.

---

**Decision sought:** Approve the MVP boundary, human-in-the-loop remediation posture, and the proof-of-concept evaluation criteria before starting implementation. This PRD intentionally describes planned capabilities and must be updated as design decisions and implementation evidence evolve.
