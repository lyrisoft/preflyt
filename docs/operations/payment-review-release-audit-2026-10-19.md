# Payment review release audit — 19 October 2026

Audited the unpublished Payment Risk Review, finding classifications and repository
results changes against development and main. Audit corrections are committed in
`0fd2255` and `c01626f`.

## Corrections

- Normalize health finding identifiers so saved human decisions agree across
  global findings, repository rows, source details and payment report downloads.
- Preserve linked skipped/pre-admission AI review outcomes even without a runner
  job, while showing a newer eligible same-commit review when available.
- Keep historical payment reports readable when legacy optional fields are absent.
- Count each assessed commit once across static and AI results. Recheck current
  organization and repository authorization after reading the SQL findings index.
- Exercise real SQL index queries in the advisory projection tests. Correct the
  deployment fixture to reflect the existing worker-only source snapshot mount.

## Verification

- Full API regression: 193 files passed; 2,148 tests passed, four skipped. Tests
  ran against owned disposable local PostgreSQL databases and dedicated Redis.
- Full browser regression: 119 files, 873 tests passed. Focused post-audit browser
  regression: 58 tests passed.
- Pinned runner Python regression: 33 passed. Release/deployment Node regression:
  50 passed. CI Python regression: 16 passed.
- API/web type checks, web lint, API/web production builds, documentation build,
  environment-reference validation and whitespace checks passed.
- Prior live source-review and Compose acceptance remain recorded in
  `payment-risk-acceptance-2026-10-19.md`. This audit did not rerun a paid review
  or live penetration test. Production publishing is a separate manual action.

## Upgrade and limits

Back up the database and apply the additive `20261019123000_finding_review`
migration, then recreate API, worker and web. Restart the local source-review
bridges with the updated scripts. Existing findings snapshots rebuild once under
the revised index key. No new environment variable or runner privilege is needed.

AI reports remain source-only suggestions, with explicit coverage gaps; a completed
report is not proof that a vulnerability was exploited or that a live system is
secure. Human decisions annotate an exact assessment and commit. They do not change
the saved scan, deterministic checks or GitHub merge permissions. The production
workflow publishes images and a release; it does not roll out application servers.
