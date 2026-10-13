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

## Follow-up: finding guidance and branch consistency

A later audit found that the portfolio priority-finding list selected the newest assessment even when the displayed repository health came from the selected branch. It now uses the same selected assessment as the health status. A saved analyzer description that only repeats its remediation is no longer presented as a separate problem explanation; existing saved reports get the same display guard. Tests cover both cases.

Final presentation changes use regular muted text for the problem statement and effect, preserving stronger section headings. After all presentation edits, the focused finding details Chromium suite passed **18 tests**, frontend typecheck and targeted lint passed, and the working diff had no whitespace errors.

When the organization's repository AI route is enabled, permits source sharing, and has a ready provider, a user with `ai.review.run` can request a compact explanation from the finding and bounded, redacted code at the assessed commit. The result is cached against the exact finding, source excerpt, route and provider revisions; requests and worker processing recheck repository access. The output must be short, contain distinct problem/effect/solution fields, cite supplied line numbers and pass validation. Previously generated longer guidance is superseded by the v2 cache key. The page uses AI guidance first when a valid result is saved, marks it with a violet sparkle icon, and otherwise retains the analyzer/rule guidance. AI never changes the saved finding or merge result.

Live local verification on the saved `test_catalogue.py:32` finding at commit `5266b4a5dcb0dd443eade1ab629262212fddb93d` showed a short, conditional problem/effect/fix generated by the configured DeepSeek model. It correctly said the excerpt did not include the `find_product` implementation and advised inspecting that implementation at the assessed commit; the report source remains marked as not independently verified. The new guidance table migration was applied to the local Preflyt database. The accumulated regression after the AI changes passed: **147 API files, 1,571 passed and 4 skipped; 74 Chromium web files, 487 passed; full lint, typecheck and API/web/docs builds passed**. The subsequent sparkle icon change is covered by a focused frontend regression.
