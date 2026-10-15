# Repository Health consumes CI tests and coverage

Repository Health no longer installs dependencies, runs tests, provisions test
services or accepts test settings. Static reassessment excludes `tests.coverage`;
test-only requests are rejected and previously queued test plans are retired.
Scanner admission independently rejects test execution. Historical reports and
ownership-checked cleanup of old test containers remain available.

The API accepts optional LCOV evidence as `tests.coverage` in the existing signed
pipeline submission. It does not add a policy requirement or alter the gate result.
Health projects JUnit test counts and LCOV line counts separately from immutable
static reports, scoped to repository, installation, exact commit, workflow run and
attempt. Original report hashes, parser summaries, signed observations, report
proofs and server-verified workflow receipts must match. Unsigned, corrupted,
ambiguous or wrong-attempt reports cannot supply a measurement. Physical lines are
unioned; missing coverage remains unavailable rather than zero.

The detail page shows coverage, test counts, received time, workflow logs and a
setup link. Test-run buttons, framework/app selection and command overrides were
removed. Static category controls remain. Partial finding counts now use plain
numbers and the shared Partial scan badge. Worker events report assessment stages
without raw source, command output or credentials.

Local verification: 117 API tests across nine files, 61 Chromium UI tests, API/web
TypeScript checks, focused frontend lint and diff whitespace checks passed. The
companion public Action's local Python suite passed 23 tests with two existing
real-scanner tests skipped. Its new coverage-report input collects an existing
LCOV file and optional signed proof without executing tests or changing policy
requirements. API and Action changes are committed locally only; no push, release,
GitHub Actions run or live signed-coverage deployment was performed. The published
v2.1.1 Action does not contain the new input; a new Action release and deployment
of this API are required to use it.

CI report limits remain 256 KiB per report and 900 KB for the complete submission.
Coverage scope is CI-reported files; it is not a guarantee that every repository
file or vulnerability class was exercised. CI setup and trusted signing remain
owned by the existing workflow/deployment.
