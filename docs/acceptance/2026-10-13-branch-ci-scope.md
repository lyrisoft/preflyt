# Branch CI scope verification — 13 October 2026

Development PRs always run workflow/source contract tests, lint and the published policy. Changed API code selects related unit tests; changed frontend code selects related browser tests. Dependency/configuration changes broaden the affected suite. Database integration and build-dependent hydration verification remain in full release regression (and any configured policy command that runs them). No focused-test output replaces required policy evidence.

Development pushes retain a read-only scope job but skip image builds, manifests and Compose qualification for test/docs-only changes. Runtime, migration, dependency, image and deployment-qualification inputs trigger exact-commit builds. Deleted and renamed paths count. Main always builds and verifies its own commit before release. Skipped development commits have no new image tag; earlier images retain their actual source revision. Native tool triggers are unchanged.

Verification completed locally:

- 19 Node cases passed for scope selection, release publication and release automation. Real temporary Git repositories prove rename/deletion handling, PR merge-base comparisons, development docs-only skipping and unconditional main publication.
- 38 API cases passed in the five always-on workflow/source/evidence/gate contract suites.
- Failure exit codes, invalid/missing comparison identities, configuration changes and credential-free checkout are covered. Whitespace verification passed.

Hosted verification of the changed workflows and an actual post-merge development scope job remain pending. No release regression or Docker build is claimed from these focused local checks.
