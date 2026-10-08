# Engineering Overview

The dashboard preserves the Shadcn shell and presents a compact view of recorded engineering evidence. It uses PostgreSQL read models through `GET /github/dashboard`; loading or refreshing the page does not call GitHub or run repository code.

## Scope and metrics

An authenticated member can select all available, selected repositories or one selected repository. This follows the deployment's existing shared repository visibility; organization switching and organization membership isolation have not been implemented. An unavailable, revoked or deselected repository filter returns 403. Filters persist in the URL.

Choose the last 7, 30 or 90 calendar days, including today. Snapshot timestamps use UTC, and future timestamps are excluded from activity. Counts are aggregated in PostgreSQL rather than calculated from a paginated sample.

| Metric | Definition |
| --- | --- |
| Repositories | Currently selected, available repositories under active installations in the selected repository scope. |
| PRs assessed | Distinct `(repository, PR number)` pairs with recorded PULL_REQUEST assessment snapshots during the selected period. Multiple snapshots for one PR count once. |
| Assessment snapshots | All recorded immutable assessment rows during the selected period, including manual and CI/PR-triggered snapshots. |
| Standards adopted | Repositories with a stored standards selection, divided by selected repositories. Adoption is not verified policy coverage. |
| Snapshot recorded / no assessment yet | Repositories with or without any historical assessment snapshot. These all-time counts are independent of the activity period. |

These metrics count records, not successful checks. They do not verify assessment integrity, execution coverage or current branch readiness. Blocked PR counts, open findings and verified policy coverage remain null in the API. No synthetic gate outcomes, risk scores, trend percentages or platform health are displayed.

## Activity heatmap

Each calendar square represents a UTC day. Shade intensity represents the number of assessment snapshots: none, 1–2, 3–5, 6–10, or more than 10. Missing days have zero recorded snapshots; padded days outside the period are blank. Tooltips and accessible button labels provide exact counts and dates. Selecting a square displays its daily count. Activity is separate from readiness.

The heatmap is most useful on Engineering Overview for assessment cadence and gaps, and can also be reused for an individual repository's history. It uses locally recorded Preflyt activity, not a GitHub user's contribution or productivity score.

## PR attention and repository posture

The PR table shows up to 10 most recently updated tracked open PRs in the selected repository scope. PR state is the last synchronized record, not a live GitHub query. Missing current context, stale confirmations, unsupported fork heads, missing standards and unverified execution have distinct reasons. A row opens the repository's Assessments tab, where its tracked PR context and applicable snapshots can be inspected. No row implies a blocking gate or certified risk level. PR attention is current recorded state, not restricted by the activity date filter.

Repository posture displays the latest recorded language/framework hints, policy profile, latest snapshot timestamp and explicit unevaluated readiness. Profiles may be partial. The table shows up to 10 repositories; the selector and Repositories page provide access to the rest.

## Cache and freshness

Redis stores summaries for 30 seconds. Keys include identity, GitHub App configuration, repository filter, UTC day, period and a digest of live repository selections, installation identifiers and access revisions. Every request checks current repository access before cache lookup. A selection or installation-access change immediately changes the cache scope. Concurrent identical cold requests share one local build.

Redis failure, malformed JSON or expired summaries fall back to PostgreSQL. The response uses `Cache-Control: no-store`; the frontend uses credentialed, abortable fetches and a 15-second TanStack Query freshness window. The dashboard shows its generation time. Refresh reads the local summary and may use an unexpired Redis result; it does not force GitHub synchronization.

## Verification

Task-scoped tests cover authenticated read-only access, real PostgreSQL aggregate queries, distinct PR counting, date windows, repository selection/revocation, Redis cache scope and expiry, prerequisite reasons and UTC calendar behavior. TypeScript, changed-file lint/format and the web production bundle are also checked. Browser tests remain skipped by user instruction. Tests use a dedicated disposable PostgreSQL database; the development database and user-run API are not restarted or modified.
