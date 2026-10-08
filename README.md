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
| Automated checks | Run configured scanners and existing project test commands | MVP |
| AI investigation | Correlate evidence, diagnose root causes, report confidence and uncertainty | MVP |
| Investigation workspace | View evidence, model usage, run history, and recommended next steps | MVP |
| Remediation | Apply bounded code changes in an isolated sandbox | V1 |
| Validation and fix PR | Rerun required checks; open a human-reviewable remediation PR | V1 |
| Policy enforcement | Repository/organization rules and approval requirements | MVP → V1 |
| GitLab integration | Additional source-control and CI provider adapter | V1 |
| Engineering intelligence | Retrieve approved historical fixes and incident patterns | V2 |
| Specialized agents | Reliability, security, infrastructure, database, performance agents | V1 → V2 |

**Initial emphasis:** diagnosing and reproducing failed CI jobs on TypeScript/Node.js and Python repositories. Security and static analysis provide supporting evidence; autonomous fixes come after safe sandboxing and validation are proven.

## Proposed user experience

1. An administrator connects a GitHub organization using scoped credentials.
2. The administrator selects repositories, sets model/data policies, and enables workflows.
3. A PR or failed CI job generates a signed event.
4. Preflyt collects relevant diffs, test failures, and scanner output; creates a finding and investigation.
5. An AI investigator proposes a hypothesis with evidence and, when enabled, reproduces the failure in an isolated execution job.
6. In remediation mode, an agent generates a bounded patch. The platform reruns the configured validation suite.
7. Preflyt opens a **separate fix PR**, linked to the original finding, for developer review. The platform never self-approves or auto-merges.
8. Audit events and approved outcomes become available for reporting and later engineering knowledge retrieval.

## Architecture (proposed)

~~~mermaid
flowchart TB
  SCM["GitHub initially / GitLab later"] --> WH["Webhook & integration API"]
  UI["React / TypeScript UI"] --> API["NestJS control-plane API"]
  WH --> API
  API --> DB[("PostgreSQL")]
  API --> STORE["S3-compatible artifacts"]
  API --> ORCH["Workflow / task coordinator"]
  API --> POLICY["Policy decision layer"]
  ORCH --> EXEC["Execution adapter"]
  EXEC --> SCAN["Scanner & test jobs"]
  EXEC --> SANDBOX["Ephemeral agent sandbox"]
  ORCH --> AGENT["Python AI agent service"]
  AGENT --> LLM["LiteLLM model gateway"]
  LLM --> EXT["Optional frontier models"]
  LLM --> LOCAL["Optional private inference"]
  SCAN --> API
  SANDBOX --> API
  API --> GITWRITE["Restricted Git write service"]
  GITWRITE --> SCM
  API --> OTEL["OpenTelemetry / SigNoz"]
~~~

**Technology direction (subject to technical spikes):**

| Layer | Preferred approach |
| --- | --- |
| Frontend | React + TypeScript |
| Backend/control plane | NestJS + TypeScript |
| AI agent runtime | Python; evaluate OpenHands SDK and mini-SWE-agent behind an adapter |
| Model routing | LiteLLM, with API-key-backed frontier models and optional local inference |
| Workflow engine | Start simple with durable jobs; Argo Workflows for Kubernetes-scale execution |
| Sandboxes | Ephemeral Docker containers for trusted local development; hardened Kubernetes Jobs for production |
| Database | PostgreSQL |
| Evidence and artifacts | S3-compatible object storage |
| Technical checks | Trivy, Semgrep Community Edition, Gitleaks, Checkov, and project-native test tools (subject to licenses) |
| Policies | Deterministic rules; evaluate OPA as policy complexity grows |
| Observability | OpenTelemetry; SigNoz as an optional self-hosted backend |

**Execution isolation:** containers alone are not a security boundary for malicious repositories. A production design must use dedicated worker isolation, resource ceilings, restricted egress, and ideally a sandbox runtime such as gVisor or Kata Containers. Code-execution jobs must not receive model API keys, repository write credentials, or production secrets.

## Deployment targets

- **Local / evaluation (planned):** Docker Compose for API, UI, PostgreSQL, model gateway, and local execution worker.
- **Production (planned):** Helm/Kubernetes for control-plane services and short-lived, isolated scanner/test/agent Jobs.
- **AI inference:** supply credentials for supported external models, point to a local model endpoint, or disable AI until configured.

> **There is no install command yet.** No Compose file, Helm chart, API, or application source has been committed. Do not interpret this README as evidence that Preflyt can be deployed today.

## Proposed repository layout

The following is a **target structure**, not a listing of currently implemented files:

~~~text
apps/
  web/                    # React product UI
  api/                    # NestJS control plane
services/
  agent-runtime/          # Python agent adapter and investigator
  execution-controller/   # sandbox dispatch and collection
packages/
  contracts/              # schemas and API/event contracts
  policies/               # shared policy definitions
infra/
  compose/                # development deployments
  helm/                   # production deployment charts
docs/
  PRD.md                  # product requirements
  architecture/           # ADRs and threat model, later
~~~

## Roadmap

- **MVP — Detect and explain:** GitHub repository onboarding, PR/CI event processing, scanner and test result ingestion, findings, AI CI investigation, read-only dashboard, audit trail, basic policy and model configuration.
- **V1 — Verified remediation:** hardened execution sandboxes, bounded agent code editing, reproducibility checks, regression validation, developer-reviewed fix PRs, GitLab integration.
- **V2 — Engineering intelligence:** specialized agents, accepted-fix retrieval, cross-repository trends within tenant boundaries, advanced custom workflows, performance/reliability insights.

This is a planning sequence, not a release-date commitment. The [Product Requirements Document](docs/PRD.md) defines requirements, acceptance criteria, constraints, and open decisions.

## Security and data handling

- Verify webhook signatures and process events idempotently.
- Use least-privilege GitHub/GitLab integrations; separate read access from patch/PR writing.
- Store API keys in a server-side secrets system; never embed them in source, logs, prompts, or agent sandboxes.
- Enforce organization and repository boundaries across database queries, artifacts, logs, knowledge retrieval, and executions.
- Treat repository contents, CI logs, issue text, and tool output as **untrusted prompt input**.
- Gate sending source code to external models on administrator-approved data policies.
- Require human review, protected branches, and independent passing checks before merge.
- Preserve redacted, tamper-evident audit records and bounded artifact retention.

## Development and contribution status

This repository is at the **product definition stage**. Before accepting implementation PRs, maintainers plan to define coding standards, contribution guidelines, CI checks, secret-scanning rules, and a license.

Use reviewable feature branches and PRs; do not assume undocumented environment variables or setup commands exist. See [docs/PRD.md](docs/PRD.md) for the initial acceptance criteria and MVP definition.

## License

**Not yet selected.** Preflyt's own source license will be decided before implementation or redistribution. Third-party scanners, model gateways, SDKs, model weights, and rule packs have separate licenses and terms; each must be reviewed before bundling or commercial distribution.
