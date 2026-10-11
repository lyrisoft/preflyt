# P5 — Repository Health Assessment

**Status:** Approved phase scope; planned, not implemented.
**Approved:** 2026-10-11. Inserted after P4; former P5–P11 become P6–P12 without changing their scope or progress.
**Related:** [Roadmap](../roadmap/incremental-delivery.md), [SDLC capabilities](sdlc-capabilities.md), [native execution](../operations/native-execution.md), [implementation acceptance ledger](../operations/implementation-gap-closure.md).

## Product goal

Users get meaningful value when they add a repository. Preflyt automatically assesses their selected branch and reports actionable security, reliability, maintainability and code-quality findings. Users do not need a CI workflow, pull request, scanner installation or manual first assessment.

CI is the optional next step for continuous feedback, PR checks and explicitly activated merge protection. Repository health is an analysis report about a revision; it does not grant merge permission or claim a production release is safe.

“Immediate value” means analysis starts immediately in the background with visible progress. It does not promise an instantaneous scan or a fixed duration before runtime and repository measurements exist.

## Existing foundation and readiness

Reuse repository selection/profiles, PostgreSQL/Prisma, Redis/BullMQ, native request/dispatch services, approved adapters, evidence validation, normalized findings, notifications and scoped authorization. Extend the existing API, worker and UI; do not introduce a separate assessment microservice, database or orchestration framework.

The existing native runtime has fixture-tested dispatch and evidence contracts. Independent isolation qualification and production runtime acceptance remain prerequisites for executed analysis, as tracked in the linked operations documents. This phase does not declare those prerequisites complete.

When no approved runtime is available, return a useful inspection-only partial report with the unavailable analyses and operator action stated clearly. Never execute repository code in the API/general worker or attach a privileged Docker socket to an application container. Inspection alone cannot satisfy the executed-analysis release acceptance gate.

## User journey and safe defaults

1. Connect the GitHub App and explicitly select accessible repositories.
2. Preselect each repository's default branch; allow the user to choose another accessible branch without extra scan configuration.
3. Persist the branch choice. Queue the initial assessment once and show Queued, then Running, in the repository's Health view.
4. Resolve and freeze the branch SHA when execution starts. Discover applicability and run only qualified analyzers under the approved runtime.
5. Publish the basic report as results finish, showing completeness, findings, skipped/unsupported analyses and evidence. Notify the authorized user of completion, partial results or failure, linking to the report.
6. Offer Reassess and an optional Enable continuous checks action. Reuse the existing CI setup review/PR flow when chosen.

Recommendations are analysis defaults, not automatically published policy. Preserve existing standards, policy pins, model routes and GitHub protections. Existing installations must not unexpectedly queue every historical repository: provide an explicit initial enablement/selection action with visible scope.

## Independently usable increments

| Increment | Deliverable | Acceptance demonstration |
| --- | --- | --- |
| **P5.1 Automatic first assessment** | Branch persistence, idempotent background admission, qualified analysis, progress, basic report and notification | Fresh selected repository without CI produces a revision-bound report; seeded issue and clean fixture behave correctly; unavailable runtime gives an honest partial report |
| **P5.2 Health dashboards and findings** | Organization Overview, repository health inventory, default repository Health view, finding drill-down and supported metrics | Counts reconcile to accessible reports and evidence; partial/stale reports stay visible; unsupported metrics are explained |
| **P5.3 Reassessment and history** | Authorized bounded manual reassessment, branch freshness, immutable report history and comparable trends | Advanced branch marks old report stale; reassessment creates a new report; incompatible tools/configuration do not produce misleading improvement trends |

Each increment is deployable and useful on its own. P5.1 must include the basic report and notification rather than depending on the later dashboard increment for first value.

## Page changes

### Overview

Make organization health the primary content: repositories assessed, queued/running assessments, open findings by severity, and repositories with incomplete, stale or failed assessment results. Show a list of repositories needing attention with branch, assessment date and links to findings.

Security, reliability and maintainability counts use only supported analyzer classifications. Keep PR/CI activity clearly separate; move the activity heatmap below actionable health. Do not use assessment volume as a proxy for health.

### Repositories

Keep the inventory and access/selection controls. Make the primary inventory display repository, selected assessment branch, analysis status, last report, freshness and findings by severity, with View report and authorized Reassess actions. Connection/install statistics remain secondary.

Never hide a repository merely because no report exists. Display Not assessed, Queued or the actual failure/partial state with a next action. Preserve search, pagination, permissions and existing deep links.

### Repository details

Open Health by default for the new experience. Show supported findings and metrics, inspection/execution limits, branch and exact assessed commit, freshness and report history. Preserve Standards, Assessments and CI activity as distinct views; old links still resolve. Existing check-configuration labels retain their definitions and are not repurposed as scanner outcomes.

Use existing PageHeader, SurfaceIcon, StatusBadge and PageHelpDrawer. Help must explain severity, finding classifications, coverage, completeness, freshness, counting rules and CI's separate role. Support loading, empty, error, permission-denied and partial results, keyboard access and responsive layout.

## Analysis scope and qualification

Start with qualifying the existing Gitleaks, Semgrep and Trivy adapters for applicable repository analysis. A currently available adapter is not automatically qualified for every language or repository. Publish a supported language/tool/rule matrix and verify licenses, pinned versions and deployment availability before enabling a tool by default.

ESLint, TypeScript, Ruff, OSV, Checkov, actionlint, duplication and complexity metrics are candidates for later qualified increments. Do not advertise them as implemented or automatically execute package scripts, install repository dependencies, run tests or build images under a static-analysis default. Executable project checks require separate approved scope and isolation.

Each enabled adapter needs seeded defects and clean fixtures, stable expected file/line locations, output validation, reproducible version/configuration identity and negative tests. Tool crash, timeout, skipped scope or malformed output must never become “zero issues” or “healthy.” Suppress/redact detected secret values from UI, logs and notifications.

A report can contain useful findings while incomplete. Zero findings means only that the recorded analyzers found none within their recorded scope; it is not proof that the repository has no defects.

## Contracts and evidence

Persist an assessment target (organization, repository, branch), job/request identity, pinned SHA, analysis plan/version, applicability, adapter identity/version/configuration, isolation approval, timestamps, artifacts/checksums, per-tool outcomes and validated findings. Reuse existing immutable evidence and finding contracts; add only fields/records needed for aggregate repository health.

Validate schemas, bounded output and repository-relative file/line references before ingestion. Quarantine invalid artifacts; record tool failures separately. Findings carry stable fingerprints for deduplication and compatible history. Keep report evidence immutable when a finding is assigned or reviewed.

Separate source-analysis coverage (files/languages actually analyzed, with exclusions) from policy/check evidence coverage. Each percentage needs an explicit denominator; unavailable coverage is unavailable, never a fabricated zero or 100%.

Verified execution means the recorded analyzer ran under the verified contract. It does not independently prove exploitability or defect correctness. Distinguish analyzer-reported potential issues, separately validated findings and AI hypotheses. AI may explain and prioritize under existing routing, consent, egress and budget rules, but cannot create authoritative scanner evidence or change deterministic gates. AI unavailability cannot block the base report.

No arbitrary A–E grade or blended health score. Coverage, duplication, complexity and trends appear only when a qualified source supplies meaningful measurements and comparable scope.

## Lifecycle, orchestration and authorization

Track processing state separately from report completeness and freshness:

- Processing: Queued, Running, Completed, Failed or Cancelled.
- Report completeness: complete or partial, with per-analysis reasons; an Incomplete label explains missing expected analysis.
- Freshness: current or stale relative to the selected branch's known head, with check time. Provider unavailability makes freshness unverified, not current.

Use durable BullMQ admission with transactional idempotency, bounded per-repository/organization concurrency, leases/retries, timeouts, cancellation and cleanup. Duplicate selection events or retries must not create duplicate jobs or completion notifications. Revalidate repository access and approved runtime at execution and report access. Revoked access must prevent new source retrieval and execution.

Changing the target branch creates a new target assessment; it cannot relabel an old report. Branch advancement during execution leaves the pinned report intact and marks freshness appropriately. Do not add a full scan on every push in P5's initial default. Manual reassessment is rate-limited; broader schedules and cross-repository drift remain P12.

Reuse the notification outbox, dedupe and authorization filtering. Notifications identify repository, branch, commit, outcome and next action. APIs must enforce organization/repository scope; unauthorized users cannot start jobs, see evidence, enumerate findings or receive notifications.

## Verification and release gates

- Fresh App-connected repository without CI: selection and branch choice start one job; qualified seeded analysis produces findings, basic report and notification.
- Clean fixtures, unsupported stacks, invalid output, crashes, timeouts and unavailable isolation produce accurate outcomes and limits.
- Verify branch/SHA freezing, branch change/advance, retries, duplicate events, cancellation, access revocation and cross-organization denial.
- Prove immutable evidence, correct locations, redaction, deduplication, notification links and comparable-history rules.
- Prove automatic assessment leaves standards, published policies, AI routing and GitHub protection unchanged; existing CI gates retain exact-revision semantics.
- Validate updated Overview/Repositories/Health counts, help, pagination, responsive layout, accessibility and existing deep links.
- Deliver additive migrations, clean Compose deployment, runtime configuration/qualification, health/telemetry, bounded resource use, backup and tested rollback without deleting earlier reports or policies.
- Record actual first-result latency, failure rates and resource cost from live acceptance. Fixture success is not production runtime qualification.

Implementation begins with a current-code audit and a scoped P5.1 plan. No phase completion, production scan availability or user-facing onboarding claim is implied by this specification.
