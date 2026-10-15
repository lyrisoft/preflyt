# Available Health history and maintainability — 14 October 2026

## Changes

Health history now includes completed executed scans with retained findings or a recorded analyzer count, even when their overall analysis is partial. Inspection-only and missing-count reports are omitted rather than converted to zero. Each observation has its own bar, partial-coverage label, UTC timestamp, commit and original-report link.

A separate comparison series uses the existing strict comparison contract. Changed tool/configuration/file scope, skipped files, incomplete outcomes and suppressed/truncated evidence cannot become comparable points. Null comparison values break the line. Repository/branch authorization, the displayed report cutoff and the 30-report window are unchanged.

Maintainability expands from three to seven fixed Preflyt rules. New low-severity findings cover nested JS/TS ternaries, redundant JS/TS rethrows, Python wildcard imports and redundant Python exception handlers. Each has specific explanation, remedy and limitations. Existing rules and receipt validation remain intact. Configuration hashes separate the new rules from earlier coverage; old reports and guidance are not rewritten. Counts represent detected patterns, not an overall maintainability grade.

## Local verification

- 52 focused API tests passed: report normalization/history, measured coverage equivalence, guidance, integration authorization and history cutoff. The additional final coverage-change assertions passed in the 16-test report suite.
- 55 browser tests passed across Health, shared statuses and the chart. Mixed coverage, report navigation, disconnected comparisons and 320px light/dark layouts are covered.
- All 16 real-scanner fixture cases passed for static security, reliability, maintainability and hotspots, using seeded/clean JS/Python and TypeScript. Clean catch/rethrow blocks with logging and explicit imports do not trigger the new rules.
- API and web TypeScript checks and focused ESLint passed.
- The idle local scanner was restarted after all journal entries showed complete cleanup. Its signed package was accepted by the application client. Future reassessments use the new rules; no connected repository was rescanned during this change.

No push, GitHub Actions run or remote deployment was performed.
