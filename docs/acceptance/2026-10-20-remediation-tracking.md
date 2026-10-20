# Repository remediation tracking — 2026-10-20

Implemented per-category remediation comparisons on repository Health history. Each bar retains that assessment's observed counts; complete comparable scanner runs additionally show remaining, new and no-longer-reported findings. Identity sets are compared in PostgreSQL without loading source excerpts or full finding bodies into the browser.

Partial runs never receive disappearance credit or replace the complete baseline. Changed coverage/configuration starts a new baseline. AI-only reviews remain advisory; ignored and human-classified results do not close scanner findings. Comparisons are scoped to the organization, repository and branch and remain bounded to available history. Existing assessment access checks are preserved. No schema or saved-evidence mutation is required.

The chart includes partial-result warnings, dashed partial columns, per-run comparison details in tooltips and accessible chart data, and responsive category/history controls. Monthly reporting and automatic finding closure are outside this change.

Verification: 74 API tests across remediation, report and repository integration suites passed, including identity additions/removals, zero remaining findings, partial runs between complete baselines, changed scope, suppressed/truncated results, AI reviews, and organization/branch isolation. All 65 chart/repository browser tests passed, including the 12 → 7 → 0 fixture, exact report navigation, and 320px light/dark layouts. Screenshots were visually inspected. API/web TypeScript checks, focused ESLint and `git diff --check` passed. Production API and web images built successfully; local Compose API, worker and web were recreated and became healthy. No real repository was rescanned or reported as remediated during this verification.

Audit: no blocking defects were identified. Extended the PostgreSQL regression fixture to verify independent Security, Reliability and Maintainability additions, removals and zero counts in one assessment sequence. Checked repository/organization/branch boundaries, partial and changed-scope baselines, AI separation, historical report navigation, payload limits, and unchanged assessment evidence. Added the required release change entry. The PRs exclude the earlier AI/MCP/export commit.

Browser test fixtures (no customer data): [desktop, dark theme](images/remediation-tracking-desktop.png) and [320px, light theme](images/remediation-tracking-mobile.png).

Clean PR branch verification: 73 API tests and 63 browser tests passed after applying remediation tracking directly to the current development tree, excluding the preceding AI/MCP/export commit. API/web typechecks, focused ESLint and whitespace checks also passed. The lower suite total reflects the excluded earlier tests; all remediation regression cases are included. Both target branches have the same remediation-only file diff.
