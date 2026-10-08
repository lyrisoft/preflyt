# Repository profiles

Profiles are read-only observations of a selected GitHub repository's default branch at an exact source commit. They are available without an AI model or executor.

## Use

1. Configure the GitHub App and connect an installation using the existing [GitHub onboarding guide](../../README.md#development-status).
2. Select a repository on Repositories, then open its name from that list or the overview.
3. An Owner, Admin or Super Admin can choose **Discover profile** or **Refresh profile**. Other signed-in organization roles can inspect profiles.
4. Inspect the branch, source commit, Git tree SHA, capture time, supported engineering hints and **Controls to review**. Expand a signal to see file paths and exact blob SHAs.

The API exposes GET and POST at /github/repositories/:repositoryId/profile. Both require a session and an active, selected repository. POST additionally requires an administrative role and the configured web Origin. Each saved discovery creates an audit event and a new snapshot; GET returns the latest. Provider access is rechecked before saved evidence is returned. A revoked installation, removed selection or lost repository access blocks viewing/discovery. Provider failures preserve earlier snapshots and show a retryable error.

## Interpretation

- **Detected hint:** a supported file, dependency or workflow reference exists. This does not establish correctness or a successful execution.
- **Not detected:** no supported hint was found in the inspected snapshot. This is not a policy failure or a definitive claim of absence.
- **Unknown:** the necessary coverage is incomplete or unsupported. Truncated trees and unread manifests/workflows never become an absence claim for affected signals.

Discovery covers languages by file extension; Node.js frameworks by dependencies; manifests and lockfiles; CI, tests/test tooling, containers, IaC, migrations, CODEOWNERS and supported scanner configuration/reference hints. Framework dependency parsing currently supports Node.js manifests. Scanner configuration references cover Semgrep, Trivy, Gitleaks and Checkov. A detected hint can coexist with incomplete coverage; check the profile completeness indicator and warnings.

## Security and operational limits

- Installation tokens are scoped to one repository with metadata/read and contents/read. Tokens remain in API memory.
- Reads use the GitHub API with fixed-origin requests. The branch resolves once to a commit and tree; content reads use exact blob SHAs and verify Git object hashes.
- At most 10,000 tree entries and 32 Node manifests/GitHub workflow bodies are inspected. Content is limited to 256 KiB per file; response bodies are limited to 8 MB. Four blob reads run concurrently. Discovery permits four concurrent repositories per API process and one attempt per repository in that process.
- Installation verification and token creation each have a 10-second request timeout; repository requests share a 60-second timeout. Bounds/errors produce partial coverage or an explicit failure.
- Vendor/generated directories, symlinks and submodules are excluded. Only package.json and GitHub workflow bodies are read. Raw contents, dependency versions, secrets and command text are not persisted in profiles.
- Evidence display is bounded to 20 files per signal, prioritizing representative language/framework evidence. Snapshot version, source/tree SHAs, evidence paths/blob SHAs, observations and limitations are persisted in PostgreSQL.
- No clone, dependency install, build, test, scanner, agent, write-back or remediation action is performed.

Apply migrations with pnpm --filter @preflyt/api prisma:migrate before starting the updated API. The repository-profile migration adds a table and relation without changing existing repository/session records. Failed discovery does not overwrite prior evidence. Snapshot records follow repository-record retention: deleting a repository record also deletes its profiles; deselection alone retains them but blocks access. Back up PostgreSQL before upgrades. Deployment-wide concurrency, scheduled refresh, historical browsing and non-Node framework parsing remain future work.
