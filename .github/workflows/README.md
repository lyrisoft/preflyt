# Workflow guide

## Current mode: manual builds, local verification

All workflows currently require **Run workflow** (`workflow_dispatch`). Reusable
`workflow_call` entries only support calls from another manually started workflow.
Pushes and pull requests do not automatically start CI. Preflyt Action execution
and its final gate are commented out to conserve GitHub build minutes.

These are local working-tree changes until committed and pushed. GitHub's Actions
menu and behavior reflect the workflow files already published on the selected
branch. This guide does not authorize a push or public release.

## Which workflow should I run?

| Purpose | Workflow file / Actions name | Branch and inputs | What happens |
| --- | --- | --- | --- |
| Publish development application images after local testing | [publish-development.yml](publish-development.yml) — **Build and publish development** | Select `development`; other branches fail before building | Builds/publishes seven GHCR application image packages for AMD64 and ARM64, with immutable `sha-<commit>` tags. No hosted tests or Compose acceptance. |
| Publish a production version after local testing | [publish-production.yml](publish-production.yml) — **Build and publish production** | Select `main`; other branches fail before building | Builds/publishes the same images and creates versioned image tags plus a GitHub release. Reuses the commit's existing stable version or increments the latest patch version, then publishes matching versioned documentation. No hosted application tests or Compose acceptance. |
| Run the appropriate branch checks explicitly | [verify.yml](verify.yml) — **Verify implementation** | `development` or `main` | Routes development to source/focused checks and main to full regression. Preflyt policy/gate stay disabled. |
| Run development checks directly | [development-checks.yml](development-checks.yml) — **Development checks** | Normally `development` | Release/deployment automation tests, API unit tests with coverage, web lint, types/build and related browser tests. Does not run service-backed API integration tests. |
| Run full API and browser regression on GitHub | [main-regression.yml](main-regression.yml) — **Main regression** | Normally `main`; can manually test another branch | Starts isolated PostgreSQL/Redis, builds API/web, runs full API and Chromium regression, and combines reports. This consumes hosted test minutes. |
| Publish images **with** deployment qualification | [publish-images.yml](publish-images.yml) — **Publish and verify release images** | `development` or `main` | Older, more expensive path: change-scope planning, image builds, manifests, then Compose acceptance. Main creates its release only after acceptance. Development can skip image work when deployment inputs are unchanged. |
| Verify the Compose installation | [compose-acceptance.yml](compose-acceptance.yml) — **Verify container deployment** | `development` or `main`; `published_images` defaults to `false` | `false` builds fixture images; `true` pulls already-published images for the exact execution SHA and checks revision labels. Both verify startup/login/protected routes/scanner readiness. Main additionally exercises Health analyzers and migration/backup/restore lifecycle checks. |
| Publish standalone native scanner/tool images | [publish-native.yml](publish-native.yml) — **Publish native tools** | `development` or `main`; job skips other branches | Builds the six native tool variants as needed, runs fixture verification, then pushes verified images. Separate from the seven application packages. Not a test-free publisher. |
| Build and publish documentation | [docs.yml](docs.yml) — **Documentation** | Select `main` to deploy Pages; other branches build only | On main, synchronizes frozen documentation from published release tags, then type-checks/builds and deploys Pages. Optional `release_tag` selects the newest release to include; blank selects the newest published release. Other branches build the committed snapshots only. |
| Check Community Edition metadata and docs | [community-checks.yml](community-checks.yml) — **Community readiness** | Select the branch to inspect | Checks required community/license/contact files, targeted security/license regressions, and docs types/build. Does not publish images or docs. |
| Check contribution sign-offs | [dco.yml](dco.yml) — **Contribution sign-off** | Provide the `pull_request` number | Reads current PR metadata/commits and verifies author-matching DCO trailers. No contributor-code checkout. Does not review code or prove copyright ownership. |

**For normal publication today, use the first two workflows.** Do not also run the
older publisher for the same release unless you deliberately want its additional
acceptance checks. Production publishers share a concurrency group to serialize
version tagging, but that does not eliminate redundant work.

The seven application packages are `preflyt-api`, `preflyt-api-migration`,
`preflyt-native-controller`, `preflyt-health-scanner`, `preflyt-web`, `preflyt-strix-runner` and `preflyt-strix-sandbox`. GHCR image
publication does **not** deploy servers or publish the private npm workspaces.
The web package defaults to Community Edition app mode; these workflows do not
produce the separate `VITE_WEBSITE_MODE=true` public website image.

### How to run

In GitHub, open **Actions → workflow name → Run workflow**, select the branch,
provide any inputs and confirm. Or use the GitHub CLI:

```sh
# After all local checks pass for the exact commit being published:
gh workflow run publish-development.yml --ref development
gh workflow run publish-production.yml --ref main

# Optional checks; each uses hosted minutes:
gh workflow run verify.yml --ref development
gh workflow run compose-acceptance.yml --ref main -f published_images=true
gh workflow run dco.yml --ref main -f pull_request=123
```

Run one publication command for the intended environment, not both by default. Main application publication also publishes matching versioned documentation after its release is ready; use the standalone docs workflow for documentation-only updates.
Published-image acceptance requires all seven `sha-<execution SHA>` images to exist;
it does not fall back to another commit's images. Before publishing, complete the
[local verification checklist](../../docs/deployment/branch-ci.md#before-every-publication)
and use only [disposable test databases](../../docs/operations/test-database-safety.md).
A successful publish-only run does not certify regression results.

## Restoring standard CI

The following are **future edits**, not switches already enabled by this README.
Restore PR verification first, then automatic publication. Keep manual dispatch as
an explicit fallback. Do not add `push`/`pull_request` triggers indiscriminately to
all files: that would duplicate reusable checks and expensive image builds.

### 1. Restore automatic pull-request verification

In `verify.yml`, retain `workflow_dispatch` and `workflow_call`, then add:

```yaml
on:
  workflow_dispatch:
  workflow_call:
  pull_request:
    branches: [development, main]
```

Leave `development-checks.yml`, `main-regression.yml` and `compose-acceptance.yml`
reusable/manual; `verify.yml` already routes PRs to the appropriate check workflow.
Its read-only `fork_development` job already routes fork PRs to main regression.
Do not grant fork jobs write tokens, OIDC or secrets, and do not substitute
`pull_request_target` with contributor-code checkout.

**If Preflyt Action remains disabled**, change the `Type checks` and `Build
validation` step conditions in `development-checks.yml` to:

```yaml
if: ${{ !cancelled() }}
```

Their current conditions skip same-repository development PRs because the enabled
Preflyt policy previously performed those checks. Restoring PR triggers without
restoring either the Action or these direct checks would leave a verification gap.
The existing source job continues to run API units and lint; the related-browser
fallback must remain enabled when no verified policy browser result is available.

### 2. Restore community and DCO PR checks

Add `pull_request: { branches: [development, main] }` alongside manual dispatch in
`community-checks.yml`. Change its concurrency key to use the PR number when
present, with `github.ref` as the manual fallback.

For `dco.yml`, keep its manual PR-number input and add:

```yaml
pull_request:
  types: [opened, synchronize, reopened, ready_for_review]
```

Update **both** its concurrency key and the step's `PR_NUMBER` environment value
to use `${{ github.event.pull_request.number || inputs.pull_request }}`. Keep the
metadata-only API implementation: never check out PR code for DCO verification.
For PR-triggered runs, also pass `github.event.pull_request.head.sha` to Python and
reject a fetched PR head that differs from that event SHA; this prevents checking
a newer revision while reporting success on an older event. Retain the existing
commit-count/head/pagination checks and update the Python DCO regression fixtures.

### 3. Restore Preflyt Action policy and final gate, when ready

If returning to the full Preflyt-integrated flow:

1. Configure repository variable `PREFLYT_API_URL` to the reachable Preflyt API.
   Confirm the GitHub App/installation, OIDC trust and published development branch
   policy are configured, including approved commands and any optional AI settings.
2. In `development-checks.yml`, uncomment the four consecutive steps beginning
   with `Mark current policy execution`, through `Check current policy browser
   coverage`. Restore `actions: read` and `id-token: write` on `jobs.checks` alongside
   `contents: read`; OIDC authenticates the Action, and actions read permits the
   same-run coverage artifact download.
3. In `verify.yml`, grant those same permissions on the reusable
   `jobs.development` caller. A called workflow cannot elevate its caller's token.
   Leave the fork/main jobs read-only.
4. Uncomment the `preflyt_gate` job in `verify.yml`. Its commented block already
   includes its prerequisite jobs, same-repository development-PR condition and
   `id-token: write` permission. Keep that scope; never run it for fork PRs.
5. Add `&& steps.browser.outputs.covered != 'true'` back to the conditions on
   `Install Chromium for related browser tests` and `Related browser tests`.
   The coverage-inspection step must remain before them. It only suppresses a
   duplicate browser run when the current policy execution proves full coverage;
   missing/failed/unrecognized reports must retain the fallback.
6. The source job's API coverage preparation/upload steps already have
   same-repository PR conditions and a run/attempt-specific artifact name. Keep
   these guards, pinned Action SHA, checkout SHA, report freshness checks and
   disabled credential persistence.

Keep direct type/build checks enabled until the configured published policy has
been verified to run their equivalents. Only then restore their existing
same-repository-PR skip conditions to avoid duplicate work. A missing policy,
incomplete evidence or unavailable gate must never become a pass.

### 4. Restore automatic image publication after merge

Use **one** automatic publisher: the older `publish-images.yml`, which qualifies
its published images with Compose before creating a production release. Add:

```yaml
on:
  workflow_dispatch:
  push:
    branches: [development, main]
```

Two additional changes are required; adding the trigger alone is insufficient:

- Broaden `jobs.release.if` in that file to allow either `push` or
  `workflow_dispatch`, while still requiring `github.ref == 'refs/heads/main'`.
- In `scripts/ci/create-release.mjs`, retain the main-branch identity guard but
  change the event guard to accept exactly `push` and `workflow_dispatch`.
  Update `create-release.test.mjs` to cover both allowed events and continued
  rejection of development/PR events before registry or GitHub writes.

Keep `publish-development.yml` and `publish-production.yml` manual. Do not attach
push triggers to them too. Their exact-SHA builds and immutable tags remain useful
for explicit reruns, but they deliberately bypass hosted acceptance testing.
Publication still does not deploy application servers.

### 5. Restore optional automatic docs/native publication

In `docs.yml`, add a main-only push trigger with paths for `apps/docs/**`,
`.env.example`, `docker-compose.yaml`, `deploy/postgres/**`,
`deploy/otel-collector.yaml`, `deploy/kubernetes/**` and the workflow file. Retain
`workflow_dispatch` and the main-only Pages deploy condition.

In `publish-native.yml`, retain manual dispatch and add this input-scoped trigger:

```yaml
push:
  branches: [development, main]
  paths:
    - 'docs/deployment/native-runner/**'
    - 'apps/api/scripts/native-check-fixtures.mts'
    - 'apps/api/scripts/health-file-analysis-fixtures.mjs'
    - 'apps/api/src/health/health-file-analysis.ts'
    - 'apps/api/src/execution/**'
    - 'apps/api/src/assessments/assessment-digest.ts'
    - 'apps/api/package.json'
    - 'apps/api/prisma/**'
    - 'apps/api/prisma.config.ts'
    - 'scripts/deploy/**'
    - 'scripts/ci/local-images.mjs'
    - 'patches/**'
    - 'package.json'
    - 'pnpm-lock.yaml'
    - 'pnpm-workspace.yaml'
    - '.github/workflows/publish-native.yml'
```

Place `push` under `on`, alongside `workflow_dispatch`. These paths cover the
native Dockerfiles, source/fixture contracts, dependency patches and packaging
helpers; extend them whenever new build inputs are introduced. Keep manual
dispatch for deliberate scanner/database refreshes. Avoid rebuilding native
images for unrelated web changes.

### 6. Verify and enforce the restored flow

Update the manual-only workflow contracts in
`apps/api/test/development-ci.test.ts` and
`apps/api/test/deployment-config.test.ts`; they intentionally reject automatic
triggers today. Run actionlint, Node release/deployment tests, Python CI/DCO tests,
full local API/browser regression, lint, types and builds before publishing the
workflow changes. Include relevant local Compose/scanner acceptance when changing
runtime/deployment inputs.

After the restored workflows are published, verify same-repository and fork PR
routing, development/main behavior, failed/missing-evidence paths, and release
ordering. Only then configure branch protection to require the actual successful
check contexts that exist. Do not require manual-only contexts on every PR or
assume this README changes branch rules. Keep read-only default workflow tokens;
grant package writes only to publishers and release writes only where needed.

See [branch CI details](../../docs/deployment/branch-ci.md) for coverage/evidence
contracts and [the repository launch runbook](../../docs/operations/community-repository-launch.md)
for the separate public-release requirements.

### Writing release notes

Each feature, improvement, fix or documentation change includes a reviewed
`.changes/a-short-description.json` file. See [the format and preview commands](../../.changes/README.md).
Authors describe the user outcome, important limits and upgrade actions while
reviewing the code. New releases do not require a hand-written versioned Markdown
summary. Do not derive product claims from promotion PR titles or commit messages.

The manual main publisher plans its version, selects the newest earlier published
stable release with a valid image-readiness marker, and assembles new change files
from that exact Git range. Both planning and publication use full Git history.
Missing fragments, invalid fields, changed/deleted previously released fragments,
and migration/configuration changes without file-linked upgrade explanations fail
before builds start. Known configuration paths are documented in `.changes/README.md`;
reviewers still need to explain compatibility requirements in other code.

Generated **What's new**, **Improvements and fixes**, and **Upgrade notes** appear
in the planning job's summary. The notes hash passes to the release job, which
recomputes it before changing image tags. Drift stops publication. Keep consumed
change files in place; comparing with the last published release prevents repeats,
including after failed builds or reserved tags. No automated commits or new hosted
workflow triggers are introduced.

After verifying the images, the publisher adds image tags, architectures, the
source commit, full changelog and readiness marker under **Technical details**.
Do not put that marker in change files. The in-app viewer keeps the final section
in its image/build disclosure and still supports old automatically generated notes.

Main image publishers also run the documentation environment-reference check
before version planning, so an undocumented setting fails before image builds
consume runner time. The full documentation build still runs after publication.

Rerunning publication preserves an existing published release description.
Corrections to an existing release are a separate, explicitly authorized notes-only
edit: render the reviewed Markdown with `renderReleaseNotes` from
`scripts/ci/release-notes.mjs`, using the **existing** tag's verified source commit
and previous stable tag. Pass the saved result with `gh release edit --notes-file`.
Preserve the existing readiness marker exactly; do not qualify another commit or
rebuild images just to correct prose.

### Installed version and in-app release notices

The production publisher plans its stable version before building and passes that version plus the source commit into API/web images. Publication refuses to continue if the planned version has changed. Development and local images are labeled Development.

After verifying and tagging every required dual-architecture image, `create-release.mjs` includes a `preflyt-release-ready:v1` marker bound to the source commit in the published notes. The in-app checker uses this marker to distinguish installable releases from ordinary tags or notes. Do not add the marker to drafts or incomplete publications. Existing releases without it remain readable as notes but do not trigger upgrade recommendations.

The in-app checker uses the public GitHub releases endpoint without installation/user credentials. Private repositories will report an unavailable check until public releases are reachable. No workflow runs are started by checking for updates, and the app never upgrades itself.
