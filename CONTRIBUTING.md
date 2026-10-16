# Contributing to Preflyt Community Edition

Preflyt Community Edition is prepared for Apache-2.0 self-hosted distribution. Public launch clearance is still in progress. Read [project scope and readiness](docs/planning/open-source-readiness.md), [governance](GOVERNANCE.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Discuss and implement a change

Use a bug report or feature request for non-sensitive work. Describe the user problem before proposing an implementation. For architecture, identity, isolation, policy or licensing changes, agree on the design with maintainers first. Report vulnerabilities privately under [SECURITY.md](SECURITY.md).

Start from the branch requested by maintainers, normally `development`. Keep the change focused and preserve other work. Follow [AGENTS.md](AGENTS.md) and [product guardrails](docs/agents/product-implementation-guardrails.md). Do not fabricate assessment evidence or make AI authoritative over deterministic checks.

## Local setup and verification

Use Node.js 24.4.1 and pnpm 10.26.2. Follow [README local development](README.md#local-development) and the [configuration guide](https://docs.preflytlabs.com/self-hosting/configuration). Install the locked workspace with `pnpm install --frozen-lockfile --ignore-scripts`; prepare the database/client before starting the API and worker.

Run checks appropriate to your change and report exactly what ran. Commands are documented in the README and workspace package files. Integration tests require disposable databases and queue fixtures: follow [test database safety](docs/operations/test-database-safety.md). Never point tests at an application database or run connected repository code without approved isolation. Do not use production credentials to make local checks pass.

For a pull request, explain the problem, resulting behavior, evidence, validation and remaining limitations. Include relevant UI screenshots without credentials, private source or customer data. If checks were not run, say so; never mark them passed. Maintainers control release/publication, not a passing check alone.

## Developer Certificate of Origin

Contributions use the [Developer Certificate of Origin 1.1](DCO), not a CLA. You retain copyright. By signing off, you certify your right to contribute under the applicable license and accept the public contribution record described by the DCO. Original contributions are submitted under Apache-2.0 unless explicitly agreed otherwise; retain the license and attribution of upstream work.

Sign off **each commit** using your own identity:

```sh
git commit -s
```

Git adds a trailer such as:

```text
Signed-off-by: Your Name <your-email@example.com>
```

The sign-off name/email must match the commit author. A GitHub-provided noreply email is acceptable if it is also your commit-author email. Do not sign for someone else. Sign-off is a certification, not a cryptographic signature or copyright assignment.

For your own latest commit, `git commit --amend --no-edit -s` adds the trailer. Coordinate before rewriting any shared branch; maintainers will not rewrite contributor history automatically. The DCO workflow checks all PR commits and does not exempt automated commits. For a bot-authored change without certification, coordinate a properly authored replacement rather than impersonating the bot. Large PRs exceeding the GitHub commit-list API's verifiable range must be split.

Never submit secrets, customer evidence or code you lack rights to share. Explain generated/AI-assisted contributions, review them yourself and verify their provenance and behavior; a tool cannot provide your DCO certification.
