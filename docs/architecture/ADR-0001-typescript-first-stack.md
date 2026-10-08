# ADR-0001: TypeScript-first application architecture

**Status:** Accepted for initial implementation planning  
**Date:** 2026-10-08  
**Product:** Preflyt  
**Decision owner:** Product / Engineering  
**Related:** [Product Requirements](../PRD.md), [Repository README](../../README.md), [ADR-0002: safe MVP execution and remediation evidence](ADR-0002-safe-execution-fixtures-remediation-contract.md)

## Context

Preflyt is a self-hosted, AI-native Shift Left engineering control plane. It ingests repository and CI events, runs engineering checks, investigates failures with AI agents, and ultimately proposes validated remediation pull requests. The original product draft suggested a NestJS/TypeScript control plane plus a Python AI agent service.

For the initial product, minimizing languages, sharing contracts, and simplifying operations take priority over using a Python-specific coding-agent SDK. Preflyt requires sophisticated tool authorization, orchestration, sandbox execution, evidence capture, and model access—not model training.

## Decision

**Build all Preflyt-maintained application services in Node.js and TypeScript and the browser UI in React + TypeScript.**

### Selected baseline

| Concern | Choice |
| --- | --- |
| Runtime and primary language | Node.js + TypeScript |
| Browser application | React + Vite + TypeScript |
| API and control plane | NestJS |
| AI investigation and remediation agent runtime | Dedicated Node.js/TypeScript worker service |
| Agent tools | Versioned TypeScript interfaces with runtime input/output validation |
| Agent SDK | Evaluate Vercel AI SDK and OpenAI Agents SDK for JavaScript; select after a spike |
| Multi-agent orchestration | Start with ordinary TypeScript state machines/jobs; LangGraph.js only if justified |
| Durable background processing | Redis + BullMQ |
| Persistent metadata | PostgreSQL + Prisma |
| Local isolated execution | Docker backend for **allowlisted fixture-only** evaluation |
| MVP real-repository isolation | Security-reviewed stronger isolation (e.g. gVisor/Kata or equivalent) on dedicated workers, dispatched through Kubernetes Jobs using @kubernetes/client-node; otherwise ingest-only |
| Model routing | LiteLLM as independently deployed container; external frontier APIs or local endpoints |
| Monorepo/build | pnpm workspaces + Turborepo |
| Telemetry | OpenTelemetry, with SigNoz as an optional self-hosted backend |
| Packaging | Docker Compose (evaluation); Helm/Kubernetes (production) |

### Process and trust boundaries

1. **HTTP API:** NestJS validates webhook signatures, authenticates users, enforces organizational policy, persists metadata, and enqueues work. No model-generated shell commands or code execution in the API process.
2. **Workflow/integration workers:** BullMQ consumers own asynchronous workflow transitions, CI/SCM integration, state persistence, retry and cancellation logic. Jobs use idempotency keys: queue delivery may occur more than once.
3. **Agent workers:** Separate TypeScript processes consume approved evidence, use model routing, and ask typed tools to perform bounded operations. They hold no cluster-admin or GitHub write credentials.
4. **Execution controller:** Distinct TypeScript service validates tool authorization then dispatches ephemeral Docker or Kubernetes jobs. The controller is not a general-purpose shell proxy.
5. **Isolated sandbox:** The only place repository commands run. **MVP** real-repository execution already requires independently validated stronger isolation, least privilege, no production secrets, restricted egress, resource/time ceilings, and runtime preflight; local Docker execution is fixture-only. Unsafe/missing executors must fail closed to ingest-only evidence.
6. **Restricted Git writer:** Separate integration identity can create a branch/remediation PR **only for fixture repositories in the PoC or authorized V1 workflows** after independent validation with the protected original harness and pre-write source/target checks. Create a draft fix PR and verify source/target state and the pushed tree after creation before human-review readiness; reconcile later changes and invalidate stale/unknown freshness. On an open same-repository feature PR, remediation targets the original feature branch. Stale cleanup affects only the Preflyt-owned fix PR. Agents cannot merge, approve, deploy, or alter protections.
7. **LiteLLM gateway:** Separately hosted implementation and provider APIs; provider secrets stay outside sandbox workloads. A third-party gateway may use Python internally without making Python a language for maintained Preflyt services.

~~~mermaid
flowchart TD
    UI["React / TypeScript / Vite"] --> API["NestJS / Node.js API"]
    SCM["GitHub (GitLab later)"] --> API
    API --> PG[("PostgreSQL + Prisma")]
    API --> Q[("Redis / BullMQ")]
    Q --> WORK["TypeScript workflow worker"]
    WORK --> AGENT["TypeScript agent worker"]
    AGENT --> GATE["LiteLLM container"]
    GATE --> MODELS["Frontier / local models"]
    WORK --> EX["TypeScript execution controller"]
    AGENT --> EX
    EX --> S["Isolated Docker / Kubernetes Jobs"]
    S --> RESULTS["Scan, test and patch artifacts"]
    RESULTS --> API
    API --> GIT["Restricted SCM writer"]
    GIT --> SCM
~~~

## Rationale

- One application language across frontend, backend, integration workers, agent workers, and execution coordination.
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

- Some specialized coding-agent frameworks are Python-first; we may need more TypeScript adapter work or an optional external service later.
- Agent framework choice is **not yet final**. Evaluate TypeScript SDKs against sandbox/tool control, structured outputs, streaming/cancellation, tracing, compatibility with LiteLLM, security, and licensing.
- BullMQ is a job queue, **not** an exactly-once workflow engine. Persist explicit workflow state and make external actions idempotent.
- Prisma is the initial persistence abstraction; use migrations with backward-compatibility safeguards.
- Kubernetes Jobs execute work; Kubernetes is not the workflow state database.
- Model code/data egress remains governed by explicit organization policy. Self-hosted orchestration does not automatically imply locally hosted models.
- The platform must remain capable of analyzing **Python, Go, Java, and other target-language repositories**, even though Preflyt itself is TypeScript-first. Initial tested target languages are Node.js/TypeScript and Python.
- [ADR-0002](ADR-0002-safe-execution-fixtures-remediation-contract.md) is authoritative for stage-specific safe execution, PoC write scope, immutable reproduction/validation records and remediation PR targeting.
- No runnable services have been implemented at the time of this ADR.

## Validation before scaling

1. Create a pnpm/Turborepo skeleton with API, web, agent-worker, and execution-worker.
2. Demonstrate a signed GitHub CI-failure webhook enqueuing an idempotent BullMQ task.
3. Run a TypeScript agent through LiteLLM, capturing token usage and evidence links.
4. Dispatch an isolated container job, enforce a timeout, and collect a failing and passing test result.
5. Show that an agent cannot run commands within the API container or access SCM writer secrets.
6. Restart the queue worker and verify state reconciliation without duplicate fixes or PRs.
7. Record outcomes of the agent SDK spike and update this ADR if the decision materially changes.
