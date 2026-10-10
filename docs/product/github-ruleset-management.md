# GitHub Ruleset Management and Preflyt Quality Gate Integration

**Status:** P2 product requirement; first P2.R1 repository-scoped read-only slice and P2.R2 single-repository draft wizard implemented. The P2.R3 manual policy-aware publisher supports passing checks only with pinned execution contracts and verified signed evidence; see [publication limits](../operations/github-check-publication.md). Automatic publication and independently approved single-repository activation with verification/rollback are implemented behind default-off deployment flags. Live acceptance, broader targeting and the remaining R5 Insights scope are pending. Repository-scoped on-demand Insights now attributes detailed matching rules, paginates filtered history and charts current-page failures; retained snapshots and bounded background collection are implemented behind a default-off flag; bounded saved-history daily trends, previous-period comparisons and exact-commit assessment links are implemented; organization-wide comparisons remain pending. **No phase reorder.**

See [current ruleset setup and limits](../operations/github-rulesets.md) and the [production deployment contract](../deployment/github-governance-production.md).
**Related:** [MVP Experience](mvp-product-experience.md), [Engineering Standards](engineering-standards-library.md), [RBAC](rbac-and-authorization.md), [Roadmap](../roadmap/incremental-delivery.md).

## Purpose

Under **Governance → Quality Gates → GitHub Rulesets**, Preflyt provides a guided, safe-default workflow to inspect, preview, deploy and monitor GitHub organization rulesets. Preflyt policy packs define engineering evidence requirements; the **Preflyt Engineering Readiness** GitHub Check Run communicates the deterministic result; **GitHub rulesets** enforce merge protection. These are separate objects and authorities.

## Supported GitHub capabilities and caveats

GitHub REST supports organization ruleset listing, creation, update, deletion and history via `/orgs/{org}/rulesets`. Creation/update requires GitHub App **Organization Administration: write**, separate from normal repository assessment permissions. GitHub Team/Enterprise organization ruleset availability and enforcement options are plan-dependent. Check permissions and supported rule types at runtime.

**Critical API distinction:** GitHub REST uses ruleset enforcement values `active`, `disabled` and, where supported, `evaluate` (not Preflyt's Observe/Advisory/Enforce vocabulary). `evaluate` is not universally available. Never send a fabricated `pull_request` enforcement value; `pull_request` is a **rule type**, not the ruleset's enforcement mode.

**Required status check:** use a stable `Preflyt / Engineering Readiness` Check Run from the Preflyt GitHub App, bound to the exact assessed SHA (and correct PR merge-queue SHA when applicable). Required-check configuration must identify the expected source GitHub App where GitHub supports it. Before activating, verify installation permissions, check publishing and recent check availability, and that the name/source exactly match GitHub's configured requirement. GitHub Actions tests/scanners produce evidence; Preflyt evaluates it and publishes the consolidated check. An incomplete required assessment must **not** produce a successful check.

## Guided setup and safe defaults

Wizard: **Choose GitHub organization → Select repositories and branches → Choose profile → Map Preflyt policy packs and check → Preflight → Preview diff → Approve → Deploy → Verify**.

| Profile | Defaults | Activation |
| --- | --- | --- |
| **Standard** | PR required, one approval, required Preflyt check, no force pushes/deletion | Initially non-blocking if supported; explicit administrator approval to activate |
| **Strict** | PR required, two approvals, resolved conversations, required Preflyt check, no force pushes/deletion | Explicit approval and successful preflight |
| **Custom** | Granular GitHub rules and selected Preflyt gate/policy mapping | Show full diff and impact before deployment |

Profiles are recommendations; do not overwrite existing protection or assume every repository uses `main`. Use discovered default branches, explicit target refs, repository scope and exclude patterns. Check GitHub plan/permissions and conflicting inherited organization/repository rulesets. Avoid creating duplicate protections and distinguish managed from unmanaged rulesets.

**Preflight must verify:** permission and scope; GitHub plan/capability; valid rule schema and targets; matching installed Preflyt App and status-check source; a recent successful test PR/check publishing path; availability of mandatory evidence; impact on current open PRs; conflicts/duplicates; authorized approver; and safe recovery if the required check becomes unavailable. If checks cannot be verified, save a **draft** or a supported non-blocking configuration, **never activate**.

## UI requirements

Rulesets tab lists name, GitHub org, target repositories/branches, profile, GitHub enforcement state, linked Preflyt policy version, last sync, drift, owner and actions. Detail page includes rule configuration, exact required check name/source, target preview, current GitHub JSON snapshot, Preflyt desired JSON, diff, audit, history, deployment errors and rollback options.

**No one-click blind enforcement.** Approval is separate from preview. Sensitive organization-wide writes require `github.ruleset.manage` and `policy.enforcement.manage`, audited actor identity, and preferably independent approval for Strict/broad changes. Use a separately authorized GitHub governance connection; ordinary repository-read integrations must not inherit org administration privileges.

## Synchronization and failure semantics

- Track GitHub ruleset ID, installation, desired version, observed state, last sync and hashes; reconcile only **Preflyt-managed** resources. Importing unmanaged rulesets requires explicit adoption.
- On remote drift, alert and present diff; **do not silently overwrite** external administrator changes.
- Apply idempotent writes with rate-limit-aware retries; handle partial failures, permissions revocation, missing checks and unsupported plan gracefully.
- Rollback restores the prior recorded ruleset configuration **after checking current state**; do not delete unknown protections or claim automatic rollback of unrelated branch policies.
- Distinguish GitHub check `success`, `failure`, `neutral`, `skipped`, `queued/in_progress`; map Preflyt PASS/WARN/BLOCK/INCOMPLETE so **only eligible passing decisions satisfy the required gate**. WARN can pass only if policy explicitly permits it; INCOMPLETE stays non-passing.
- GitHub rulesets remain the enforcement authority; Preflyt does not merge PRs or bypass other required reviews/checks.

## Ruleset detail: Insights tab (P2.R5)

Under **Governance → Quality Gates → GitHub Rulesets → [Ruleset] → Insights**, show **real GitHub rule-suite evaluations** and, separately, linked **Preflyt Engineering Readiness** assessments. The two sources must never be silently combined into one pass percentage.

**GitHub API:** `GET /orgs/{org}/rulesets/rule-suites` lists organization rule suites; `GET /orgs/{org}/rulesets/rule-suites/{rule_suite_id}` returns individual rule evaluations with `rule_source.type`, `rule_source.id`, `enforcement`, `result`, `rule_type` and details when available. The list supports `ref`, `repository_name`, `time_period` (hour/day/week/month), `actor_name`, `rule_suite_result`, `evaluate_status`, and pagination. **It does not offer a ruleset-ID filter.** Associate a suite to this ruleset only through the matching detailed `rule_evaluations[].rule_source.id`; a suite may contain multiple rulesets or branch protection evaluations. Exclude unrelated evaluations from this ruleset's counts. Organization endpoints require GitHub App **Organization Administration: write**. Repository rule-suite endpoints can instead be used with repository Administration: read for authorized per-repository views. Detect permissions and GitHub plan limitations.

**Overview metrics:** rule-specific evaluation count, passed, failed, bypassed, and **evaluation-mode failures separately**. Show time window, repository scope, last synchronized time and source. Do not assume suite-level `result` equals this particular ruleset's result. For ruleset-specific totals, aggregate matching rule evaluations and document whether counting unique suites or rule occurrences; do not sum both. Bypass classification requires care: preserve suite-level bypass and individual rule outcomes, avoid falsely attributing bypass to a ruleset if the detailed response cannot establish it. Mark unknown/unattributable rather than inventing counts.

**Visualizations:** evaluation trend by day/week, most frequently failing rule types, repositories with most matched failures, bypass/exception activity when attributable, and linked Preflyt gate outcome trends in a **separate labeled panel**. Provide filterable/paginated evaluation history with repository, branch, actor, commit, rule type, result, details, timestamp and a source link. Drill into raw evidence and related Preflyt PR assessment only where an exact repository/revision association exists.

**Data lifecycle:** bounded, rate-limit-aware incremental ingestion with idempotent suite ID + rule-source IDs, raw provenance, fetched-at and freshness; API windows extend only through month, so longer historical charts require Preflyt-owned retained snapshots and a documented retention policy. Respect organization/repository RBAC and avoid leaking private actor/repository information in aggregates.

**Empty/error states:** no evaluations in selected period, ruleset disabled, evaluate mode only, permission denied, API throttled, partial pagination, stale sync and insufficient attribution. Do not render zero evaluations as 100% compliance.

**P2.R5 acceptance:**
- [ ] Matching evaluations from two rulesets in the same rule suite are attributed correctly, without double counting.
- [ ] Rule-specific metrics reconcile to the visible filtered history and selected time window.
- [ ] Pass/fail/bypass and evaluate-mode semantics remain distinct; unsupported attribution is labeled unknown.
- [ ] An evaluation drills down to its specific failed rules and GitHub evidence; Preflyt quality-gate metrics remain separate.
- [ ] GitHub permissions/rate limits and incomplete sync are handled with explicit freshness/coverage warnings.
- [ ] An unauthorized user cannot access ruleset evaluations for private repositories.

**References:** https://docs.github.com/en/rest/orgs/rule-suites and https://docs.github.com/en/rest/repos/rule-suites

## P2 independently usable increments

| Increment | Deliverable |
| --- | --- |
| **P2.R1** | Read-only ruleset discovery, current protection and effective scope display |
| **P2.R2** | Standard/Strict/Custom profiles and repository/branch targeting wizard |
| **P2.R3** | Stable Preflyt check publisher and preflight verification against real PR/Actions evidence |
| **P2.R4** | Authorized preview, approval and deployment through GitHub organization ruleset API |
| **P2.R5** | Sync status, drift detection, audit, safe rollback and **ruleset-specific Insights** using GitHub Rule Suites |

Each increment must be deployable and useful independently. R1 works with read access permitted by GitHub; privileged deployment requires explicit GitHub organization Administration write permission. R3 must be operational **before** requiring the check in R4.

## Acceptance criteria

- [ ] Read and display real organization rulesets with source, scope, enforcement, plan/permission limitations and last sync.
- [ ] Safe-default profile wizard produces valid GitHub API ruleset JSON; exact branches and repositories are previewed.
- [ ] Preflyt check is published under stable identity for a real PR SHA, including failure and missing-evidence behaviour.
- [ ] Enabling a required Preflyt check fails closed if check publisher or mandatory evidence is not ready.
- [ ] Active ruleset blocks a failing/incomplete PR; allows passing PR only if all other GitHub protections pass.
- [ ] Unauthorized actor or insufficient GitHub App permissions cannot deploy or modify rulesets.
- [ ] Existing unmanaged rulesets are not overwritten or deleted; drift is detected and presented for review.
- [ ] Audit, retry, rollback and rate-limit behaviour are verified on a test organization.
- [ ] No application code or ruleset has been deployed by this documentation change.

**GitHub reference:** https://docs.github.com/en/rest/orgs/rules and https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
