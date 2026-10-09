# Preflyt

**Engineering confidence before production.**

Preflyt is a **self-hosted, AI-native Shift Left engineering platform** under active development. It helps engineering teams detect and prevent security vulnerabilities, software defects, reliability failures and infrastructure risks **earlier in the software development lifecycle**, using continuous assessments, explicit engineering standards, policy-based quality gates and actionable developer feedback.

**Status: active implementation.** Repository profiles, CI imports, assessments, scoped access, contributors and versioned standards/policies are implemented. GitHub login, notifications, automatic readiness checks and managed ruleset activation require their documented deployment configuration. Native execution, AI providers/review skills and teams remain unfinished. A Kubernetes application bundle is locally verified; live deployment acceptance and the Operator remain pending. Source implementation does not mean a phase has passed live release acceptance.

| Capability | Implemented scope and remaining limits |
| --- | --- |
| Identity and access | GitHub login, verified owner onboarding, existing-workspace linking, member sync/grants and organization/repository permissions; OIDC and local Super Admin recovery remain available. Identity merging, provider revocation events, periodic reconciliation and automatic user-token refresh remain pending. See [GitHub setup](#github-sign-in-and-workspace-access). |
| Standards and policies | Five built-in packs, organization standard creation/versioned editing, explicit repository adoption, editable policy drafts, approval and publication. Unsupported checks remain incomplete; organization/team inheritance and new check adapters remain pending. See [Standards Library](docs/product/engineering-standards-library.md). |
| Assessments and CI | Signed PR/CI ingestion, durable worker, exact-commit assessments, imported checks and bounded JUnit/SARIF imports. Verified passing reports require reviewed execution contracts and supported signed proofs; arbitrary uploads do not establish a passing check. See [publication setup](docs/operations/github-check-publication.md). |
| GitHub governance | Manual and automatic readiness publication, single-repository ruleset approval/activation, drift verification and managed rollback are implemented behind default-off flags. Trusted signer deployment and live private-repository enforcement acceptance remain pending; broader organization targeting remains unfinished. See [production release gates](docs/deployment/github-governance-production.md). |
| Contributors and notifications | Scoped contributor profiles include saved-standards compliance and assessment coverage. Notifications cover assessments, policy publication, confirmed blocked/incomplete readiness and managed ruleset events; exception and critical-finding alerts remain pending. See [contributors](docs/operations/scoped-access-contributors.md) and [notifications](docs/operations/notifications.md). |
| Native validation and AI | Signed runtime preflight, exact-commit source verification, check planning and durable requests are implemented. Generated Docker scanner/test/IaC fixtures are verified. Durable Docker and Kubernetes dispatch, signed native results and native gate evaluation are implemented and fixture-tested; Kubernetes lifecycle verification uses a simulated API. Execution defaults off; complete adapter coverage and independently approved live acceptance remain unfinished. Organization AI connections and stage routing are implemented with encrypted keys and metadata-only tests in AI Intelligence. Inference, enforced usage budgets, skill runtime and advanced intelligence remain unfinished. See [AI configuration](docs/operations/ai-configuration.md). See [native limits](docs/operations/native-execution.md) and [review skills](docs/product/skill-based-code-review.md). |
| Deployment | Docker Compose, a [Kubernetes application bundle](deploy/kubernetes/README.md), migrations, backup/restore instructions and vendor-neutral OpenTelemetry are available in source. Kubernetes live acceptance remains pending. Published image availability must be verified; Kubernetes Operator, model gateway and approved native execution deployment remain pending. |

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
| **Engineering Intelligence Engine** | Explain findings, correlate risks and recommend improvements using organization-configured, SDLC-stage-routed AI; **AI never determines the gate result** |

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

**GitHub rulesets (P2 discovery and local drafts available):** Quality Gates → GitHub Rulesets lists repository and inherited rulesets, their GitHub state, branch patterns and required-check sources. The Drafts tab supports searchable branches, Standard/Strict/Custom profiles, server-generated previews and editable local drafts. Single-repository activation, independent approval, drift verification and managed rollback are implemented behind a default-off deployment flag and require a verified passing canary. Live enforcement acceptance remains pending. See [setup and limits](docs/operations/github-rulesets.md). Organization-wide discovery, resolved effective branch protection and broader targeting remain pending.

**GitHub organization ruleset management (remaining P2):** Verified Preflyt check integration, independent deployment approval and drift monitoring are implemented for managed single-repository rulesets. Broader organization targeting and live passing/failing/incomplete enforcement acceptance remain pending. GitHub remains the merge enforcement authority. See [GitHub Ruleset Management](docs/product/github-ruleset-management.md).

## Engineering Contributors

The **Contributors** module provides an authorized directory, activity charts, repository/time filters and profiles with PR, commit, review and exact-revision assessment links. Organization/repository permissions are enforced server-side. Profiles show assessment coverage and saved-standards compliance over verified historical assessment data, with missing/older evidence and denominators visible. Published-policy adherence, lifetime first-pass/final trends and confirmed findings remain pending. See [current implementation](docs/operations/scoped-access-contributors.md) and the [full Contributors specification](docs/product/engineering-contributors.md).

**Quality Gates:** historical observe-only previews are available for immutable assessment snapshots. Manual reviewed policy-aware GitHub check publication and read-back receipts are available; see [publication setup](docs/operations/github-check-publication.md). Passing publication requires reviewed pinned contracts and verified signed execution evidence. Repository-scoped automatic publication, independent ruleset approval, activation, drift verification and rollback are implemented behind deployment flags. Live acceptance remains pending; follow the production release gate before enforcing checks. See [Quality Gate Preview](docs/operations/quality-gate-preview.md).

## MVP product experience and implementation guardrails

The [MVP Product Experience Contract](docs/product/mvp-product-experience.md) defines the enterprise sidebar, top navigation, overview/dashboard, every MVP page, contributors drill-down, states and acceptance. The [Enterprise UI Guidelines](docs/design/enterprise-ui-guidelines.md) specify design consistency, and [Agent Implementation Guardrails](docs/agents/product-implementation-guardrails.md) guide Codex/Claude. These are **target specifications**, not claims that every page is already implemented.

## PR Code Quality and Skill-Based Review

Preflyt's PR assessment design includes code-quality evidence, a deterministic Code Quality policy pack and optional read-only AI reviews using **approved, pinned review skills**. Candidate methodologies include Ponytail and Thermo-Nuclear Code Quality Review, subject to third-party license/security review. AI cannot override quality gates. See [Code Quality Review](docs/product/code-quality-review.md) and [Skill-Based Review](docs/product/skill-based-code-review.md). These are phased requirements, not claims of shipped skill execution.

## Teams and Policy Inheritance

Preflyt will support GitHub-imported and Preflyt-managed teams, with versioned engineering standards/policies assigned at organization, team or repository scope. Team assignments cover administrator-approved policy-scoped repositories, with effective-policy previews and conflict handling. Imported GitHub team access does not grant Preflyt RBAC or automatically activate policy enforcement. See [Teams and Policy Inheritance](docs/product/teams-and-policy-inheritance.md). This feature is planned, not yet implemented.



Preflyt ships with versioned, first-party engineering policy packs so organizations can start with established rules rather than authoring policies from scratch. The initial library covers Baseline Engineering, Application Security, Backend Services, Frontend Applications and Infrastructure as Code. API, database, production-readiness, performance and compliance packs remain planned; they are not installed or executable today.

During repository onboarding (P0), Preflyt recommends applicable packs based on detected technologies and allows an administrator to select Default, Recommended or Strict profiles. P1 maps existing CI evidence to the selected rules, P2 enforces deterministic policies through quality gates, and P3 introduces native approved scans. Unsupported and missing mandatory checks are never reported as passing.

See the [Engineering Standards Library](docs/product/engineering-standards-library.md) for pack contracts and phases, and the [standards operations guide](docs/operations/engineering-standards.md) for the implemented P0 workflow and limits.

## Example: a pull request assessment

A developer opens a PR. Preflyt records its exact revision, ingests supported CI evidence and evaluates the saved policy. The target workflow also includes approved native scans, but native execution is available only through an explicitly enabled, independently reviewed Docker controller. Missing or partial check coverage remains incomplete; live runtime acceptance is still pending.

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

1. An administrator signs in with GitHub and connects the organization App installation. Preflyt verifies organization ownership and creates the matching workspace automatically; admins then grant existing GitHub members Preflyt roles and repository access. GitHub login and verified owner onboarding are implemented behind `GITHUB_LOGIN_ENABLED=true`; OIDC remains a compatibility option. Existing workspaces use explicit owner-verified linking; identities are never merged automatically.
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

**Production GitHub checks and governance:** follow the [production deployment guide](docs/deployment/github-governance-production.md) for separate App permissions, secret handling, GitHub plan requirements, signed reports, container configuration, migrations, acceptance and recovery. The local shared-App exception must never be used in production. Automatic enforcement requires explicit deployment flags, a verified passing canary and independently approved activation; production release still requires live acceptance.

**Self-hosted installation:** root `.env.example` and complete Docker Compose services are implemented for the released feature set. Build source images once, then start with `docker compose up -d`. A release workflow publishes versioned API/migration/web and separate native-controller images; publication and package access must be verified before using the prebuilt-image path. The current stack includes frontend, API, PostgreSQL, cache, queue and the GitHub event worker. Future gateways/stores are added with their feature releases. No Node.js, pnpm, Redis or PostgreSQL host installation is needed to run available images. External services such as GitHub, OIDC and frontier models still require configured credentials/endpoints; do not claim a working deployment before manifests/images exist.

**Provider-neutral OpenTelemetry:** the root `.env.example` includes standard OTEL resource, endpoint/protocol, headers, traces, metrics, logs and sampling variables. Pass them to all app containers and override `OTEL_SERVICE_NAME` per service. Operators may send data to **any compatible OTLP APM**, with an optional self-hosted collector profile; SigNoz is not mandatory. See [OpenTelemetry environment contract](docs/deployment/opentelemetry-env.md).

### Organization AI providers and SDLC routing

P0 adds organization-managed multiple AI providers, encrypted write-only credentials, connectivity tests and stage-specific primary/fallback routing with privacy and cost controls. P1 adds evidence-linked PR/CI explanations; P4 extends advanced intelligence. Model outages never alter deterministic gates. Connection setup and stage routing are implemented behind `AI_CONFIGURATION_ENABLED`, with separate Connections and Model routing tabs in AI Intelligence. Inference, spending enforcement, LiteLLM deployment and advanced review are not available yet. See [AI configuration](docs/operations/ai-configuration.md).

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

**Every engineering phase must be deployable and usable on its own.** The first usable release is a GitHub-connected **Repository Posture** view, not an empty backend. Subsequent slices add CI evidence, deterministic quality gates, approved scans, AI-assisted CI explanations, a local CLI, QA readiness, performance testing and production feedback, with each existing capability preserved.

The roadmap is directional, not a delivery promise. See the [phase-by-phase vertical-slice delivery plan](docs/roadmap/incremental-delivery.md) for P0–P11, implementation tasks, acceptance demonstrations, operations and rollback requirements; the [PRD](docs/PRD.md) defines product acceptance criteria.

## Proposed monorepo

The web application, NestJS API and pnpm/Turborepo workspace exist. The directory layout below is proposed. Current workers live in `apps/api/src`; Compose files and deployment assets are at the repository root and documented in the operations guides. The separate service/package/infrastructure directories below remain planned.

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
infra/                      # Proposed infrastructure layout
  compose/                  # Proposed directory; current Compose is at repository root
  helm/                     # Production deployment (planned)
docs/
  PRD.md
  architecture/
pnpm-workspace.yaml
turbo.json
~~~

**Access control:** Current Preflyt supports flag-gated GitHub login, OIDC compatibility and separate local recovery, with organization/repository-scoped RBAC. The accepted [GitHub-first design](docs/architecture/ADR-0007-github-first-identity-and-organizations.md) adds GitHub login, workspaces inherited from connected organizations and member selection/username grants. GitHub login, verified organization linking and member grants are implemented behind the login flag; legacy identity merging and provider revocation/reconciliation remain pending. Local Super Admin recovery and explicit Preflyt roles remain. P0 ships predefined roles and repository access grants; later phases extend permissions for assessments, policy enforcement, secure execution, AI providers, QA and performance. See [RBAC and authorization](docs/product/rbac-and-authorization.md).

## Documents and decision records

- [Product Requirements Document](docs/PRD.md): user journeys, validation domains, policy semantics, functional requirements and acceptance criteria.
- [SDLC capabilities](docs/product/sdlc-capabilities.md): laptop, repository, PR/CI, QA, performance/staging, production-feedback experience.
- [Developer CLI and IDE Extension](docs/product/developer-cli-ide-extension.md): P5 shared local engine, VS Code diagnostics, policy sync and developer automation.
- [Engineering Standards Library](docs/product/engineering-standards-library.md): built-in versioned policy packs, adoption profiles and enforcement phases.
- [Incremental delivery plan](docs/roadmap/incremental-delivery.md): **independently deployable P0–P11 vertical releases**, implementation tasks and acceptance gates.
- [ADR-0001 — TypeScript-first application stack](docs/architecture/ADR-0001-typescript-first-stack.md)
- [ADR-0002 — MVP safe execution and optional remediation contract](docs/architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md)
- [ADR-0003 — Legacy OIDC authentication](docs/architecture/ADR-0003-oidc-user-authentication.md)
- [ADR-0007 — GitHub-first identity and organization onboarding](docs/architecture/ADR-0007-github-first-identity-and-organizations.md)
- [ADR-0004 — Assessment and governance architecture](docs/architecture/ADR-0004-shift-left-assessment-governance.md)
- [ADR-0005 — Build Preflyt on the pinned Shadcn Admin source codebase](docs/architecture/ADR-0005-shadcn-admin-frontend.md)

## Development status

The current capability table above summarizes implemented source and remaining scope. Preflyt preserves its pinned Shadcn Admin foundation, existing theme/router, OIDC compatibility and separate local Super Admin recovery. Repository profiles record file evidence at exact commits; they do not prove tests or scanners ran. GitHub login/member grants, versioned organization standards, policy publication, automatic readiness checks and managed ruleset activation are implemented with their documented permissions and deployment flags. Native execution and P4 AI review remain unfinished; P2 live acceptance is still pending. See [repository profile limits](docs/operations/repository-profiles.md), [source provenance](docs/vendor/shadcn-admin.md) and the [delivery plan](docs/roadmap/incremental-delivery.md).

Use Node 24.4.1 and pnpm 10.15.1:

~~~sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:browser:install
pnpm dev
~~~

For the API, create `apps/api/.env` from `apps/api/.env.example`, configure PostgreSQL and the chosen sign-in method, then run `pnpm dev:api`. GitHub setup is described below. For legacy OIDC owner bootstrap, set `BOOTSTRAP_TOKEN_SHA256` to the SHA-256 hex digest of an out-of-band, high-entropy first-Owner token. Apply schema changes with `pnpm --filter @preflyt/api prisma:migrate`.

An optional local Super Admin break-glass login is available at `/super-admin/login`, separately from the organization SSO page. Set `SUPER_ADMIN_USERNAME` and a unique 24–128 character `SUPER_ADMIN_PASSWORD` in the API's deployment-managed environment. On startup, Preflyt seeds one Super Admin account and stores only a salted scrypt hash of the password. The account is rate-limited, audited and receives a 24-hour session. If OIDC is absent, valid configured GitHub login can provide routine access. If GitHub login is disabled too, a configured Super Admin permits recovery-only operation; OIDC sign-in and its legacy owner bootstrap remain unavailable. Partial OIDC configuration and failed OIDC discovery still stop startup. To explicitly recover from an IdP outage, remove all OIDC settings, keep the Super Admin settings, and restart the API.

To enable repository onboarding, configure the GitHub App ID, client ID/secret and private key in that API environment. Set the GitHub App **Setup URL** to `<API_ORIGIN>/github/setup/callback` and its OAuth callback URL to the exact `GITHUB_APP_OAUTH_CALLBACK_URL`. Leave “Request user authorization during installation” disabled; Preflyt starts a separate state/PKCE-bound authorization step and verifies that the installing GitHub user can access the returned installation. Repository discovery uses short-lived `metadata:read` and `contents:read` tokens. Member-directory reads use separate Members-read tokens; authorized readiness publication uses separate repository-scoped Checks-write tokens. Installation tokens are never persisted to the database or returned to the browser.

For container deployment, use the [Docker Compose runbook](docs/operations/docker-compose.md). The [Kubernetes application bundle](deploy/kubernetes/README.md) reuses the same application images with separate migration rollout and persistent storage; it is locally rendered and fixture-tested, not live-cluster accepted. **Preferred Kubernetes lifecycle direction:** Helm bootstraps the Preflyt CRDs and Operator; the Operator reconciles the application from a Preflyt custom resource. A direct application Helm chart may be offered as a fallback. The Helm/Operator packaging is planned, **not implemented**; the current plain manifest bundle does not claim Operator reconciliation. See [ADR-0006](docs/architecture/ADR-0006-kubernetes-operator-deployment.md).

Workspace checks: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, and `pnpm audit`. Track work in GitHub issues; development work is completed, audited and committed on `development`.

## License

**Preflyt's source license is not yet selected.** The licensing and redistribution requirements of third-party engines, rulesets, models and gateways must be reviewed before shipping or commercializing the platform.

## GitHub sign-in and workspace access

GitHub sign-in, verified first-Owner onboarding and username-based grants are implemented behind `GITHUB_LOGIN_ENABLED=true`. Existing OIDC and the separate local Super Admin route remain available. Access Control has **People**, **GitHub members**, **Roles & permissions**, and **Activity** tabs, with eight ready-to-use organization roles.

Before enabling GitHub sign-in:

1. Install the configured GitHub App in the organization and grant **Organization Members: Read-only**. Enable expiring user access tokens.
2. Register the separate login callback: `http://localhost:3000/auth/github/callback` locally, or `<WEB_ORIGIN>/api/auth/github/callback` behind the Compose proxy. Set `GITHUB_LOGIN_CALLBACK_URL` accordingly. Installation setup uses its existing separate callback.
3. Set the App ID, client ID, client secret and private key, plus a persistent `GITHUB_USER_TOKEN_ENCRYPTION_KEY` containing 32 random bytes encoded as base64. Keep this key server-side.
4. Apply database migrations, enable the login flag and restart the API. A verified GitHub organization owner can then create the matching workspace through sign-in and grant members access by username.

Existing workspaces can be linked through the Owner-verified Link GitHub organization flow. Identity merging remains separate; accounts are never matched by email or username. Signed membership/user revocation events, periodic reconciliation and automatic token refresh remain pending. Current access evidence expires after five minutes and privileged changes require fresh verification. GitHub sessions expire within eight hours and require sign-in again when their user token expires.

Super Admin can approve its own policy definition with an audited exception. Other publishers still need another authorized approver; organization/repository permissions remain required.

The GitHub members tab loads the active organization member directory, supports search and pagination, and provides **Sync members** and **Assign role** actions. Directory snapshots are cached for up to five minutes in Redis with a bounded local fallback; sync does not create identities or grant access. Assignment verifies active membership again before saving.

For GitHub-linked workspaces, **Grant access** uses a searchable member dropdown showing only users without active Preflyt access, including revoked members. Select the user, then choose a built-in role and repositories. Existing members are edited through their access record.

For a workspace that already has the GitHub App connected, use **Access Control → GitHub members → Link GitHub organization**. GitHub sign-in must be enabled and its callback registered first. The flow binds the request to the original authenticated workspace Owner session and verifies a GitHub organization owner before confirmation. It reuses the same internal organization and installation, preserves repositories, policies, grants and history, and grants that verified GitHub owner access with an audit record. It never moves an installation between workspaces or merges existing identities automatically.

### Assessment notifications

A persistent in-app assessment inbox is available behind `NOTIFICATIONS_ENABLED=true`. It includes the unread bell, repository/event/severity/date filters, read actions, and optional assessment alerts. Both API and worker need the same flag, the database migration, and the worker's Redis connection. See [notification setup and recovery](docs/operations/notifications.md). Policy-publication notices and opt-in SMTP email are available; email requires separate server configuration. Confirmed automatic blocked/incomplete readiness, managed ruleset activation/rollback and detected drift alerts are implemented behind the notification flag. Exception and critical-finding alerts remain pending.
