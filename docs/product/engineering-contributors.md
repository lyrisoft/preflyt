# Engineering Contributors: activity and policy evidence

**Status:** Activity capture, scoped directory and profile UI implemented; verified coverage, adherence, findings and advanced trends remain planned. See [implemented subset](../operations/scoped-access-contributors.md).  
**Delivery:** P1 data capture → P2 policy attribution → P3 usable Contributors UI → P10/P11 advanced trends. **Existing phase order unchanged.**

## User experience and navigation

Add **Contributors** as a sidebar item under **Engineering**, adjacent to Repositories, Assessments and Findings, **when the P3 feature is usable**. Hide or explicitly mark unavailable before then; no dead-end placeholder.

- **Contributors list** (`/contributors`): searchable, filterable, paginated contributors from authorized GitHub installations and selected repositories. Summary metrics for active contributors, contributed repositories, assessed PRs, assessment coverage, and verified first-pass policy adherence. Charts show PR activity over time, assessments by outcome and finding categories. Filters: time window, repository, team (when supported), author/reviewer, bot/human, policy version. Display data freshness, denominators and gaps.
- **Contributor detail** (`/contributors/:id`): GitHub identity/avatar and link, member vs external/bot classification, contributed repositories, PRs authored/merged, commits and review participation, associated assessments, findings, first-pass/final adherence, assessment coverage and trends. Tabs: Overview, Repositories, Pull Requests, Reviews, Findings & Policy Evidence, Activity. Each metric drills into the underlying PR/check/revision and policy version.
- **Empty/incomplete states:** No contributors yet, insufficient GitHub permissions, unlinked GitHub identities, no completed assessments, unavailable statistics and out-of-date sync must be distinguishable. No invented scores or zero-as-success.

## Data and identity contracts

Capture installation-scoped stable GitHub user IDs, login/display name, bot classification, membership visibility, repository scope and timestamps. Store separate author, committer, PR author, reviewer, co-author and merge actor relationships. Identity matching must not conflate same-name Git authors, private membership, bots or former organization members. GitHub App access bounds what can be reported; never claim complete organization membership or activity outside installed repositories.

Ingest signed PR/review/push/check events with idempotency and revision correctness. Use bounded GitHub API backfill for existing data, installation-level rate-limit budgets, retries and incremental aggregation. Store provenance and last sync; no unbounded historical scraping.

## Metrics and interpretation

- **Contribution activity:** authored/open/merged PR counts, reviewed PRs, attributed commits and participating repositories. Counts are descriptive, **not a measure of employee productivity**.
- **Assessment coverage:** eligible PRs with complete required evidence / all eligible PRs. Show numerator, denominator, time range and scope.
- **First-pass policy adherence:** first fully assessed eligible PR revisions passing required checks / first fully assessed eligible PR revisions; show separate incomplete/never-assessed counts.
- **Final adherence:** latest fully assessed eligible PR revisions passing / latest fully assessed eligible PR revisions, with separate stale/unknown coverage.
- **Findings:** confirmed findings on associated PR revisions, grouped by severity/domain and resolved before merge. Findings are not automatically attributed as an individual's fault.
- **Review activity:** count reviews by event and distinct reviewed PRs, without treating approvals as code quality.
- **Comparability:** when policy versions or required-check coverage change, segment metrics or label trends non-comparable. No opaque AI-generated individual performance score or automatic employee ranking.

## RBAC, privacy and governance

- Add `contributors.read`, `contributors.activity.read` and `contributors.policy_evidence.read` permissions, scoped by organization and repository.
- Developers see only authorized repositories and their contributors; Auditor receives scoped read-only access. Organization-level aggregates must not reveal unauthorized private repositories.
- Administrative access to organization-wide contributor analytics is explicit. Respect data retention, subject access and deletion requirements; provide configurable aggregation windows and audit sensitive access.
- AI may explain aggregate engineering friction or recurring policy gaps but cannot make personnel judgments or change enforcement based on contributor scores.

## Phase-aligned deliverables

| Phase | Independently useful addition |
| --- | --- |
| **P1** | Capture PR authors, reviewers, commits and contributor identities with provenance alongside CI evidence; expose verified associations on PR assessment details |
| **P2** | Link deterministic gate outcomes and evidence coverage to authored PR revisions; show first-pass/final outcomes on PR detail |
| **P3** | Deliver working **Contributors** sidebar page, searchable list, summary metrics, charts and contributor detail with repository/PR/review/assessment drill-down |
| **P10–P11** | Add authorized team-level aggregates, historical trends, advanced policy comparisons and engineering improvement reporting |

**P3 acceptance:** a connected repository with seeded contributor/PR/check fixtures shows correct list, charts and profile drill-down; filtering changes all metrics consistently; unauthorized repository activity never appears; missing evidence is not treated as compliant; bots and private/unlinked identities are labeled accurately; activity metrics are reproducible from source records. Existing P0–P3 release workflows must remain usable.
