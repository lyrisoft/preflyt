# Branch CI and image publication

`Verify implementation` routes PRs by target branch, and publisher calls by pushed branch.

| Branch | Checks | Preflyt policy | Images |
| --- | --- | --- | --- |
| development | API/web type checking, web lint, API/web build | Required build and type reports; automatic advisory PR review through the configured model router | PR builds do not push; merged pushes publish SHA-tagged images to private GHCR |
| main | Full API/browser regression and local Compose acceptance | Separate branch policy can require release checks | PR builds do not push; merged pushes publish only after regression and Compose pass, then verify the published images with Compose |

The development policy does not require full regression. Lint failure still fails the workflow. Missing or failed build/type reports cannot satisfy the development policy. The terminal Preflyt gate remains inside `Verify implementation` and is scoped to development PRs.

`development-checks.yml` and `main-regression.yml` are reusable implementation workflows. `verify.yml` selects exactly one. `publish-images.yml` calls verification before publishing the four application images and five native tool images. Native tool image fixtures remain part of image publication on both branches. Manual image publication is restricted to development and main; feature-branch dispatch fails before any image push.

Preflyt branch policies determine the evidence required for PR assessment. They do not schedule GitHub jobs; workflow branch conditions determine which commands run. Editing a standard creates a new immutable version, and the development policy must adopt and publish that version.

No application deployment is performed by GHCR publication.

## Chained PR publication

The development PR workflow submits genuine build/type reports, then a terminal
`Preflyt final gate` job depends on the checks and image builds. The backend reads
the exact GitHub job collection instead of waiting for whole-workflow completion.
It publishes deterministic results, runs the configured DeepSeek PR review and
waits for its PR feedback publication. AI findings stay advisory; execution or
publishing failure fails the gate. Documentation remains a separate workflow.

The old `preflyt-gate.yml` workflow is removed from development. Main is not
changed by this rollout; any legacy gate already on main remains there until the
owner separately promotes or removes it. New setup PRs update one workflow and
remove a legacy separate gate only on their selected target branch.
