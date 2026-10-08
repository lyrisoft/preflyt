# Preflyt

**Engineering confidence before production.**

Preflyt is a planned **self-hosted, AI-native Shift Left engineering platform**. It helps engineering teams detect and prevent security vulnerabilities, software defects, reliability failures and infrastructure risks **earlier in the software development lifecycle**, using continuous assessments, explicit engineering standards, policy-based quality gates and actionable developer feedback.

> **Status: frontend source baseline imported; product implementation pending.** The runnable upstream dashboard is under `apps/web`. NestJS services, Preflyt OIDC authentication, repository onboarding, scanners and deployment manifests are not implemented. Product capabilities below remain proposed.

Developed by **Lyrisoft Technologies**.

## Why Preflyt?

Problems discovered in QA, pre-production or production cost more to diagnose and fix than problems found during design, development, pull request review or CI. Existing scanners and CI systems produce valuable signals, but engineering teams still need to decide **which checks apply, whether the evidence is trustworthy, and whether a change is ready to progress**.

Preflyt coordinates that work. It is **not a coding agent, another IDE, a replacement CI platform, or a general-purpose code generation tool**.

**Shift Left workflow: Discover → Assess → Validate → Enforce → Improve**

Its main output is an **Engineering Readiness Report**: a traceable account of which required engineering checks passed, failed, were not applicable or lacked sufficient evidence at a specific repository revision.

## Three core engines

| Engine | Purpose |
| --- | --- |
| **Engineering Validation Engine** | Discover repository context, select applicable scanners/tests, import CI results or run approved checks, and normalize evidence |
| **Engineering Governance Engine** | Define engineering policies, apply required checks, evaluate deterministic quality gates and audit exceptions |
| **Engineering Intelligence Engine** | Explain findings, correlate risks and recommend improvements using optional AI; **AI never determines the gate result** |

### Shift Left coverage

| Area | Example controls |
| --- | --- |
| **Security** | Code/SAST, dependencies, leaked secrets, containers, API security, IaC misconfigurations |
| **Testing and software quality** | Lint/typecheck, unit/integration/contract tests, regression checks |
| **Reliability** | Graceful shutdown, timeouts, retries, health checks, readiness, resilience |
| **Infrastructure** | Terraform/OpenTofu, Kubernetes, Docker and cloud policy validation |
| **Databases** | Destructive migration detection, backward compatibility, query-performance tests |
| **Performance** | k6 smoke, load, stress, spike, soak/endurance, breakpoint, scalability and regression tests; versioned budgets, comparability and target safety |
| **Observability** | Trace/log/metric instrumentation and health/telemetry contracts |
| **Compliance** | Organization-defined requirements, controls and auditable evidence |
| **Cost** | IaC plan cost estimates and engineering budgets |

**MVP priority:** repository posture plus security, testing/code quality and infrastructure assessments on **GitHub pull requests and CI**. Other stages and deeper domain checks arrive in deployable increments.

### Shift Left at each SDLC stage

| Stage | What Preflyt will help engineers do | Delivery |
| --- | --- | --- |
| **Developer laptop** | Run local checks before commit, sync organization policy, receive actionable feedback | V1 |
| **Repository** | Discover stack, find missing controls, apply repository engineering standards | MVP |
| **PR / CI** | Evaluate changes, import/run safe checks, publish evidence-backed quality gates | MVP |
| **QA** | Evaluate test coverage, API contracts, regressions and database migration compatibility | V1 |
| **Performance / staging** | Import and execute safe k6 workloads; compare baselines and performance budgets | V1 basic; advanced later |
| **Production feedback** | Trace escaped defects to revisions and recommend stronger earlier controls | V2 |

For detailed user journeys, triggers, check examples, stage contracts and performance workloads, see [Capabilities across the SDLC](docs/product/sdlc-capabilities.md).

## Built-in Engineering Standards Library

Preflyt ships with versioned, first-party engineering policy packs so organizations can start with established rules rather than authoring policies from scratch. The initial library covers Baseline Engineering, Application Security, Backend Services, Frontend Applications and Infrastructure as Code; further packs cover API, database, production readiness, performance and compliance as their assessment adapters mature.

During repository onboarding (P0), Preflyt recommends applicable packs based on detected technologies and allows an administrator to select Default, Recommended or Strict profiles. P1 maps existing CI evidence to the selected rules, P2 enforces deterministic policies through quality gates, and P3 introduces native approved scans. Unsupported and missing mandatory checks are never reported as passing.

See the [Engineering Standards Library](docs/product/engineering-standards-library.md) for pack contracts, governance, release tasks and acceptance criteria.

## Example: a pull request assessment

A developer opens a PR. Preflyt discovers changed paths and applicable organization standards, ingests CI evidence or executes eligible checks in an approved sandbox, then evaluates rules.

~~~text
Preflyt / payment-api / PR #184
Revision: <pinned commit>
Policy: production-readiness-v3

Security              PASS
Testing               PASS
Infrastructure        PASS
Reliability           BLOCK        Shutdown test failed
Performance           INCOMPLETE   Required benchmark not available

Engineering gate: BLOCK
AI explanation (optional): Request draining during SIGTERM needs review.

Developer action: Correct the failed check and rerun the assessment.
Preflyt does not modify source code as part of this workflow.
~~~

A quality gate is tied to a **specific commit SHA and policy version**. Passing old checks cannot automatically give a new commit a passing result.

### Gate semantics

- **PASS:** all mandatory applicable checks have trusted passing evidence.
- **WARN:** mandatory evidence is complete; only warnings remain.
- **BLOCK:** blocking policy violation or required check failure.
- **INCOMPLETE:** missing, stale, skipped, failed-to-run or untrusted mandatory evidence; **never silently green**.
- **NOT_APPLICABLE:** a rule formally does not apply under versioned criteria.

Quality-gate **enforcement** may start advisory before an authorized policy owner makes it merge-blocking. The gate is computed deterministically; AI never waives rules or invents successful tests.

## Planned user journey

1. An administrator signs in with the configured OIDC identity provider and connects selected GitHub repositories.
2. Preflyt constructs a **Repository Engineering Profile** from languages, test tools, manifests, CI, IaC and deployment evidence.
3. A policy owner chooses a **versioned engineering baseline** and configures check applicability and enforcement mode.
4. Every relevant PR/CI event creates a **revision-bound AssessmentPlan**.
5. Preflyt collects scanner/test evidence from CI or performs allowed checks in an independently approved isolation environment.
6. The platform normalizes findings and computes an **Engineering Readiness Report** and quality gate.
7. Optional AI explains observed issues and recommends engineering changes, clearly distinguishing facts and hypotheses.
8. Developers receive PR/dashboard feedback; changed code starts a new assessment rather than inheriting stale readiness.

## Architecture (proposed)

~~~mermaid
flowchart TD
  SCM["GitHub / CI (GitLab later)"] --> API["NestJS assessment API"]
  WEB["React + TypeScript UI"] --> API
  API --> DB[("PostgreSQL + Prisma")]
  API --> Q[("Redis + BullMQ")]
  API --> RULES["Versioned governance policies"]
  Q --> PLAN["Assessment planner"]
  PLAN --> CHECKS["External CI evidence / approved sandbox validation"]
  CHECKS --> RESULTS["Normalized findings and evidence"]
  RESULTS --> GOV["Deterministic quality-gate evaluator"]
  RESULTS --> INTEL["Optional TypeScript AI assessment worker"]
  INTEL --> LLM["LiteLLM -> frontier / local models"]
  GOV --> REPORT["Engineering readiness report"]
  INTEL --> REPORT
  REPORT --> API
  API --> SCM
  API --> OBS["OpenTelemetry / SigNoz"]
~~~

### Application stack

| Layer | Planned technology |
| --- | --- |
| Frontend | **Shadcn Admin source code pulled at a pinned commit and developed into Preflyt's React + Vite + TypeScript app**, with Tailwind/shadcn/ui and reviewed dependencies |
| API / control plane | Node.js + NestJS + TypeScript |
| Background execution | TypeScript workers; Redis + BullMQ |
| AI assessment | Read-only/advisory TypeScript worker; model-independent contracts |
| Model gateway | LiteLLM container; optional OpenAI, Anthropic, DeepSeek or local endpoints |
| Database | PostgreSQL + Prisma |
| Evidence / artifacts | S3-compatible object storage |
| Test and scanner execution | TypeScript controller, approved isolated Docker/Kubernetes backends |
| Scanners (candidate tools) | Trivy, Gitleaks, Semgrep CE, Checkov and repository-native tools; license review required |
| Monorepo | pnpm workspaces + Turborepo |
| Observability | OpenTelemetry; optional self-hosted SigNoz |

**AI is optional for core operation.** Preflyt can import checks, enforce policies and publish readiness without any frontier-model keys or local LLM.

## Deployment and OpenTelemetry configuration

**Required self-hosted installation contract (planned):** published versioned images, a root `.env.example`, and a complete Docker Compose deployment that starts all services necessary for the released feature set using `docker compose up -d`. The stack must include the frontend, API, PostgreSQL, Redis and relevant first-party workers/gateways/stores. No Node.js, pnpm, Redis or PostgreSQL host installation should be necessary. External services such as GitHub, OIDC and frontier models still require configured credentials/endpoints; do not claim a working deployment before manifests/images exist.

**Provider-neutral OpenTelemetry:** the root `.env.example` includes standard OTEL resource, endpoint/protocol, headers, traces, metrics, logs and sampling variables. Pass them to all app containers and override `OTEL_SERVICE_NAME` per service. Operators may send data to **any compatible OTLP APM**, with an optional self-hosted collector profile; SigNoz is not mandatory. See [OpenTelemetry environment contract](docs/deployment/opentelemetry-env.md).

## Security and execution safety

**Safe execution is an MVP prerequisite, not an advanced V1 feature.** Running package installation, test hooks, scanners, builds or other commands against a connected repository can execute untrusted code.

- For **real** connected repositories, Preflyt-run code requires an independently security-reviewed stronger sandbox boundary (e.g. dedicated hardened Kubernetes workers with gVisor/Kata or equivalent, after validation), controlled quotas, no production/model/Git write credentials, restricted network egress and audit evidence.
- If an approved executor is missing or fails admission, Preflyt **does not run repository code**. It may import existing CI evidence, but missing mandatory results stay **INCOMPLETE**.
- Local Docker-based execution is restricted to explicitly designated disposable test fixtures.
- The core Git integration does **not** require permissions to push branches, approve/merge PRs or edit code. Check/status publishing uses narrowly scoped permissions.
- Organization policies, report evidence and Git statuses must be revision-bound, auditable and resistant to prompt injection or stale result reuse.
- Source-code egress to external AI models requires organization-approved model/data policy; API keys remain server-side.

See [ADR-0002](docs/architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md) for the enforceable execution isolation baseline and a **separate optional future remediation specification**.

## Roadmap

| Stage | Priority | Outcome |
| --- | --- | --- |
| **Proof of concept** | One vertical slice | PR → repository profile → security/test/IaC assessment → deterministic gate → readiness report and GitHub feedback; **no code writing** |
| **MVP** | Core Shift Left platform | GitHub integration, policy baselines, assessment planner, safe validation/imports, findings, readiness, optional AI explanation, audit and reporting |
| **V1** | Broader lifecycle coverage | Reliability/observability/database/performance checks, design/pre-prod/developer entrypoints, GitLab, richer policies and exceptions |
| **V2** | Engineering intelligence at scale | More domain coverage, historical trend analysis, recurring issue patterns, organizational standards and integrations |
| **Optional future module** | Separately approved | AI-assisted code remediation or fix PRs; not required for Preflyt to deliver Shift Left value |

**Every engineering phase must be deployable and usable on its own.** The first usable release is a GitHub-connected **Repository Posture** view, not an empty backend. Subsequent slices add CI evidence, deterministic quality gates, approved scans, optional AI explanations, a local CLI, QA readiness, performance testing and production feedback, with each existing capability preserved.

The roadmap is directional, not a delivery promise. See the [phase-by-phase vertical-slice delivery plan](docs/roadmap/incremental-delivery.md) for P0–P11, implementation tasks, acceptance demonstrations, operations and rollback requirements; the [PRD](docs/PRD.md) defines product acceptance criteria.

## Proposed monorepo

The web application and pnpm/Turborepo workspace exist. Other application, service and infrastructure directories below remain planned.

~~~text
apps/
  web/                      # React / Vite assessment UI
  api/                      # NestJS control plane
services/
  assessment-worker/        # Planning, check orchestration and normalization
  execution-worker/         # Approved sandbox dispatch and artifact collection
  intelligence-worker/      # Optional TypeScript AI assessment service
  integration-worker/       # GitHub/GitLab and CI adapters
packages/
  contracts/                # Versioned API, check and evidence schemas
  database/                 # Prisma
  policies/                 # Rules, profiles, enforcement
  integrations/             # Provider and scanner adapters
  ui/                       # Shared React components
infra/
  compose/                  # Local evaluation (planned)
  helm/                     # Production deployment (planned)
docs/
  PRD.md
  architecture/
pnpm-workspace.yaml
turbo.json
~~~

## Documents and decision records

- [Product Requirements Document](docs/PRD.md): user journeys, validation domains, policy semantics, functional requirements and acceptance criteria.
- [SDLC capabilities](docs/product/sdlc-capabilities.md): laptop, repository, PR/CI, QA, performance/staging, production-feedback experience.
- [Engineering Standards Library](docs/product/engineering-standards-library.md): built-in versioned policy packs, adoption profiles and enforcement phases.
- [Incremental delivery plan](docs/roadmap/incremental-delivery.md): **independently deployable P0–P11 vertical releases**, implementation tasks and acceptance gates.
- [ADR-0001 — TypeScript-first application stack](docs/architecture/ADR-0001-typescript-first-stack.md)
- [ADR-0002 — MVP safe execution and optional remediation contract](docs/architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md)
- [ADR-0003 — OIDC human authentication](docs/architecture/ADR-0003-oidc-user-authentication.md)
- [ADR-0004 — Assessment and governance architecture](docs/architecture/ADR-0004-shift-left-assessment-governance.md)
- [ADR-0005 — Build Preflyt on the pinned Shadcn Admin source codebase](docs/architecture/ADR-0005-shadcn-admin-frontend.md)

## Development status

The pinned Shadcn Admin frontend is imported and tested. It currently displays upstream demo content; it is not a functioning Preflyt platform. See [source provenance and verification](docs/vendor/shadcn-admin.md).

Use Node 24.4.1 and pnpm 10.15.1:

~~~sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:browser:install
pnpm dev
~~~

Workspace checks: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, and `pnpm audit`. Contributions use issues and reviewable pull requests.

## License

**Preflyt's source license is not yet selected.** The licensing and redistribution requirements of third-party engines, rulesets, models and gateways must be reviewed before shipping or commercializing the platform.
