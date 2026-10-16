# Manual builds and local verification

Hosted automation is manual while build minutes are limited. Pushes, pull requests and schedules do not start any repository workflow. Preflyt Action policy execution and its final gate are commented out; the app's integration functionality remains available to users.

## Publish application images

Run these workflows explicitly from GitHub Actions after local verification:

| Workflow | Select branch | Result |
| --- | --- | --- |
| Build and publish development (`publish-development.yml`) | `development` | Five GHCR application image packages with immutable `sha-<commit>` tags |
| Build and publish production (`publish-production.yml`) | `main` | The same images, plus the next patch-version image tags and a GitHub release |

Both workflows reject the wrong branch before building. They build the selected execution SHA on native AMD64 and ARM64 runners and assemble dual-architecture manifests. Existing immutable tags are reused, and conflicting version tags are refused. Production release numbering is unchanged: reuse the commit's stable version or increment the latest patch version.

These publish-only workflows do not run tests, regression, Preflyt Action or Compose acceptance. They publish container packages to GHCR; they do not deploy servers. Workspace npm packages are private and are not published to npm. Application images retain the normal Community Edition web build; the standalone public website remains a separate website-mode image.

The older **Publish and verify release images** workflow is retained as a manual option with Compose acceptance. Native scanner publication, documentation deployment, community checks, DCO, development checks and full regression are also manual. They can still consume runner minutes when explicitly dispatched. Reusable `workflow_call` entry points remain only for existing manual workflow orchestration. The DCO workflow takes a pull request number and reads its current commits without checking out PR code.

## Before every publication

Run local verification against the exact commit being published, including:

- API unit and integration regression, using a disposable local PostgreSQL database and dedicated Redis instance (see [test database safety](../operations/test-database-safety.md)).
- Full web browser regression, API/web type checks, web lint, production builds, documentation type checks/build, and public build checks. Set `VITE_WEBSITE_MODE=false` for the Community Edition build; separately verify the website-mode build when its code changes.
- Release/deployment automation Node tests and Python CI tests. GNU-tar packaging fixtures require Linux; run those in a local container on macOS.
- Relevant local image, scanner and Compose acceptance checks when deployment/runtime inputs change.

No hosted check now enforces this verification. Record the commit, commands, results and any exclusions in the acceptance record before manually publishing. A release or successful build alone does not certify tests or security clearance. These changes take effect on GitHub only after they are committed and pushed.

## Local image qualification

The AMD64 API image runner removes only fixed unused SDK directories on its ephemeral GitHub-hosted Linux machine, then requires at least 24 GiB free before building. This cleanup does not run on ARM64, self-hosted runners or local machines. On both architectures, scanner packaging streams filesystem data into compressed OCI layers; it never writes a full uncompressed filesystem archive. The outer Docker-loadable archive contains those compressed layers without compressing them again.

Before publishing image changes, run `node scripts/ci/local-images.mjs` from the repository root with Docker running. This builds and loads all five application and six native images for both AMD64 and ARM64, verifies their architecture and content IDs, and saves logs plus `results.json` in a temporary evidence directory. It never pushes images or starts GitHub Actions. Optional architecture and group arguments, such as `node scripts/ci/local-images.mjs amd64 api`, repeat an affected group. Groups run sequentially and stop before another build if either the host filesystem or Docker's filesystem has less than 12 GiB free. The Docker probe uses the pinned API Node base in a disposable, read-only container with no network or mounts; Docker may first pull that public base if it is absent. Docker Desktop's VM limit is independent of free space on the Mac. On Apple Silicon, AMD64 executes through Docker's emulation and can take longer than a native CI runner. Runtime Compose and scanner acceptance remain separate from image-build qualification.


## CI coverage integration reference (repository execution paused)

The following describes the supported Action integration. This repository currently
comments out its Action calls and does not upload coverage through that integration.
Restoring it also requires restoring the documented artifact and OIDC permissions.

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


## Chained PR publication reference (repository execution paused)

When enabled, a development PR workflow executes its published policy and submits genuine per-check reports, then a terminal
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
