# Accumulated branch audit — 2026-10-12

## Scope and result

Reviewed the accumulated Repository Health, unified Findings, exact-commit source display, contributor activity and UI changes on `codex/p0-p3-phase-closure`. This was a code and local regression audit, not a production runtime qualification or an external penetration test. No blocking regression remained in the reviewed paths after verification.

Risk-focused review covered:

- Repository/organization authorization before report reads and after source retrieval; source cache identity includes repository, commit, path and coordinates.
- Commit/tree/blob verification, bounded redacted excerpts, unsafe/ambiguous traceback rejection and stable existing finding fingerprints.
- Health request idempotency, worker leases, tracked cleanup/cancellation, reviewed native receipts and separation from CI merge evidence.
- Overall health completeness/failure precedence, selected-branch portfolio selection and explicit missing evidence.
- Unified source/category filters, exact-report links, scoped contributor activity and author/committer deduplication.
- Shared status colors, compact filters, dropdowns, equal-height settings sections, supplied branding, source loading, and finding guidance accessibility.
- Schema/migrations, shared external Docker controller configuration for Compose/Kubernetes, scanner output bounds and documentation.

The final tooltip uses the same saved guidance as the inline panel, renders text without HTML, supports hover/focus/tap and Escape/outside dismissal, and stays within narrow viewports. The code-shaped skeleton respects reduced motion. Corrected outdated Findings documentation that still described the removed warning banner.

## Verification

- Full API regression: **145 files; 1,551 passed; 4 skipped**.
- Final full Chromium web regression, including the tooltip: **73 files; 479 passed**.
- `pnpm build`: API, web and documentation production builds passed. Web and documentation builds were repeated successfully after the final tooltip/documentation edits.
- `pnpm lint`: passed; final frontend lint passed again after the tooltip changes.
- `pnpm typecheck`: all three workspaces passed; final web build also includes TypeScript checking.
- `git diff --check` and staged whitespace checks passed.
- Live local saved JUnit finding verified at `test_catalogue.py:32`, commit `5266b4a5dcb0dd443eade1ab629262212fddb93d`: tooltip problem/solution, original source text and Escape dismissal confirmed. Screenshot retained with the task artifacts.
- Browser coverage includes hover, keyboard/tap, plaintext escaping, light/dark themes, 320px containment, source mismatch/access failures, scoped filters and contributor permissions.

The four skipped API tests are opt-in real Redis/BullMQ dashboard/notification checks (three) and an offline signed-attestation fixture requiring an explicitly configured GitHub CLI path (one). The final browser run logged the previously observed ResizeObserver notification-loop message, but all tests passed and the process exited successfully.

## Remaining release requirements

P5 is not production-qualified. Independent deployed runtime and analyzer reviews remain required before live connected-repository execution. The shared dedicated Docker controller configuration is prepared for both Compose and Kubernetes application deployments; this audit did not deploy or qualify a runner. No untrusted connected-repository code was executed.

Coverage remains CI-only by product decision. Manual coverage execution is rejected, and absence is displayed as a dash. Actual bounded, revision-bound CI coverage-report ingestion remains pending; a GitHub connection or a JUnit pass does not establish coverage. Broader scanner scope accounting and full-result retention remain documented P5 follow-ups. This commit does not change CI merge authorization or mark these requirements complete.
