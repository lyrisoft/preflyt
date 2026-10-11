# Branch CI and image publication

`Verify implementation` routes PRs by target branch, and publisher calls by pushed branch.

| Branch | Checks | Preflyt policy | Images |
| --- | --- | --- | --- |
| development | API/web type checking, web lint, API/web build | Required build and type reports; automatic advisory PR review through the configured model router | PR builds do not push; merged pushes publish SHA-tagged images to private GHCR |
| main | Full API/browser regression and local Compose acceptance | Separate branch policy can require release checks | PR builds do not push; merged pushes publish only after regression and Compose pass, then verify the published images with Compose |

The development policy does not require full regression. Lint failure still fails the workflow. Missing or failed build/type reports cannot satisfy the development policy. The existing final publication gate listens for the unchanged `Verify implementation` name and remains scoped to development PRs.

`development-checks.yml` and `main-regression.yml` are reusable implementation workflows. `verify.yml` selects exactly one. `publish-images.yml` calls verification before publishing the four application images and five native tool images. Native tool image fixtures remain part of image publication on both branches. Manual image publication is restricted to development and main; feature-branch dispatch fails before any image push.

Preflyt branch policies determine the evidence required for PR assessment. They do not schedule GitHub jobs; workflow branch conditions determine which commands run. Editing a standard creates a new immutable version, and the development policy must adopt and publish that version.

No application deployment is performed by GHCR publication.
