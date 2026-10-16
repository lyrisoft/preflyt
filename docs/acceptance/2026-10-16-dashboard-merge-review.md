# Dashboard repository status corrections — 16 October 2026

The Repository status table now calls the standards column **Standards selection**. **Inspected** uses the shared green success mapping; **Partially inspected** remains amber.

The API evaluates the latest saved assessment shown in each repository row with the existing deterministic `previewGate` evaluator, after checking the assessment digest. It returns PASS, BLOCK, WARN or INCOMPLETE; no assessment returns NOT_EVALUATED and failed integrity returns UNAVAILABLE. The cache namespace changed to prevent reuse of old hardcoded results. Authorized repository filtering is unchanged. Neither provider success nor a report's `qualityGate` field can establish a passing result.

The UI reuses the assessment report's status labels and colors, links to the exact saved assessment and explains the commit and historical nature in its tooltip. This is a saved assessment result, not current GitHub merge permission. No live enforcement or AI decision is introduced.

Local verification:

- Dashboard API, summary and shared gate evaluator: 77 tests passed, including real isolated PostgreSQL/Redis integration, access/revocation, no assessment, latest assessment outside the metric period, integrity failure and misleading report qualityGate.
- Dashboard and shared status badges: 32 Chromium tests passed, including PASS/BLOCK/WARN/INCOMPLETE/unavailable labels, semantic colors, standards header and saved assessment links.
- API and web TypeScript, focused web ESLint, web formatting and diff whitespace checks passed.
- Live Compose authentication/origin/protected-route smoke passed. All three live repository rows matched the corresponding assessment evaluation endpoint. API, worker and web were healthy with the rebuilt image IDs; isolated test fixtures were removed.
- API runtime and web production/prerender images rebuilt locally for ARM64, retaining prior uncommitted fixes and optimized packaging. API image also serves the worker; unrelated application images are unchanged.

Applied to the documentation Compose project `preflyt-ce-local`, http://localhost:8081, preserving its settings and volumes. Private logs: `/private/tmp/preflyt-dashboard-*`; private image manifest: `work/community-local/images.json`. No commit, push or registry publication.
