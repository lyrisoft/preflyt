# Branch CI and image publication

`Verify implementation` routes PR checks by target branch. Image publication inspects pushes to development and main after merge; test/documentation-only development pushes skip expensive image work.

| Branch | Checks | Preflyt policy | Images |
| --- | --- | --- | --- |
| development | One full API unit test run with LCOV and web lint; policy browser tests collect LCOV in the same execution | The published policy runs its configured commands and scanners, including build, types and component tests; configured AI reviews remain advisory | Merged pushes build SHA-tagged images only when deployable or deployment-qualification inputs change, then verify those exact images with Compose |
| main | Full API/browser regression | Separate branch policy can require release checks | No Docker builds on PRs; merged pushes build and publish once, then verify those exact images with Compose |

Development excludes service-backed integration suites from its unit run. Lint or test failure still fails the workflow. Missing or failed required policy results cannot satisfy the policy. The terminal Preflyt gate remains inside `Verify implementation` and is scoped to development PRs. Service-backed integration tests, including GitHub worker/event-queue and Redis cache tests, use the `.integration.test.ts` suffix and run in the full main regression with isolated PostgreSQL and Redis services. API discovery is restricted to `test/**/*.test.ts`, so downloaded repository source and scanner scratch files cannot become Preflyt tests.

Development checkouts fetch commit history and compare the exact PR head against its merge base. `scripts/ci/change-scope.mjs` uses Vitest's dependency graph for the related-browser fallback, including edited tests themselves. API unit tests run once in full to produce consistent coverage, including runtime-read workflow/source contracts. Dependency, shared-package or test-configuration changes broaden the relevant suite. The full API unit run includes workflow/source contracts because YAML and other files read at runtime are not static imports. No matching related test is reported as no matching test, not as scanner or policy evidence. Unknown initial history broadens scope; invalid or unavailable comparisons fail rather than silently skip. Focused-browser fallback installation is skipped when frontend inputs are unchanged; the published policy still runs its configured browser setup. Both PR workflows install the declared pnpm 10.26.2 version.

Development source checks (API unit tests with coverage and lint) run in parallel with the policy/browser job. The terminal gate still waits for both jobs and independently verifies every required result. The API contracts and unit tests share one invocation; coverage does not start another test run.

The policy runs before related browser tests. With the v2.1.1-compatible Action, `scripts/ci/policy-browser-coverage.py` recognizes only the exact reviewed command that runs the entire browser suite. It requires a fresh passing JUnit report whose digest, policy identity, repository, PR head, workflow SHA, run, attempt, job and signer match this execution. This only avoids a duplicate local test run; it never supplies policy evidence or changes policy outcomes. Missing/partial/failed reports, changed or narrowed commands, and unknown Action layouts retain the related-test fallback. A skipped or unavailable policy cannot suppress browser tests.

The shared setup caches only pnpm's download store and still installs the frozen lockfile with scripts disabled. The policy job also caches the pinned Chromium download and Turborepo artifacts. Tests and `.preflyt` reports are never cached. Build artifacts are keyed internally by Turbo's inputs; documentation includes external Compose/deployment inputs and deployment environment values, with its `build` output and generated downloads restored. The web build includes the Nginx configuration and restores its public renderer output. API incremental TypeScript state lives inside `dist`, so removing or restoring emitted files also removes or restores the matching compiler state. Cold caches still execute the complete build.

`development-checks.yml` and `main-regression.yml` are reusable PR check workflows. `verify.yml` selects exactly one. The publisher does not repeat PR verification: branch protection must require the appropriate PR checks before merge. A direct push can bypass PR verification when GitHub allows it.

`publish-images.yml` builds both AMD64 and ARM64 on native runners, without QEMU emulation. API, migration and controller targets share one Bake invocation per architecture; web builds separately in parallel. Layer caching remains enabled. A dependent job assembles both architectures into the existing immutable commit tags before Compose starts. Compose pulls their exact commit tags without rebuilding the application. Development verifies revision labels, startup, sign-in, protected routes and scanner readiness. Main releases additionally exercise all Health analyzers, signed findings, source cleanup, migration replay, backup restore and restart. Scanner tools are packaged at image build time and loaded into the dedicated engine at startup; the scheduled vulnerability database refresh remains separate. A failed build or Compose test fails release validation; publishing to GHCR alone does not authorize deployment.

The publisher's read-only `Inspect deployable changes` job always runs. For development it skips builds, manifests and Compose qualification if only tests, docs or PR-check configuration changed. Source, migrations, runtime assets, dependencies, Docker/Nginx inputs, deployment fixtures or publication scripts trigger a build. Deleted and renamed paths both count. A skipped development commit gets no new image tag: keep using the last verified image's original commit and never relabel it as the skipped commit. Main always builds and verifies its own exact commit, including docs/test-only release commits, before creating a versioned release. There is no workflow-level path filter that could accidentally skip a main release.

An open development-to-main PR receives a synchronize event after every development merge and reruns the full main regression. That PR run is independent of the push publisher. Native tool publication remains separate and path-filtered.

The AMD64 API image runner removes only fixed unused SDK directories on its ephemeral GitHub-hosted Linux machine, then requires at least 24 GiB free before building. This cleanup does not run on ARM64, self-hosted runners or local machines. On both architectures, scanner packaging streams filesystem data into compressed OCI layers; it never writes a full uncompressed filesystem archive. The outer Docker-loadable archive contains those compressed layers without compressing them again.

Before publishing image changes, run `node scripts/ci/local-images.mjs` from the repository root with Docker running. This builds and loads all five application and six native images for both AMD64 and ARM64, verifies their architecture and content IDs, and saves logs plus `results.json` in a temporary evidence directory. It never pushes images or starts GitHub Actions. Optional architecture and group arguments, such as `node scripts/ci/local-images.mjs amd64 api`, repeat an affected group. Groups run sequentially and stop before another build if either the host filesystem or Docker's filesystem has less than 12 GiB free. The Docker probe uses the pinned API Node base in a disposable, read-only container with no network or mounts; Docker may first pull that public base if it is absent. Docker Desktop's VM limit is independent of free space on the Mac. On Apple Silicon, AMD64 executes through Docker's emulation and can take longer than a native CI runner. Runtime Compose and scanner acceptance remain separate from image-build qualification.

`publish-native.yml` runs separately when native tool sources, fixture inputs or locked dependencies change. Each tool is fixture-tested before its image is pushed. Unchanged tools retain their previously reviewed immutable digests; provision those digests rather than expecting new native tags for every application commit. Manual native publication remains available to refresh the offline vulnerability database. Native publication does not delay application Compose verification.

Preflyt branch policies determine which commands/scanners the installed Action executes and which evidence PR assessment requires. They do not schedule GitHub jobs; workflow branch conditions determine where the Action runs. Editing a standard creates a new immutable version, and the development policy must adopt and publish that version.

No application deployment is performed by GHCR publication.

## Same-run CI coverage

`PREFLYT_COLLECT_COVERAGE=true` enables the V8 provider during the existing API
unit and policy browser executions. Both produce LCOV without another test run.
Explicit source includes retain untested modules. API coverage excludes generated
Prisma code and type declarations. Web coverage preserves the configured route,
UI primitive, generated route tree, asset and test-helper exclusions; the metric
is coverage of these configured files, not every repository file.

The parallel source job exports its fresh API LCOV and a manifest binding the
original digest to repository ID, PR head, run and attempt. A one-day artifact is
named with that run/attempt. The check job uses read-only `actions: read` to locate
and download it through pinned GitHub artifact actions. The shared Preflyt Action
waits at most 120 seconds for this artifact, rejects missing/stale/mismatched
inputs, and combines it with its own fresh browser report. Package prefixes avoid
API/web path collisions; each reported physical line counts once. Failed required
checks cannot attach a passing coverage result.

The optional `tests.coverage` report carries deterministic gzip/base64 data, with
a SHA-256 over the decoded LCOV. Compressed bytes are limited to 256 KiB, decoded
LCOV to 2 MiB, and the existing 900,000-byte submission limit remains. Other CI
reports retain their 256 KiB limit. Preflyt bounds decompression, validates LCOV
counters and digest, stores the original decoded bytes and verifies them again
before projection. Coverage adds no policy requirement or percentage threshold.

In default `github-native` mode, Health accepts these exact bytes only after the
server verifies the completed GitHub execution and records its receipt. Missing
receipts, wrong commits/attempts/jobs/digests and supplied invalid proofs cannot
produce a percentage. Explicit `organization-key` mode still requires a valid
report signature. Health reads the measurement for the displayed assessment's
exact commit; it never copies PR coverage onto a different merge/squash commit.
The current development PR intake does not create coverage for later push SHAs.
Tests and coverage artifacts are never restored from caches.

## Chained PR publication

The development PR workflow executes its published policy and submits genuine per-check reports, then a terminal
`Preflyt final gate` job depends on the checks. The backend reads
the exact GitHub job collection instead of waiting for whole-workflow completion.
It publishes deterministic results, runs the configured advisory PR review and
waits for its PR feedback publication. AI findings stay advisory; execution or
publishing failure fails the gate. Documentation remains a separate workflow.

A gate-only rerun can reuse an earlier accepted submission from the same workflow
run. Preflyt requires the same workflow commit, PR head and current published
policy, the original server verification receipt, and fresh GitHub API reads of
both attempts. Successful prerequisite jobs must have identical execution and
step timestamps, names and outcomes; GitHub may allocate new IDs to the copied
jobs. Changed, rerun, incomplete or unverified jobs cannot reuse old results.
Once prerequisite jobs finish, a missing compatible submission fails immediately.

For an unavailable AI review, use **Retry AI review** on the saved assessment.
This retries the review without executing CI checks. Admission rechecks access,
source-sharing permission, approved skills, the published policy and the current
tested model route. Changing routes creates a new review; retrying unchanged
settings requeues only the unavailable review. Automatic polling never repeats
failed inference. Rejected output remains unpublished. Failures retain fixed
categories for response size, credential echo and secret patterns, without
retaining rejected output or matched text.

The old `preflyt-gate.yml` workflow is removed from development. Main is not
changed by this rollout; any legacy gate already on main remains there until the
owner separately promotes or removes it. New setup PRs update one workflow and
remove a legacy separate gate only on their selected target branch.
