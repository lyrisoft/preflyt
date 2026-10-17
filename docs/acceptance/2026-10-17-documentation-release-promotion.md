# Documentation release promotion

- Corrected the stable documentation default from v0.1.2 to the published v0.1.6 application release.
- Retained v0.1.2 and froze v0.1.3–v0.1.6 from their exact published source tags. Installation examples and downloaded Compose/Kubernetes/environment/helper artifacts match the selected version.
- Kept Next separate, with its unreleased banner and an explicitly published SHA image tag.
- Added a published-release synchronizer that verifies the release image-readiness marker against the Git tag commit, refuses conflicting/partial snapshot overwrites and preserves editable Next content.
- Wired both main application publication paths to build and deploy matching documentation after release creation. The standalone main documentation workflow synchronizes published releases before building; non-main builds use committed snapshots.
- Documentation type checking and production build passed, including version/badge/install/footer/download/Kubernetes checks for every retained version. Workflow syntax and manual/reusable wiring were validated.
- Per the user's instruction to stop testing, no API or browser regression suite was run for this documentation-only correction. No new application release or image build is needed.
