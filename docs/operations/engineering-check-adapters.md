# Engineering check report adapters

Built-in standard packs version **1.1.0** enable trusted pipeline evidence for every deterministic control in the current catalogue. Version 1.0.0 remains available for existing saved selections and policies. New recommendations use 1.1.0. To adopt it, edit the repository's standards selection, choose the new pack versions, save, then edit or create and approve a policy revision. Saving standards never silently rewrites a published policy or old assessment.

| Control | Required report | What the approved workflow must execute |
| --- | --- | --- |
| Required tests | JUnit | At least one actual non-skipped test |
| Type checking | JUnit | The repository's language-specific type checker; report its actual command outcome as an executed case |
| Build validation | JUnit | The actual application build; report its actual command outcome as an executed case |
| Component tests | JUnit | Actual component test execution, not only test discovery |
| Timeout and retry controls | JUnit | Tests that exercise the applicable timeout and retry behavior |
| Lint validation | SARIF | The applicable reviewed linter rules |
| Secret scanning | SARIF | A complete reviewed secret scan |
| Static application security | SARIF | A complete reviewed SAST scan |
| Dependency vulnerabilities | SARIF | A vulnerability scan with the approved tool/database coverage |
| Container vulnerabilities | SARIF | A scan of the applicable built image, tied to its source commit |
| Infrastructure policy | SARIF | Reviewed Terraform/Kubernetes policy checks |
| Unsafe infrastructure exposures | SARIF | Reviewed rules covering public exposure and insecure network configuration |

CI configuration and dependency lockfiles continue to use pinned repository-profile evidence. Their configuration outcomes do not claim tool execution.

## Trust and execution

Reuse the existing `CI_EXECUTION_CONTRACTS` deployment configuration and approved CI source mapping. Every report adapter uses the existing original-byte checksum/schema validation, exact commit/installation/repository binding, provenance verification and reviewed workflow commit. SARIF additionally requires the configured tool name/version, successful complete execution and zero findings for a passing result. JUnit requires at least one actual executed case; zero or all-skipped cases are incomplete. Failed results remain failures; source mappings and provider success alone cannot establish a pass.

For command controls, a JUnit case represents an actual type-check/build invocation, rather than pretending it is a unit test. The reviewed pinned workflow must run that command, retain failures and produce the report. Administrators must verify this coverage before approving a contract. Do not reuse a generic passing test report as proof of another control. A workflow contract is a trust decision about reviewed executable code, not an automatic statement that every report has adequate coverage.

Reusable workflows can supply these reports for multiple repositories and language stacks. The called workflow must select and actually run the relevant reviewed tool for the repository's stack. Reports remain bound to the caller's exact source commit. Preflyt does not install tools or rewrite repository pipelines merely because a standard was selected.

Existing native container adapters remain available for supported tools under their reviewed Docker/Kubernetes execution configuration. Pipeline import support does not expand native execution permissions or execute repository code on the API host. Unsupported native dispatch remains explicit; use the trusted pipeline route where no native adapter exists.

## Type/build command reports

The [CI command reporter](../deployment/ci-command-report.mjs) wraps an actual type-check or build invocation and emits a bounded JUnit result without recording command output or credentials. Vendor it into the reviewed workflow and pin that workflow's commit in the existing execution contract. It runs with the pipeline's existing installation/runtime; it does not install dependencies.

```sh
node /opt/preflyt/ci-command-report.mjs types.required /reports/types.xml -- /usr/local/bin/node /opt/typescript/bin/tsc --noEmit
node /opt/preflyt/ci-command-report.mjs build.required /reports/build.xml -- /usr/local/bin/node /opt/application-build.mjs
```

Choose the actual executable for your language and build system in reviewed workflow code. Import and attest each report using the existing CI artifact flow. The reporter preserves successful/failed command outcomes, records zero executed cases for unavailable or interrupted execution and exits with code 2, uses no shell and emits no logs. It intentionally cannot wrap component/resilience tests as a single successful command; those controls must supply actual executed JUnit test cases. The reporter alone is not trusted evidence until provenance, workflow approval and exact-commit source mapping validate.

Workflow result publication must distinguish exit code 2 (incomplete execution) from exit code 1 (executed command failure), rather than declaring an interrupted command successful. The empty report never establishes passing control coverage.
