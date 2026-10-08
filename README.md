# Preflyt

**Engineering confidence before production.**

Preflyt is a planned **self-hosted, AI-native Shift Left engineering control plane**. It connects to existing development systems, detects software quality, security, and reliability issues early, investigates failures with AI agents, attempts reproducible fixes in isolated environments, and opens validated remediation pull requests for human review.

> **Project status: specification / pre-implementation.** The repository currently contains product documentation, not a runnable platform. Features, APIs, deployment charts, and commands described below are planned unless explicitly marked as implemented.

Maintained by **Lyrisoft Technologies**.

## Why Preflyt?

Modern CI/CD systems execute builds and tests; scanners report findings; developers then spend time correlating evidence, reproducing failures, and preparing fixes. Preflyt connects these stages into an accountable workflow:

**Detect → Triage → Reproduce → Remediate → Validate → Review → Learn**

It is **not** intended to replace GitHub Actions, GitLab CI, Jenkins, a source-control system, or established scanners. It acts as the engineering control plane above them.

## Product principles

- **Evidence before inference:** findings are grounded in code diffs, test output, scanner results, and reproducible observations.
- **Agents propose; deterministic checks and humans decide:** AI never overrides required policy checks, merges its own PRs, or deploys to production in the initial release.
- **Untrusted code stays isolated:** repository code and agent shell commands run in ephemeral, least-privileged sandboxes with restricted networking.
- **Bring your own models:** use external frontier-model APIs through a gateway or private local inference; enforce organizational data-egress and budget policies.
- **Self-host first:** Docker Compose is the planned local deployment path; Kubernetes is the planned production execution environment.
- **Integrate, don't replace:** keep CI/CD and repository hosting where they already are.
- **Explicit, auditable outcomes:** each investigation records evidence, actions, costs, validation results, and review links.

## Proposed capabilities

| Area | Planned behaviour | Delivery stage |
| --- | --- | --- |
| GitHub integration | Connect repositories; receive PR and CI-status events; read diffs and logs | MVP |
| Repository profile | Detect language, tests, manifest files, Docker/IaC/migration signals | MVP |
| Findings | Normalize scanner, test, and CI failures; deduplicate and track state | MVP |
| Automated checks | Run scanners/tests only in an approved safe sandbox; otherwise ingest external CI evidence | MVP |
| AI investigation | Correlate evidence, diagnose root causes, report confidence and uncertainty | MVP |
| Investigation workspace | View evidence, model usage, run history, and recommended next steps | MVP |
| Fixture-only PoC remediation | Write validated fix PRs only to explicitly allowlisted disposable fixture repositories | PoC only |
| Remediation | Apply bounded code changes in an isolated sandbox for approved repositories | V1 |
| Validation and fix PR | Rerun required checks; open a human-reviewable remediation PR | V1 |
| Policy enforcement | Repository/organization rules and approval requirements | MVP → V1 |
| GitLab integration | Additional source-control and CI provider adapter | V1 |
| Engineering intelligence | Retrieve approved historical fixes and incident patterns | V2 |
| Specialized agents | Reliability, security, infrastructure, database, performance agents | V1 → V2 |

**Initial emphasis:** diagnosing failed CI jobs on TypeScript/Node.js and Python *target repositories* (the source code under test). Preflyt application and agent services are written in TypeScript. **Before running scanners, tests, builds, or scripts on real repositories in MVP, Preflyt must have a security-reviewed execution sandbox; otherwise operation is ingest-only.** The end-to-end PoC is deliberately restricted to disposable fixture repositories; general write-back and remediation PR creation begin in V1.

## Proposed user experience

1. An administrator connects a GitHub organization using scoped credentials.
2. The administrator selects repositories, sets model/data policies, and enables workflows.
3. A PR or failed CI job generates a signed event.
4. Preflyt collects relevant diffs, test failures, and scanner output; creates a finding and investigation.
5. An AI investigator proposes a hypothesis with evidence and, when enabled, reproduces the failure in an isolated execution job.
6. **In fixture-only PoC or V1 remediation mode**, an agent generates a bounded patch and the platform reproduces the original failure and independently runs all mandatory validation checks under an equivalent pinned environment.
7. **Only for fixture-only PoC or authorized V1**, Preflyt opens a separate fix PR for developer review. If the original change is on an open same-repository feature branch, the fix PR **targets that feature branch**, not the default branch. Stale, forked or ambiguous targets stop automatic write-back. The platform never self-approves or auto-merges.
8. Audit events and approved outcomes become available for reporting and later engineering knowledge retrieval.

## Architecture (proposed)

~~~mermaid
flowchart TB
  SCM["GitHub initially / GitLab later"] --> WH["Webhook & integration API"]
  UI["React / TypeScript UI"] --> API["NestJS control-plane API"]
  WH --> API
  API --> DB[("PostgreSQL")]
  API --> STORE["S3-compatible artifacts"]
  API --> Q["Redis / BullMQ durable jobs"]
  Q --> ORCH["Node.js / TypeScript worker coordinator"]
  API --> POLICY["Policy decision layer"]
  ORCH --> EXEC["Execution adapter"]
  EXEC --> SCAN["Scanner & test jobs"]
  EXEC --> SANDBOX["Ephemeral agent sandbox"]
  ORCH --> AGENT["Isolated TypeScript AI agent worker"]
  AGENT --> LLM["LiteLLM model gateway"]
  LLM --> EXT["Optional frontier models"]
  LLM --> LOCAL["Optional private inference"]
  SCAN --> API
  SANDBOX --> API
  API --> GITWRITE["Restricted Git write service"]
  GITWRITE --> SCM
  API --> OTEL["OpenTelemetry / SigNoz"]
~~~

**Selected application stack (framework and runtime versions to be validated in implementation spikes):**

| Layer | Preferred approach |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| Backend/control plane | Node.js + NestJS + TypeScript |
| AI agent runtime | Node.js + TypeScript using provider-neutral tool contracts; evaluate Vercel AI SDK / OpenAI Agents SDK for JavaScript |
| Model routing | LiteLLM container, with API-key-backed frontier models and optional local inference; application services remain TypeScript |
| Workflow execution | BullMQ + Redis for durable jobs, bounded retries, and orchestration; consider Argo Workflows only if complex Kubernetes DAGs justify it |
| Execution controller | TypeScript, using Docker APIs for local evaluation and `@kubernetes/client-node` for Kubernetes Jobs |
| Sandboxes | MVP: approved stronger isolation for real-repository execution (such as independently tested gVisor/Kata on Kubernetes); Docker-based execution limited to allowlisted local fixtures; ingest-only fallback |
| Database | PostgreSQL + Prisma ORM/migrations |
| Evidence and artifacts | S3-compatible object storage |
| Technical checks | Trivy, Semgrep Community Edition, Gitleaks, Checkov, and project-native test tools (subject to licenses) |
| Policies | Deterministic rules; evaluate OPA as policy complexity grows |
| Observability | OpenTelemetry; SigNoz as an optional self-hosted backend |

**Runtime boundary:** NestJS serves APIs and enqueues workflows; dedicated Node.js/TypeScript workers investigate findings and coordinate execution. Never execute model-generated shell commands inside the API or agent control process. Sandboxed code runs only in isolated jobs with independently enforced tool permissions. We can integrate a non-TypeScript agent as an external adapter later if a specific capability requires it, but Python is **not required** for Preflyt application services.

**Execution isolation (mandatory in MVP):** containers alone are not an adequate boundary for malicious repositories. Real-repository jobs require an **independently reviewed stronger sandbox** (e.g. gVisor/Kata or equivalent) with dedicated worker isolation, effective preflight checks, CPU/memory/disk/PID/deadline limits, default-deny networking, immutable checkout/image, and tests demonstrating no escape or credential exfiltration. No untrusted job receives model API keys, repository write credentials, or production secrets. If an approved executor is unavailable, Preflyt **does not execute repository code** and uses imported CI evidence instead.

## Deployment targets

- **Local / evaluation (planned):** Docker Compose for API, UI, PostgreSQL, Redis, LiteLLM, TypeScript agent worker, and a **fixture-only** local Docker execution worker. Real repository jobs require an independently approved secure execution environment.
- **Production (planned):** Helm/Kubernetes for control-plane services and short-lived, isolated scanner/test/agent Jobs.
- **AI inference:** supply credentials for supported external models, point to a local model endpoint, or disable AI until configured.

> **There is no install command yet.** No Compose file, Helm chart, API, or application source has been committed. Do not interpret this README as evidence that Preflyt can be deployed today.

## Proposed repository layout

The following is a **target structure**, not a listing of currently implemented files. Use pnpm workspaces and Turborepo to manage TypeScript builds, linting, and shared packages:

~~~text
apps/
  web/                    # React product UI
  api/                    # NestJS control plane
services/
  agent-worker/           # Node.js / TypeScript AI investigations
  execution-worker/       # TypeScript Docker / Kubernetes execution controller
  integration-worker/     # TypeScript GitHub / GitLab adapters
packages/
  agents/                 # reusable agent definitions and tools
  contracts/              # shared TS API/event schemas
  database/               # Prisma schema and migrations
  integrations/           # shared SCM / CI adapters
  policies/               # shared policy definitions
  ui/                     # shared React components
infra/
  compose/                # development deployments
  helm/                   # production deployment charts
pnpm-workspace.yaml       # TypeScript workspace declaration (planned)
turbo.json                # monorepo task orchestration (planned)
docs/
  PRD.md                  # product requirements
  architecture/           # ADRs and threat model, later
~~~

## Roadmap

- **MVP — Detect and explain safely:** GitHub repository onboarding, PR/CI event processing, scanner and test result ingestion, findings, AI CI investigation, read-only dashboard, audit trail, basic policy and model configuration. **Real-repository scanner/test execution requires approved sandbox isolation before launch**, with a fail-closed ingest-only mode.
- **PoC (evaluation only):** full remediation flow with fix PR creation **only** in designated disposable GitHub fixture repositories, backed by separate restricted write credentials.
- **V1 — Verified remediation:** expand the existing MVP-safe execution plane to editable, isolated workspaces with immutable reproducibility/validation evidence, bounded agent code editing, mandatory regression checks, branch-aware developer-reviewed fix PRs and GitLab integration.
- **V2 — Engineering intelligence:** specialized agents, accepted-fix retrieval, cross-repository trends within tenant boundaries, advanced custom workflows, performance/reliability insights.

This is a planning sequence, not a release-date commitment. The [Product Requirements Document](docs/PRD.md) defines requirements, acceptance criteria, constraints, and open decisions. [ADR-0001](docs/architecture/ADR-0001-typescript-first-stack.md) records the TypeScript-first language/runtime decision, while [ADR-0002](docs/architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md) defines the **MVP safety gate, fixture-only PoC boundaries, immutable validation contract, and remediation PR target policy**.

## Security and data handling

- Verify webhook signatures and process events idempotently.
- Use least-privilege GitHub/GitLab integrations; separate read access from patch/PR writing.
- Store API keys in a server-side secrets system; never embed them in source, logs, prompts, or agent sandboxes.
- Enforce organization and repository boundaries across database queries, artifacts, logs, knowledge retrieval, and executions.
- Treat repository contents, CI logs, issue text, and tool output as **untrusted prompt input**.
- Gate sending source code to external models on administrator-approved data policies.
- Require human review, protected branches, and independent passing checks before merge. **Validate the exact source revision, environment, commands, canonical patch checksum and predeclared mandatory checks before write-back; recheck the source branch head to prevent stale fixes.**
- Preserve redacted, tamper-evident audit records and bounded artifact retention.

## Development and contribution status

This repository is at the **product definition stage**. Before accepting implementation PRs, maintainers plan to define coding standards, contribution guidelines, CI checks, secret-scanning rules, and a license.

Use reviewable feature branches and PRs; do not assume undocumented environment variables or setup commands exist. See [docs/PRD.md](docs/PRD.md) for the initial acceptance criteria and MVP definition.

## License

**Not yet selected.** Preflyt's own source license will be decided before implementation or redistribution. Third-party scanners, model gateways, SDKs, model weights, and rule packs have separate licenses and terms; each must be reviewed before bundling or commercial distribution.
