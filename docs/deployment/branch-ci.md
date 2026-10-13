# Branch CI and image publication

`Verify implementation` routes PR checks by target branch. Image publication inspects pushes to development and main after merge; test/documentation-only development pushes skip expensive image work.

| Branch | Checks | Preflyt policy | Images |
| --- | --- | --- | --- |
| development | Always-on workflow/source contract tests and web lint; related API unit/browser tests for changed code | The published policy runs its configured commands and scanners, including build, types and component tests; configured AI reviews remain advisory | Merged pushes build SHA-tagged images only when deployable or deployment-qualification inputs change, then verify those exact images with Compose |
| main | Full API/browser regression | Separate branch policy can require release checks | No Docker builds on PRs; merged pushes build and publish once, then verify those exact images with Compose |

Development does not repeat the full release regression. Lint or focused-test failure still fails the workflow. Missing or failed required policy results cannot satisfy the policy. The terminal Preflyt gate remains inside `Verify implementation` and is scoped to development PRs. Database integration tests run in the full main regression with isolated PostgreSQL and Redis services.

Development checkouts fetch commit history and compare the exact PR head against its merge base. `scripts/ci/change-scope.mjs` uses Vitest's dependency graph to run related unit/browser tests, including edited tests themselves. Dependency, shared-package or test-configuration changes broaden the relevant suite. The workflow/source contracts always run because YAML and other files read at runtime are not static imports. No matching related test is reported as no matching test, not as scanner or policy evidence. Unknown initial history broadens scope; invalid or unavailable comparisons fail rather than silently skip. Browser installation is skipped when frontend inputs are unchanged. Both PR workflows install the declared pnpm 10.26.2 version.

`development-checks.yml` and `main-regression.yml` are reusable PR check workflows. `verify.yml` selects exactly one. The publisher does not repeat PR verification: branch protection must require the appropriate PR checks before merge. A direct push can bypass PR verification when GitHub allows it.

`publish-images.yml` builds both AMD64 and ARM64 on native runners, without QEMU emulation. API, migration and controller targets share one Bake invocation per architecture; web builds separately in parallel. Layer caching remains enabled. A dependent job assembles both architectures into the existing immutable commit tags before Compose starts. Compose pulls their exact commit tags and verifies the revision labels, startup, migrations and backup restore without rebuilding. A failed build or Compose test fails release validation; publishing to GHCR alone does not authorize deployment.

The publisher's read-only `Inspect deployable changes` job always runs. For development it skips builds, manifests and Compose qualification if only tests, docs or PR-check configuration changed. Source, migrations, runtime assets, dependencies, Docker/Nginx inputs, deployment fixtures or publication scripts trigger a build. Deleted and renamed paths both count. A skipped development commit gets no new image tag: keep using the last verified image's original commit and never relabel it as the skipped commit. Main always builds and verifies its own exact commit, including docs/test-only release commits, before creating a versioned release. There is no workflow-level path filter that could accidentally skip a main release.

An open development-to-main PR receives a synchronize event after every development merge and reruns the full main regression. That PR run is independent of the push publisher. Native tool publication remains separate and path-filtered.

`publish-native.yml` runs separately when native tool sources, fixture inputs or locked dependencies change. Each tool is fixture-tested before its image is pushed. Unchanged tools retain their previously reviewed immutable digests; provision those digests rather than expecting new native tags for every application commit. Manual native publication remains available to refresh the offline vulnerability database. Native publication does not delay application Compose verification.

Preflyt branch policies determine which commands/scanners the installed Action executes and which evidence PR assessment requires. They do not schedule GitHub jobs; workflow branch conditions determine where the Action runs. Editing a standard creates a new immutable version, and the development policy must adopt and publish that version.

No application deployment is performed by GHCR publication.

## Chained PR publication

The development PR workflow executes its published policy and submits genuine per-check reports, then a terminal
`Preflyt final gate` job depends on the checks. The backend reads
the exact GitHub job collection instead of waiting for whole-workflow completion.
It publishes deterministic results, runs the configured advisory PR review and
waits for its PR feedback publication. AI findings stay advisory; execution or
publishing failure fails the gate. Documentation remains a separate workflow.

The old `preflyt-gate.yml` workflow is removed from development. Main is not
changed by this rollout; any legacy gate already on main remains there until the
owner separately promotes or removes it. New setup PRs update one workflow and
remove a legacy separate gate only on their selected target branch.
