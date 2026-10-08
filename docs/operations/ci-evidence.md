# Imported GitHub CI status evidence (P1.2a)

Selected repositories now show an **Imported CI evidence** panel in the existing profile screen. Configure signed [GitHub events](github-events.md) and run the separate worker. New processed `check_run` and `workflow_run` deliveries create immutable observations in PostgreSQL. Pull-request events do not create CI evidence. Already-processed historical deliveries are not automatically backfilled; retained event history remains available.

## API and provenance

`GET /github/repositories/:repositoryId/ci-evidence` returns the latest 50 received observations. Optional `?sha=<full-40-character-commit>` restricts results to that exact revision, case-insensitively. Requests require an active session and a selected repository with an active installation; selection/access changes deny history. Results are uncached with `Cache-Control: no-store`. The profile supports the same exact-SHA filter and refreshes every ten seconds while ingestion is enabled. Received ordering is observation history, not a claim about the latest provider state or current PR head.

Every observation retains its signed delivery ID, installation/repository IDs, exact SHA, source kind/object ID, action, provider status/conclusion/timestamp, received/imported times, format version, delivery digest and evidence SHA-256. The signed delivery digest is SHA-256 of the event name followed by the original request bytes, matching inbox acceptance. Evidence hash is SHA-256 of UTF-8 `JSON.stringify` of the ordered v1 projection in `ci-evidence.ts`, using decimal-string IDs, ISO timestamps and explicit nulls; imported time is excluded. These hashes support traceability and integrity comparison, not independent proof that CI tests executed correctly. Webhook bodies, output text, credentials, arbitrary URLs and logs are not retained in status observations. Separately uploaded [CI artifacts](ci-artifacts.md) retain bounded original report bytes privately, with distinct unverified provenance.

## Provider result vocabulary

| Result | Meaning |
| --- | --- |
| SUCCEEDED | Provider reported completed/success |
| FAILED | Provider reported completed/failure, timed_out or startup_failure |
| PENDING | Queued/running/waiting/requested/pending, or a check rerequest |
| NOT_EXECUTED | Provider reported completed/skipped |
| UNKNOWN | Missing/inconsistent state, cancellation, neutral, stale, action_required or unsupported conclusion |

A rerequest can contain the previous completion and success; it always records PENDING. Cancellation can follow partial execution, so it is UNKNOWN rather than a claim that nothing ran. Provider success is **not Preflyt PASS**. `qualityGate` is null: there is no policy evaluation, assessment coverage, execution-environment verification, artifact validation or source-control check publication in this slice. GitHub source object IDs identify observations; policy check identities/tool versions remain future evidence enrichment.

## Processing, deployment and rollback

Inbox claim, evidence insertion and processing audit commit in one transaction. Delivery ID uniqueness and compare-and-set processing prevent replay/concurrent duplication. Evidence failure rolls back the claim so existing retries can recover. Late deliveries and new commits create separate observations; they never overwrite prior evidence or establish current branch readiness. Access revoked before processing produces ignored deliveries without evidence.

Apply the additive `imported_ci_evidence` migration and regenerate the Prisma client before running the new API/worker. It creates an enum/table/indexes only; it modifies no existing application rows. Existing Compose migration/startup flow covers this. Evidence is tied to its inbox delivery; operator deletion of retained inbox records cascades their evidence. Back up PostgreSQL and plan retention together. Rollback to a compatible older API/worker preserves the added table; no schema reset is needed.

Verification is scoped to provider-result mapping, signed ingestion, transactional rollback, duplicate processing, SHA isolation, late observations, access revocation and the separate worker. Frontend checks cover types and lint; browser tests are intentionally skipped. A live GitHub CI run remains the operator demonstration. Bounded administrator-associated [JUnit/SARIF imports](ci-artifacts.md) are available separately. Manual exact-SHA [assessment snapshots](assessments.md) freeze selected rules and explicit unverified associations. The worker also creates automatic exact-SHA snapshots for repositories with adopted standards. Automatic provider artifact retrieval and trusted coverage mapping remain subsequent slices.

Provider semantics: [GitHub webhook payload reference](https://docs.github.com/en/webhooks/webhook-events-and-payloads).

Outbound GitHub reads use [shared pacing and rate-limit cooldowns](github-rate-limits.md); local evidence/assessment history does not consume the GitHub API budget.
