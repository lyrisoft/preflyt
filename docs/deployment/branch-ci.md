# Branch CI and image publication

`Verify implementation` routes PR checks by target branch. Release image publication runs on pushes to development and main after merge.

| Branch | Checks | Preflyt policy | Images |
| --- | --- | --- | --- |
| development | API/web type checking, web lint, API/web build | Required build and type reports; automatic advisory PR review through the configured model router | No Docker builds on PRs; merged pushes build SHA-tagged images once, publish to private GHCR and verify those exact images with Compose |
| main | Full API/browser regression | Separate branch policy can require release checks | No Docker builds on PRs; merged pushes build and publish once, then verify those exact images with Compose |

The development policy does not require full regression. Lint failure still fails the workflow. Missing or failed build/type reports cannot satisfy the development policy. The terminal Preflyt gate remains inside `Verify implementation` and is scoped to development PRs.

`development-checks.yml` and `main-regression.yml` are reusable PR check workflows. `verify.yml` selects exactly one. The publisher does not repeat PR verification: branch protection must require the appropriate PR checks before merge. A direct push can bypass PR verification when GitHub allows it.

`publish-images.yml` builds both AMD64 and ARM64 on native runners, without QEMU emulation. API, migration and controller targets share one Bake invocation per architecture; web builds separately in parallel. Layer caching remains enabled. A dependent job assembles both architectures into the existing immutable commit tags before Compose starts. Compose pulls their exact commit tags and verifies the revision labels, startup, migrations and backup restore without rebuilding. A failed build or Compose test fails release validation; publishing to GHCR alone does not authorize deployment.

`publish-native.yml` runs separately when native tool sources, fixture inputs or locked dependencies change. Each tool is fixture-tested before its image is pushed. Unchanged tools retain their previously reviewed immutable digests; provision those digests rather than expecting new native tags for every application commit. Manual native publication remains available to refresh the offline vulnerability database. Native publication does not delay application Compose verification.

Preflyt branch policies determine the evidence required for PR assessment. They do not schedule GitHub jobs; workflow branch conditions determine which commands run. Editing a standard creates a new immutable version, and the development policy must adopt and publish that version.

No application deployment is performed by GHCR publication.

## Chained PR publication

The development PR workflow submits genuine build/type reports, then a terminal
`Preflyt final gate` job depends on the checks. The backend reads
the exact GitHub job collection instead of waiting for whole-workflow completion.
It publishes deterministic results, runs the configured DeepSeek PR review and
waits for its PR feedback publication. AI findings stay advisory; execution or
publishing failure fails the gate. Documentation remains a separate workflow.

The old `preflyt-gate.yml` workflow is removed from development. Main is not
changed by this rollout; any legacy gate already on main remains there until the
owner separately promotes or removes it. New setup PRs update one workflow and
remove a legacy separate gate only on their selected target branch.
