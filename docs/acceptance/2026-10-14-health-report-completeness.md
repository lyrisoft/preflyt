# Health report completeness and diagnostics — 14 October 2026

## Delivered

Static Health reports previously hit 256 KiB artifact limits, small receipt budgets and a 1 MiB report mount. Duplication also exhausted the fixed container memory budget and could construct invalid ranges from unrelated clone windows. Semgrep silently inherited default test-directory exclusions.

Health now accepts bounded 8 MiB reports, up to 5,000 supported findings per analyzer and an 8 MiB encoded signed payload. Its temporary report mount is 64 MiB. General CI/native import limits are unchanged. Larger signed receipts survive scanner journal recovery. Any truncation preserves measured totals and remains explicit.

Duplication uses a bounded numeric token store, validates clone continuity and source ranges, and runs within the existing one-CPU/2-GiB container controls. Generated folders, declarations and minified JavaScript are excluded from its stated scope. Semgrep scans test files with fixed image-owned rules and explicit dependency/build exclusions. Safe, checksum-bound parser diagnostics include file and line without raw scanner messages or source.

Recognized secret detectors now have useful titles, potential-impact severity and remediation guidance. Credential values and surrounding source stay hidden. Pattern matches do not prove a credential is live.

## Live local acceptance

Used the normal authenticated Reassess flow for `lyrisoft/maiguard-api`, branch `main`, commit `6d3a4faa9c421e40e5422afe121f0f59fc3efe07`. Assessment `4b3cc602-b5cd-42d5-8de8-f38e6fb5ecb6` completed at `2026-10-13T23:40:51.650Z` (14 October 00:40 GMT+1), with an executed, verified scanner report.

| Analyzer | Result | Reported / retained findings |
| --- | --- | --- |
| Secrets | Findings reported | 83 / 83 |
| Static security | Incomplete parser coverage | 0 / 0 |
| Dependencies | Findings reported | 145 / 145 |
| Reliability | Incomplete parser coverage | 132 / 132 |
| Maintainability | Completed | 0 / 0 |
| Duplication | Findings reported | 3,981 / 3,981 |
| Hotspots | Completed | 0 / 0 |

Five of seven analyzers completed. The combined report contains 4,145 deduplicated, unsuppressed findings. Category metrics show security at least 228 and reliability at least 128. Duplication is 41,373 / 529,683 analyzed lines (7.8%), across 2,750 files and 2,383 clone pairs. The repository tree has 3,676 discovered files; source selection remains bounded and explicit.

Browser acceptance confirmed the saved metrics, expandable parser diagnostics, meaningful secret title/severity, exact commit/path/line, recorded date, credential redaction and verified analyzer receipt.

## Remaining limits

Semgrep 1.179.0 reports partial parsing at:

- `performance/app/src/components/HelpPanel.jsx:151` (static security).
- `api/src/services/adminAssist/adminKnowledgeGraphService.js:104` (reliability).
- `api/src/services/intelligenceProduct/generated/runtime/client.d.ts:1972` (reliability).

These are still incomplete; this change does not claim to repair Semgrep's parser. Valid findings remain available. The report exposes these locations instead of a generic unavailable result. History excludes incomplete reports. Test coverage remains unavailable without matching measured evidence; this task did not add test execution. Fixed rule-pack coverage remains narrow and documented.

## Verification

- 200 targeted API tests passed, including capacity, receipt integrity/budget, container controls, source reads, journal recovery and compact-store bounds.
- 30 repository Health UI tests passed.
- API and web TypeScript checks passed; changed UI files passed ESLint.
- Container parity fixture matched the pinned clone engine for ordinary valid clones; full exact-commit scans verified large-report handling and duplication results.
- Final audit added a defensive guard omitting a diagnostic line when its path is unavailable; JavaScript syntax check passed. The local scanner was restarted to load it. The live assessment above predates only this null-path guard.
- No source modifications to the assessed repository, repository tests/scripts, GitHub Actions runs, pushes or remote deployments were performed.
