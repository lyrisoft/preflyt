# Workflow editor branch lookup errors

The workflow editor reads the selected published policy's branch, not necessarily the repository's default branch. GitHub's workflow list can include an active workflow even when that policy branch does not exist.

Previously, all GitHub 404 responses were translated into a repository-access 403. After repository identity is verified, workflow loading now reports a missing policy branch or workflow file as 404 with the branch/path and a recovery action. A denied branch/file read remains 403 with GitHub App access and Contents read guidance. Repository metadata denial keeps the existing generic access error. No branch fallback or permission bypass is introduced.

Verification: 15 focused workflow-provider and cache tests passed, including missing branch, missing workflow file, denied reads, and repository metadata denial. The regression cases verify that a missing `main` policy branch never falls back to `master`.

Read-only GitHub verification of the reported repository confirmed that its default branch is `master`, the selected workflow is `.github/workflows/development.yml`, and the `main` branch lookup returns 404. Production policies and repository files were not changed.
