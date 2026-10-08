# Bounded CI report imports (P1.2b)

Owners, Admins and Super Admins can import UTF-8 JUnit XML or SARIF 2.1.0 reports from the existing repository profile's **Imported CI evidence** panel. Choose **Import JUnit** or **Import SARIF** on a completed check/workflow observation. No navigation or theme changes are required. Signed CI observations still require the separate webhook worker.

## Association and trust

An upload is associated with the observation's server-derived repository, installation and exact source revision. The caller cannot supply a different revision. This slice does not download GitHub artifacts or independently prove that the uploaded report came from the associated CI run. All imports are permanently classified `ADMIN_ASSOCIATED_UNVERIFIED`. Administrator association and a valid digest are not verified CI provenance. Report counts, reported scanner execution success and provider success are never a Preflyt PASS; `qualityGate` remains null.

Each immutable record retains original UTF-8 bytes, their SHA-256, format, parser version, observation ID, uploading identity ID, creation time, trust classification and an allowlisted summary. Observation provenance and exact SHA remain available through the linked signed delivery. JSON responses and the UI expose summaries/digests only, never test names, paths, messages, commands, logs or original report bytes. Original reports may contain sensitive content: restrict PostgreSQL/backup access and include these records in evidence retention. These bounded small reports are stored in PostgreSQL in this slice; larger/automatic evidence imports require scoped object storage.

## API and limits

`POST /github/repositories/:repositoryId/ci-evidence/:deliveryId/artifacts` accepts:

```json
{ "format": "junit", "content": "<testsuite tests=\"0\"/>", "sha256": "<SHA-256 of exact original UTF-8 content bytes>" }
```

The route requires an active Owner/Admin/Super Admin session, the exact configured browser origin, selected repository, active installation and completed CI observation. Its source SHA is resolved from stored evidence. SHA-256 includes any BOM, whitespace and line endings. `content` must decode losslessly as UTF-8; declared non-UTF-8 XML encodings are rejected. Limit: 256 KiB original bytes and ten unique reports per observation, within the existing 1 MiB HTTP JSON body limit. Heavily escaped JSON can reach that HTTP limit earlier. Unknown body fields are rejected. Identical observation/format/digest uploads are idempotent, including concurrent requests; duplicates at quota return the existing record. New imports and a digest-only audit commit atomically. Responses use `Cache-Control: no-store`.

The existing authenticated `GET .../ci-evidence` returns nested artifact summaries, restricted by current repository selection/installation access. There is no raw report retrieval or deletion route in this slice. History display is limited to the latest 50 observations; use the exact SHA filter to inspect a revision.

## Supported parsing

JUnit accepts a `testsuite` root or a `testsuites` container, nested suites, named testcases and explicit `failure`, `error` or `skipped` children. Counts are calculated from actual testcases; declared tests/failures/errors/skipped counts, when present, must match. Conflicting outcomes, unsupported case status/result attributes, unknown structural children, invalid XML, DTDs and entity declarations are rejected. External entities are not resolved or expanded. Parsed counts do not prove complete coverage or successful execution. Empty and all-skipped reports do not establish a passing assessment.

SARIF validates the complete vendored OASIS 2.1.0 errata01 JSON schema offline. URI/date format annotations are not validated, fetched or used as trusted destinations. Results are counted by explicit level; absent levels are unknown rather than inferred from rule defaults. `suppressed` counts only results with an explicitly accepted suppression. Missing results/invocations or external property-file references mark the summary partial. Execution is REPORTED_FAILURE if an invocation reports failure, REPORTED_SUCCESS only with all supplied invocations successful and no detected partial report, otherwise UNKNOWN. None of these establish coverage, verified execution or a policy gate. Tool names/versions and finding normalization remain subsequent work.

Parser bounds: XML/JSON nesting 32, XML tokens/JSON value nodes 20,000, JUnit containers 1,000, testcases/results 5,000, SARIF runs 100. Limits intentionally reject large/unsupported reports rather than silently truncate them. Error responses contain fixed validation messages, not raw parser errors or report text. Parser v1 is retained for reproducibility.

Schema source: [OASIS pinned schema](https://github.com/oasis-tcs/sarif-spec/blob/adbb670c018335b0f384e6dd8819f4ea055d7ee1/sarif-2.1/schema/sarif-schema-2.1.0.json). Original schema SHA-256 and source commit are recorded in `sarif-schema.ts`; upstream license terms are preserved alongside it. Schema loading never requires a runtime network connection.

## Deployment and validation

Apply additive migration `20261008230000_ci_artifacts` and regenerate the Prisma client before using the new API. No existing application rows are changed. Deleting retained inbox/evidence records cascades their artifacts, so plan retention and backups together. Rollback to the preceding API preserves added records/table; do not reset the database.

Focused verification covers parser rejection/redaction/integrity bounds and actual PostgreSQL API transactions: role/origin checks, selected/revoked/wrong repository access, immutable original bytes, exact revision derivation, concurrent replay, quota and audit rollback. Frontend verification uses type/lint/format checks; browser tests remain skipped. Automatic provider artifact retrieval/provenance verification, normalized finding occurrences and assessment planning remain subsequent slices.

[Evidence validation](evidence-validation.md) now freezes report integrity and missing execution-trust prerequisites in new snapshots. Invalid evidence is explicitly marked INVALID; administrator uploads remain unverified.
