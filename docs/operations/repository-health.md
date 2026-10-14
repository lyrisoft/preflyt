# Repository Health operations

Health uses the existing API, integration worker, PostgreSQL and queue, plus a dedicated credential-free scanner service. Static scanning needs no repository approval, standards or mandatory CI workflow. The downloadable application Compose file does not currently provision the scanner service.

## Deploy and upgrade

1. Back up PostgreSQL using the existing [backup procedure](../../apps/docs/docs/self-hosting/upgrades-and-backups.md) before migration.
2. Apply additive migration `20261011220000_repository_health` with `pnpm --filter @preflyt/api prisma:migrate` (or the migration image for container deployments) and regenerate Prisma when building from source.
3. Deploy the matching API, worker and web image versions. PostgreSQL and the existing Redis/Valkey connection are required.
4. Explicitly select a new accessible repository, or start Health on one previously selected. Upgrade does not scan historical selections automatically.
5. Verify Queued → Running → saved report, branch/SHA, analysis limits, one completion notification and the Health deep link. No standards, policy or GitHub protection should change.

The `repository-health` BullMQ queue transports only persisted assessment IDs. A five-second recovery loop reconstructs eligible jobs from PostgreSQL. A 120-second fenced lease prevents duplicate completion; active native results are polled through deferred five-second leases. Health admits at most two running assessments globally and one per organization. Manual admission allows ten assessments per repository per hour and one active assessment per repository. Full reassessments also have a one-minute branch cooldown; category runs do not. These are code limits for this increment, not user-facing configuration requirements.

A 35-minute Health deadline requests cancellation of admitted native work. The existing native runtime has its own execution deadlines. Processing remains active until cleanup is acknowledged; it never claims a cancelled sandbox was removed merely because cancellation was requested. Turning off new native execution leaves cleanup reconciliation active.

## Analyzer qualification

The dedicated Health scanner pins tool images and verifies its fixed Docker isolation controls automatically. It does not require a signed runtime approval token or AI provider. General native command execution has separate prerequisites in the [native execution runbook](native-execution.md). Health never installs project dependencies or runs tests; it reads verified CI test and coverage reports.

| Default check | Adapter / license contract | Qualification and coverage |
| --- | --- | --- |
| secrets.scan | Gitleaks / MIT | Reviewed image/version/configuration; full-rule coverage is limited to recorded scanner scope. |
| security.sast | Semgrep CE / LGPL-2.1-only | Reviewed local rulepack and redistribution/license review; partial coverage. |
| security.dependencies | Trivy / Apache-2.0 | Reviewed offline database no older than 24 hours; partial coverage. |
| iac.policy | Trivy / Apache-2.0 | Reviewed configuration rules; partial coverage. |

Applicability is inferred from bounded GitHub tree inspection. Language/path recognition is not proof of complete analyzer coverage. All image, version, configuration and review identities are recorded in the frozen native plan. Existing source export and runner resource/size constraints remain in force. Large repositories or unsupported tools produce partial results.

An unavailable scanner fails the assessment with an explicit reason and next steps; it does not produce an empty successful scan. Historical inspection-only reports remain readable. Reliability, maintainability and duplication have bounded implemented static analyzers. Test results and coverage come from verified CI evidence; complexity remains unavailable. Category-only runs retain their exact branch and commit and always remain partial for repository-wide readiness. The graph excludes them from full-scan comparisons.

## Evidence and access

Health has separate immutable reports and synthetic `health:<assessment UUID>` execution selections. Native health receipts cannot create CI assessments or satisfy standards selection. Only these receipts may include sanitized finding projections. Each analyzer can retain up to 5,000 findings from an 8 MiB report, subject to the shared 8 MiB encoded signed-payload limit. Raw SARIF, tool logs, source and secret values are not stored in these reports or notifications. Suppressed findings are not counted; truncation makes completeness partial.

Read, reassess, source retrieval and notifications enforce the current organization and repository scope. Worker execution uses the requesting actor's current permissions. Permission or selection revocation blocks new source reads and requests cleanup. Source retrieval verifies commit, tree, regular blob mode and Git blob digest. Files above 256 KiB, trees above 10,000 entries, symlinks, submodules and binary files are unavailable for excerpts. Only the persisted finding's path may be requested; excerpts show at most 11 lines and 2,000 characters per line. Secret findings display bounded verified surrounding code, with matched secret lines and sensitive values redacted.

The report is pinned at source resolution, not when the user clicked. Branch head comparisons are cached for one minute. Portfolio freshness becomes unverified after that cache expires. Immutable history does not imply a background scan on every push. New reports compare complete retained findings within explicitly measured compatible rule-pack scopes; older reports require complete-report evidence; no-longer-reported is not proof of remediation.

## Diagnostics and rollback

`preflyt.repository.health` telemetry spans identify the assessment ID. Queue errors use the worker's existing sanitized warning path. Review failed/partial analysis reasons and native cleanup state before retrying. Notifications reuse the existing outbox, preferences, deliveries and live authorization filters.

To roll back, stop new requests, cancel active Health assessments through the authorized API/UI, and wait for admitted runtime cleanup before stopping its controller. Deploy the previous application versions together. Keep the additive tables and nullable columns; do not delete reports, policies or execution journals or reverse the migration during an application downgrade. The older application ignores these added fields. Test rollback on a disposable database and separately accept actual deployment/runtime cleanup.

## Release acceptance still required

- Independently qualify effective Docker/Kubernetes isolation and exact tool images/rules on the deployment architecture.
- Perform live seeded-defect and clean-repository assessments without CI. Record first-result latency, failure rate and resource use.
- Verify actual cleanup after crashes/cancellation and a full matching-image Compose upgrade/downgrade.
- Confirm source permissions, bounded findings and notification delivery in the deployed instance.

Local integration and browser tests are implementation evidence, not production isolation approval.

## Saved finding source excerpts

The additive `FindingSourceExcerpt` table stores bounded, redacted code snapshots separately from assessment evidence. Snapshot identity includes repository, commit SHA, path, reported line/range and excerpt version. Content hashes detect alteration. A first verified capture is retained without overwriting it on later visits; database backup and repository cascade deletion cover this table.

Assessment transactions queue at most 500 distinct locations without making GitHub calls. The existing event worker captures pending excerpts in bounded batches, shares in-flight file reads, and retries transient failures with backoff (at most three background attempts). Source failures do not change report completeness or gate results. Existing findings capture on first open; a later user visit can retry an unavailable excerpt after backoff. Source endpoints check current repository access on every response, including saved excerpts; they use `Cache-Control: no-store`. Secret findings use a separate versioned excerpt cache and redact matched secret lines before storage. Raw files, provider errors and credentials are not retained.

## Human hotspot review storage

Apply additive migration `20261012020000_hotspot_reviews` after a protected backup and regenerate Prisma. `RepositoryHealthHotspotReview` stores revision-scoped human decisions separately from assessment JSON and CI dispositions. Database checks enforce valid states, rationale limits, nonempty completed decisions, positive revisions and SHA/fingerprint formats. Repository and assessment foreign keys cascade when the parent is deleted. Review writes recheck current organization and repository finding-management permission inside the transaction, require a matching revision, and create an audit event with the note checksum rather than copying the note into audit metadata. Keep this table through application rollback; do not widen CI disposition states to accommodate hotspot decisions.


## Finding location validation

Before signing new native Health receipts, the controller checks each retained finding against the verified source bundle for the assessed commit. Reported paths must identify included regular files. Reported line ranges must fit the physical lines of UTF-8 source; an empty file, invalid text, missing path or out-of-range location cannot supply a valid code location. Duplication matching blocks undergo the same checks. Metadata-only findings may omit both path and line; no coordinates are invented.

Invalid rows are excluded while valid findings, original report checksum and summary counts are retained. The affected check becomes `INCOMPLETE` with `SOURCE_LOCATION_INVALID` unless another incomplete-analysis reason applies. This prevents a retained subset from being presented as a complete report. Historical reports are unchanged; source viewing still enforces current access and immutable commit verification.


### Versioned measured-scope finding history

New reports capture `findingComparison` version 1 for eligible measured Semgrep rule packs. A pack requires complete retained unsuppressed findings, successful cleanup, a non-incomplete outcome, valid report/tool/config identity, and a nonempty measured file scope without skipped candidates. Comparison binds the native-plan comparison key, pack IDs, tool/configuration and candidate/scanned file-set checksum. The graph explicitly names included packs; unrelated analyzer totals are not added. Overall report completeness and policy coverage are unchanged. Legacy reports preserve their complete-report comparison rule, and legacy/new metadata is not mixed.

Changed tool/configuration/file scope, scan errors, missing accounting and truncated finding sets prevent comparison. This enables truthful trends for the measured fixed packs without claiming complete repository health. Focused verification passed 39 API tests and 18 Health browser tests, with API/web typechecks and frontend lint passing. Other analyzer scope accounting and live qualification remain pending.


### Saved analyzer explanations

New native Health findings can retain plain-text rule descriptions and help from the exact uniquely matched SARIF driver rule. Each field is limited to 500 characters and remains inside the existing 5 KB per-check and 40 KB signed-receipt budgets. Ambiguous or mismatched descriptors, credential-bearing text and extra guidance fields are rejected. The detail page labels this as analyzer-provided advice from the saved report; it does not validate a defect, fetch report URLs or render HTML/Markdown. Truncated finding retention still makes the report partial.

Secret findings never retain scanner-provided explanations or help. They receive saved Preflyt general secret-detection guidance on secure review, revocation/rotation, removal and reassessment; this does not claim the exact detector or credential validity. Other findings without a supplied rule explanation retain the explicit unavailable state. Historical reports are unchanged.


### Coverage source decision: CI only

The user directed coverage to come from existing CI test runs, avoiding duplicated work. This supersedes the earlier opt-in manual test recipe scope. Health no longer exposes a coverage checkbox, and new `includeCoverage: true` requests receive a validation error. New static assessments do not select test execution. Historical stored choices and measurement evidence remain unchanged and are not called CI evidence.

The attempted Vitest manual-runner expansion was removed. Coverage must now use the existing authenticated GitHub/CI evidence path, ingest an actual bounded coverage report, bind repository/run/SHA and preserve source verification, denominators and history. A GitHub App connection or successful JUnit result does not establish coverage. The verified JUnit/LCOV ingestion described below is implemented locally; the companion Action coverage input is unreleased. Without matching evidence, the card shows unavailable coverage. Focused verification passed 32 API tests, 23 Health browser tests, API/web types and frontend lint. The browser focus was rerun successfully after a transient module import failure.

### Current CI coverage integration (October 2026)

Repository Health performs static analysis only. Test run requests and test settings/discovery endpoints are removed. Scanner admission excludes `tests.coverage`, including saved old execution plans. The general controller retains ownership-checked cleanup for pre-migration test containers; no new test container can be admitted.

CI generates JUnit and LCOV using its existing environment. Pipeline intake accepts an optional `tests.coverage` LCOV report without adding a policy check, changing required checks or affecting the gate verdict. Existing report limits, hash validation, workflow execution verification and signature validation apply. Coverage is projected separately from immutable Health reports and matched to repository, installation, commit, run and attempt. Superseded attempts are excluded. Missing proof, malformed LCOV, ambiguous reports and unverified execution do not establish coverage. Coverage reports never substitute for JUnit test execution evidence.

The companion Action has local unreleased `coverage-report` collection. A new release of that Action and deployment of these API changes are required before users can use it; v2.1.1 does not contain the new input. See the [user guide](../../apps/docs/docs/user-guide/repository-health.md) and [trusted signature setup](organization-signed-ci-reports.md). No push, release or workflow rerun was performed.

The worker prints safe `health.worker.processing`, `health.worker.fetching_source` and `health.worker.progress` events with assessment IDs. Scanner failures print fixed safe reasons. These are server terminal/container logs, not browser console output. Do not restart an active worker just to obtain logs. Raw repository command output and credentials are not logged.
