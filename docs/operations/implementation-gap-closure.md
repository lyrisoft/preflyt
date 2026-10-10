# Implementation gap closure

Status: active, audited against source and executable checks on 2026-10-10. This ledger distinguishes implementation, generated-fixture acceptance and production acceptance. It does not renumber P0–P11 or substitute imported CI coverage for native scanner coverage.

## Completed implementation in this closure

| Gap | Result | Evidence |
| --- | --- | --- |
| GitHub rotating user credentials | Database-serialized refresh across service instances; encrypted persistence; transient outages preserve credentials and workspace sessions; onboarding uses refreshed expiry | Identity provider and GitHub login integration tests |
| Provider authorization revocation | Signed, idempotent user revocation clears provider credentials/evidence/challenges while preserving local sessions and installation history | GitHub login integration tests, including refresh/verification races |
| Relationship invalidation | Signed organization/team/member events invalidate installation authorization revision and imported team freshness; payloads never grant access | GitHub login integration tests, delivery reuse and foreign organization rejection |
| Missed-event reconciliation | Bounded worker authorization refresh and team snapshots under current original-importer authority | Identity and Teams integration tests |
| Findings lifecycle | Scoped assignment, In review, resolution notes and optimistic revisions tied to the exact saved finding/commit | Scoped HTTP integration and Chromium mobile/keyboard tests |
| Critical report alerts | Current exact-commit unsuppressed critical reports use the existing transactional outbox and scoped Security Engineer recipients | Governance notification tests; source-suppressed entries ignored |
| Organization baseline | One explicit baseline per organization, all selected repository scope, existing assignment/preview/approval flow | Teams integration tests; new repository scope fails closed until reviewed |
| Explicit standard upgrades | Previewed replacement preserves frozen history/checks/profile and creates new drafts; stale old sources cannot publish | Teams integration tests, old v1.0 compatibility and v1.1 upgrades |
| Legacy acceptance harnesses | Older integration suites own randomly named local databases and apply every migration; no shared application-data reset | Full API suite passed with notification Redis transport |
| Delivery verification | Read-only PR workflow runs both builds and full API/browser suites against disposable services; release image publication reuses the same verification job | Local suite results below; remote workflow execution remains to verify |
| Offline dependency database | Optional scanner image bundles vendor data; runtime independently rejects stale/missing/incompatible metadata and scans without network access | Generated vulnerable npm lockfile detected; freshness tests passed; dependency coverage remains partial |
| Documentation drift | README, Teams, identity ADR, notification and native/governance deployment statements reconciled with current source | Source review; historical phase order unchanged |

## Remaining work, in order

1. Finish nested team policy scope, reviewed time-bound exceptions and exception notifications. Preserve explicit scope expansion, strongest inherited requirements and independent authorization.
2. Finish explicit legacy identity linking/recovery while preserving historical actors and preventing self-approval through alternate identities. Never match by email or username.
3. Complete the supported native adapter matrix; maintain the implemented fresh offline database image; run isolated live Kubernetes lifecycle checks. Record independent effective-isolation review separately. Keep connected-repository execution disabled without valid review.
4. Run private-repository governance passing/failing/incomplete, drift and rollback acceptance with the organization-signed report route. Fork PR and merge-queue support remain explicit limitations until implemented and accepted.
5. Audit the stacked delivery PRs, full regression suites and versioned release/deployment verification. Local builds alone do not prove published image availability or production acceptance.

## Local migration record

Before application migration, saved a protected `0600` local database snapshot at `/private/tmp/preflyt-gap-closure-20261010-1791608690089.dump` (192444 bytes; SHA-256 `a7e22f566c24d3eb46545392bca076ed0b583bc5023a0dbdb7759c83b28f2d29`). This file may contain credentials and identities; retain it locally under operator protection and never upload it with source.

The additive `20261010050000_finding_lifecycle` migration creates Findings triage records, a unique organization-baseline index and assignment supersession timestamps. It does not delete/recreate repositories, installations, identities or assessment history. The migration was applied successfully to the local application database; all 43 migrations are current.

## Verification record

- Six focused API files: 77 tests passed before relationship invalidation was added.
- GitHub login and Teams suites passed, including signed relationship invalidation and explicit upgrades. The final login suite passed all 25 tests after adding refreshed onboarding-expiry coverage.
- Legacy webhook and notification suites: 38 passed, one optional real-Redis test initially skipped. The notification suite then passed all 20 tests with the local Redis transport enabled.
- Chromium Teams, Findings and badge suites: 18 tests passed.
- Full API regression: 99 files passed; 1,098 tests passed, two optional acceptance tests initially skipped. Both were then enabled: offline GitHub attestation verification and isolated real-Redis dashboard acceptance passed (29 tests across their two files). The CI workflow enables both.
- Full Chromium regression: 47 files passed; 263 tests passed.
- API and web release builds passed. The Chromium run emitted a ResizeObserver warning without failing tests; no connected-repository execution or production acceptance is claimed.

These are scoped implementation results, not a claim that all phase/release gaps are closed.

- Remote CI at `f14c268` passed API regression but caught an asynchronous browser download assertion. The assertion now waits for the actual request and download; the corrected remote run remains to verify.

- Offline dependency slice: four API files passed all 44 tests; the generated dependency vulnerability fixture produced the expected FAIL with network disabled. Skills catalogue Chromium tests passed all 16 tests after the asynchronous assertion correction. API typecheck passed.
