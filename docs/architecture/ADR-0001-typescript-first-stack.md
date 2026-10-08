# ADR-0001: TypeScript-first application architecture

**Status:** Accepted for initial implementation planning  
**Date:** 2026-10-08  
**Product:** Preflyt  
**Decision owner:** Product / Engineering  
**Related:** [Product Requirements](../PRD.md), [Repository README](../../README.md), [ADR-0003: OIDC authentication](ADR-0003-oidc-user-authentication.md), [ADR-0002: safe execution and optional remediation](ADR-0002-safe-execution-fixtures-remediation-contract.md), [ADR-0004: Shift Left assessment and governance](ADR-0004-shift-left-assessment-governance.md)

## Context

Preflyt is a self-hosted, AI-native **Shift Left engineering assessment and governance platform**. It ingests repository and CI events, plans and executes or imports relevant engineering checks, enforces deterministic quality gates, and explains evidence-backed findings with optional AI. **Automated coding/remediation PRs are not a core product or an MVP/V1 requirement.** The original product draft suggested a NestJS/TypeScript control plane plus a Python AI agent service.

For the initial product, minimizing languages, sharing contracts and simplifying operations take priority over introducing Python-based coding-agent frameworks. Preflyt needs repository/CI integration, assessment planning, sandbox execution, evidence normalization, deterministic policy evaluation and optional explanatory model access—not model training or code generation.

## Decision

**Build all Preflyt-maintained application services in Node.js and TypeScript and the browser UI in React + TypeScript.**

### Selected baseline

| Concern | Choice |
| --- | --- |
| Runtime and primary language | Node.js + TypeScript |
| Browser application | React + Vite + TypeScript, initially built upon pinned and audited Shadcn Admin source (see ADR-0005) |
| API and control plane | NestJS |
| AI assessment and investigation runtime | **Optional read-only** dedicated Node.js/TypeScript intelligence worker; no coding agent required |
| Core engines | Versioned TypeScript assessment planner, validation adapters and governance/policy evaluator |
| AI SDK (optional) | Evaluate TypeScript provider/structured-output SDK against LiteLLM only when AI assessment is implemented |
| Orchestration | BullMQ job state and TypeScript assessment state machines; multi-agent orchestration is not required |
| Durable background processing | Redis + BullMQ |
| Persistent metadata | PostgreSQL + Prisma |
| Local isolated execution | Docker backend for **allowlisted fixture-only** evaluation |
| MVP real-repository isolation | Security-reviewed stronger isolation (e.g. gVisor/Kata or equivalent) on dedicated workers, dispatched through Kubernetes Jobs using @kubernetes/client-node; otherwise ingest-only |
| Model routing | LiteLLM as independently deployed container; external frontier APIs or local endpoints |
| Monorepo/build | pnpm workspaces + Turborepo |
| Telemetry | OpenTelemetry, with SigNoz as an optional self-hosted backend |
| Packaging | Docker Compose (evaluation); Helm/Kubernetes (production) |

### Process and trust boundaries

1. **HTTP API:** NestJS validates webhook signatures and OIDC identities, establishes server-managed user sessions, maps provisioned issuer/subject identities to local roles, enforces organizational policy, persists metadata, and enqueues work. No model-generated shell commands or code execution in the API process. Human auth is defined in [ADR-0003](ADR-0003-oidc-user-authentication.md).
2. **Workflow/integration workers:** BullMQ consumers own asynchronous workflow transitions, CI/SCM integration, state persistence, retry and cancellation logic. Jobs use idempotency keys: queue delivery may occur more than once.
3. **Optional AI assessment worker:** A separate TypeScript process consumes authorized, normalized evidence and produces read-only explanations/recommendations. It cannot change policy decisions or hold cluster-admin or GitHub code-write credentials. Deterministic assessments function without this worker.
4. **Validation execution controller:** A separate TypeScript service checks assessment admission/executor authorization then dispatches approved scanner/test jobs into isolated fixtures or hardened Kubernetes environments. It is not a general-purpose shell proxy.
5. **Isolated sandbox:** The only place repository commands run. **MVP** real-repository execution already requires independently validated stronger isolation, least privilege, no production secrets, restricted egress, resource/time ceilings, and runtime preflight; local Docker execution is fixture-only. Unsafe/missing executors must fail closed to ingest-only evidence.
6. **GitHub checks/status publisher:** The core GitHub integration may publish a revision-bound **engineering quality-gate result**, using only narrowly scoped status/check permissions. It **does not** need branch-write, merge or remediation PR privileges. ADR-0002 documents a **separate optional future remediation Git writer**, whose fixture-only/testing and branch-safety controls remain in force if that capability is ever built.
7. **LiteLLM gateway:** Separately hosted implementation and provider APIs; provider secrets stay outside sandbox workloads. A third-party gateway may use Python internally without making Python a language for maintained Preflyt services.

~~~mermaid
flowchart TD
    UI["React / TypeScript / Vite"] --> API["NestJS / Node.js API"]
    SCM["GitHub (GitLab later)"] --> API
    API --> PG[("PostgreSQL + Prisma")]
    API --> Q[("Redis / BullMQ")]
    Q --> WORK["TypeScript assessment planner / worker"]
    WORK --> EX["TypeScript approved execution controller"]
    EX --> S["Isolated scanner / test jobs"]
    S --> RESULTS["Evidence + normalized findings"]
    WORK --> RESULTS
    RESULTS --> POL["Deterministic policy/gate engine"]
    RESULTS --> AI["Optional TypeScript AI assessment worker"]
    AI --> GATE["LiteLLM container"]
    GATE --> MODELS["Frontier / local models"]
    POL --> REPORT["Engineering Readiness Report"]
    AI --> REPORT
    REPORT --> API
    API --> STATUS["Revision-bound Git status publisher"]
    STATUS --> SCM
~~~

**Frontend implementation choice:** [ADR-0005](ADR-0005-shadcn-admin-frontend.md) directs engineers to **pull Shadcn Admin's full application source at a pinned upstream commit and build Preflyt on top of it**. Upstream correctly calls its project a dashboard UI rather than a starter template; Preflyt adopts and refactors that codebase, reviews its dependencies/customized components, and retains ownership of OIDC/session, RBAC and feature routes. This refines but does not change the TypeScript-first language decision.

## Rationale

- One application language across frontend, backend, integration workers, assessment/planning workers, optional AI workers and execution coordination.
- Shared types and runtime validation for requests, events, tool calls, and workflow contracts.
- Node.js is well suited to I/O-heavy control-plane workloads and Git/CI APIs.
- Model SDKs, tool-calling, provider routing, and prompt/evaluation tooling are accessible from TypeScript.
- Easier staffing, code review, consistent instrumentation, and fewer independently maintained dependency ecosystems.
- Python-based scanners or research tools can still run in external containers when required.

## Rejected alternatives

- **Python agent microservice by default:** not justified initially; adds a second maintained language and cross-language RPC contract before proof of necessity.
- **All AI logic inside the NestJS API:** rejected because long-running reasoning and untrusted execution could impact web request performance and increase attack surface.
- **Build a custom LLM gateway immediately:** unnecessary; use a separately operated gateway that supports approved model providers.
- **Use Argo Workflows for every task on day one:** adds Kubernetes dependency and operational weight for early workflows; revisit for complex DAGs only.
- **Go execution-controller service from day one:** not justified by the initial workload; can be revisited based on measured requirements.

## Consequences and guardrails

- Specialized coding-agent SDKs are not required for the core platform. Should future optional remediation be built, assess framework licensing and execution/security implications separately.
- For optional AI **assessment**, prioritize reliable structured outputs, traceable evidence links, provider/data-egress policy and LiteLLM compatibility; multi-agent handoffs are not initially necessary.
- BullMQ is a job queue, **not** an exactly-once workflow engine. Persist explicit workflow state and make external actions idempotent.
- Prisma is the initial persistence abstraction; use migrations with backward-compatibility safeguards.
- Kubernetes Jobs execute work; Kubernetes is not the workflow state database.
- Model code/data egress remains governed by explicit organization policy. Self-hosted orchestration does not automatically imply locally hosted models.
- The platform must remain capable of analyzing **Python, Go, Java, and other target-language repositories**, even though Preflyt itself is TypeScript-first. Initial tested target languages are Node.js/TypeScript and Python.
- [ADR-0004](ADR-0004-shift-left-assessment-governance.md) defines the **primary assessment and governance architecture** and deterministic quality-gate semantics.
- [ADR-0002](ADR-0002-safe-execution-fixtures-remediation-contract.md) remains authoritative for **mandatory MVP sandbox safety**, while its fixture-only PoC and remediation PR sections apply only to a **separately authorized optional future module**.
- No runnable services have been implemented at the time of this ADR.

## Validation before scaling

1. Create a pnpm/Turborepo skeleton with API, web, assessment worker, execution worker and optional intelligence worker.
2. Demonstrate a signed GitHub PR/CI webhook enqueuing one idempotent, revision-bound assessment.
3. Resolve a Repository Engineering Profile and AssessmentPlan from an immutable policy version and changed paths.
4. Import CI evidence; run eligible scan/test fixture jobs under approved executor profiles, refusing unsafe real-repository execution.
5. Compute PASS/WARN/BLOCK/INCOMPLETE deterministically and publish the quality gate for the exact commit.
6. Show that AI disabled/unavailable does not affect deterministic results; if enabled, AI cannot alter the gate or run commands inside the API container.
7. Restart workers and demonstrate no duplicated assessments, stale green statuses or unauthorized write operations.
