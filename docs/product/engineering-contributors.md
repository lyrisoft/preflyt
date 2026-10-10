# Engineering Contributors: activity and policy evidence

**Status:** Activity capture, scoped directory/profile UI and historical saved-standards compliance summaries are implemented. Published-policy adherence, confirmed findings and advanced trends remain planned. See [implemented subset](../operations/scoped-access-contributors.md).
**Delivery:** P1 data capture → P2 policy attribution → P3 usable Contributors UI → P10/P11 advanced trends. **Existing phase order unchanged.**

## Importing existing activity

The Contributors page header includes **Import GitHub activity** for users with repository-management access. It works with **All repositories** and a single repository scope. Imports run sequentially for authorized repositories, report per-repository failures and preserve partial-history warnings. **Refresh local data** only reloads saved observations; it does not contact GitHub. Imports are bounded to recent PR, review and commit pages and respect the server cooldown. Contributor activity does not create assessment snapshots or populate the Engineering Overview assessment chart.

## User experience and navigation

Add **Contributors** as a sidebar item under **Engineering**, adjacent to Repositories, Assessments and Findings, **when the P3 feature is usable**. Hide or explicitly mark unavailable before then; no dead-end placeholder.

- **Contributors list** (`/contributors`): searchable, filterable, paginated contributors from authorized GitHub installations and selected repositories. Summary metrics for active contributors, contributed repositories, assessed PRs, assessment coverage, and verified first-pass policy adherence. Charts show PR activity over time, assessments by outcome and finding categories. Filters: time window, repository, team (when supported), author/reviewer, bot/human, policy version. Display data freshness, denominators and gaps.
- **Contributor detail** (`/contributors/:id`): GitHub identity/avatar and link, member vs external/bot classification, contributed repositories, PRs authored/merged, commits and review participation, associated assessments, findings, first-pass/final adherence, assessment coverage and trends. Tabs: Overview, Repositories, Pull Requests, Reviews, Findings & Policy Evidence, Activity. Each metric drills into the underlying PR/check/revision and policy version.
- **Empty/incomplete states:** No contributors yet, insufficient GitHub permissions, unlinked GitHub identities, no completed assessments, unavailable statistics and out-of-date sync must be distinguishable. No invented scores or zero-as-success.

## Data and identity contracts

The accepted [GitHub-first access design](../architecture/ADR-0007-github-first-identity-and-organizations.md) uses separately verified GitHub login and organization membership. Contributor observations do not authenticate people or grant access. A link to a Preflyt account must use the same verified host/account ID; never infer it from email, Git author name or username. Member-directory selection and access grants belong in Access Control, not contributor analytics. This identity-linking change is pending implementation.

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

## Implemented profile compliance

Tabs sit directly below the profile filters. Only the Overview tab shows the dashboard, with a 70/30 desktop layout: daily contribution graph and four activity cards on the left, **Engineering policy compliance** in a 2×2 card grid on the right. The panels stack on smaller screens. The cards align in height on desktop. A Help button after Refresh opens a drawer containing calculation notes, data sources, counting rules and limits. Standards-version breakdowns remain with the compliance data. It reports required-check pass rate, complete-assessment coverage, PRs with failed required checks, and PRs needing evidence, within the selected period and authorized repository scope. Repositories, Pull Requests, Reviews, Policy Evidence, and Activity paginate 20 records per page within their returned local collections. Page state is URL-backed and resets when tabs or filters change. Pull Requests lists each PR once using its latest recorded activity. Policy evidence remains bounded to 200 returned PRs; a warning asks users to narrow filters when more records exist.

The current evaluator is a historical **saved engineering standards preview** in observe mode, not published-policy enforcement, current merge readiness or an individual performance score. It verifies each assessment hash and binds the contributor's authored PR to its stable object ID, number, repository and exact commit. Missing, unsupported, altered and ambiguous evidence never counts as passing. If the latest recorded head has no assessment, older results are shown as stale and excluded from the rate.

The pass-rate denominator is PRs whose latest recorded revision has results for every required rule (including known failures). Coverage divides this fully assessed count by all observed authored PRs in scope. Required-check failure and missing evidence can coexist; the card shows both. Percentages are unavailable when no complete assessment exists or collection limits are reached. Different saved standards selections are reported separately. The first-recorded metric uses the earliest complete assessment available for observed revisions in this window, only when it shares the latest assessment's standards selection; it is not verified lifetime first-pass adherence.

Evidence drill-down lists each PR, commit, required-rule counts, result and exact assessment link. No GitHub API calls are added to profile reads. Backend checks `contributors.policy_evidence.read` separately from activity access, and audits profile access. Existing collection/backfill bounds still apply; narrow filters when partial. Published-policy attribution, verified first-pass/final enforcement compliance and confirmed findings remain pending.

Filtered contributor details return an empty activity state when the contributor is known within the caller's authorized repository scope. Unknown identities and inaccessible repositories remain denied. Reconnecting a repository can recover activity from a verified replay when a retained receipt refers to a deleted repository record; receipts belonging to another live repository remain protected. Import audit metadata records newly captured activity and duplicate receipts.
