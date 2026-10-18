# Policy-scoped workflow setup — 18 October 2026

The standalone PR workflow generator now derives setup from executable published policy checks. Fixed scanner recipes use checkout and the Action's provisioned tools. Lint, type checks and builds install dependencies for the selected command directory, using a detected workspace installation root where applicable. They do not inherit a test job's services, environment, Docker Compose startup, migrations or seed steps. Only the built-in container scan proposes a local image build; an explicit scan-command override does not.

Test infrastructure is considered only when the selected test command, runtime and directory match an existing supported verification job. Separate unit/integration scripts and package directories cannot borrow each other's setup. Conflicting job environments, multiple test steps or package scopes, unknown shell commands, earlier checks and unsupported contexts produce setup review notes instead of guessed infrastructure. Reusing a matching job is evidence of a candidate setup, not proof that every prerequisite is necessary or that the tests will pass; its services and environment remain visible for review.

AI receives the same filtered choices and cannot select a static check's unrelated test setup by supplying its old source identifier. The product-owned Preflyt CI setup skill is version 2, with both downloadable skill files kept in sync. The existing-workflow edit contract still preserves the user's existing CI/deployment behavior.

Generated standalone workflows record a policy setup signature. A policy, command or setup change regenerates the draft with the original shown in the comparison, preventing old test infrastructure from silently surviving a new static-only setup. Comments and timeout changes survive when the generated setup and policy signature still match. Existing PR trigger, exact PR-head checkout, read-only source access, identity permission and terminal gate validation are retained.

Verification:

- 87 focused API tests passed across generator, AI choice/skill lifecycle, setup controller/provider, workflow validation and snippets.
- An isolated snapshot of the staged files passed those same 87 tests and the API TypeScript check without unrelated working-tree changes.
- Documentation production build, deployment asset/link checks, environment reference and version checks passed.
- Read-only local MaiGuard source reproduction used its actual `merge-verify.yml` and manifests. Scanner-only output had no project install or infrastructure; API lint output contained Node setup and `npm ci` with no database, Compose, migration, seed or test-environment setup.
- Staged diff whitespace checks passed. No repository code was executed by generation. Model inference was mocked in tests; no live GitHub Actions run, push, PR or deployment was performed. No worker was interrupted.
