# GitHub readiness check publication

Application connections and feature switches are now provisioned in **Settings → Configuration** by Super Admin. Environment names below describe the legacy import contract; once stored, database values take precedence. See [deployment configuration](deployment-configuration.md). Infrastructure and execution trust controls remain deployment-managed.

Status: automatic PR publication and final publication gates are implemented. Same-repository PR execution can pass after completed workflow/job verification; optional signatures retain their existing stricter verification path.

For production, use the [deployment and release-gate runbook](../deployment/github-governance-production.md). It includes one-App setup and optional credential separation, stable endpoint configuration, optional signed-report requirements and recovery.

## GitHub workflow verification — 11 October 2026

The normal GitHub Actions integration verifies execution directly against GitHub. Separate report signatures and deployment execution contracts are optional; they are not a setup prerequisite for this path. This supersedes earlier mandatory-signer instructions below.

The Action authenticates with GitHub OIDC and submits the exact report bytes and policy check IDs. After the run completes, Preflyt matches the signed GitHub event with a fresh GitHub API read of the repository, PR head, workflow path/ID, run attempt, successful job and completed steps. A server-only audit receipt binds each report checksum and check ID to that run and published policy. Existing source approval, report parsing/integrity, freshness, coverage, rerun and policy checks still apply. The publisher verifies the current GitHub run again. OIDC alone, uploaded reports and caller-supplied success labels cannot create a passing result.

This trusts the configured repository workflow to run its intended commands. It does not independently certify the tool installation or execution environment. Optional signed-report contracts remain available for deployments requiring that stronger boundary. Tests need executed cases with no failures; security reports need a named tool, no findings and no incomplete coverage. Missing, failed, stale, ambiguous or superseded required evidence cannot pass.

## Setup

1. Grant the assessment GitHub App repository **Checks: write** permission and accept the updated installation permissions. Existing repository-read tokens retain their read-only permissions; publication mints a separate token limited to the selected repository.
2. Apply API migrations and regenerate the Prisma client.
3. As Super Admin, enable Publish PR checks (`GITHUB_CHECK_PUBLICATION_ENABLED`) in **Settings → Configuration → Governance**. The default is false. For automatic checks, also enable Automatic PR checks (`AUTOMATIC_CHECK_PUBLICATION_ENABLED`). Both API and worker refresh these switches from the shared database every five seconds; worker consumers apply them on their next reconciliation tick. Connection edits require restarting both processes; changing a legacy environment value after import does not change the saved configuration.
4. The user needs repository-scoped `policy.read` to review and `policy.publish` to publish. GitHub access and installation permissions are checked again before writing.

See [GitHub Checks API](https://docs.github.com/en/rest/checks/runs) for the App permission and check-run contract.

## Automatic PR feedback

Enable PR checks for the repository, publish its target-branch policy and commit the generated Action/snippet and default-branch final gate. Preflyt verifies completed runs, registers check sources, saves assessments and maintains the stable `Preflyt / Engineering Readiness` check and optional policy summary on the PR. There is no manual Publish check flow in the UI.

Require that PR-head check in GitHub branch rules. The separate `workflow_run` gate uses trusted default-branch code and waits up to ten minutes for verified publication; incomplete/failed publication, errors, stale runs and timeout fail its job. Its Actions job belongs to the default-branch commit and is not a substitute for the PR-head required check.

Optional PR AI reviews run from the verified workflow assessment and post advisory feedback on the PR. They exclude Preflyt's bundled Action, generated gate workflow and `.preflyt` files. User-authored workflows/custom Actions remain reviewable. AI cannot override policy or branch rules. The configured default model and fallback are preserved. Each has a separate bounded request deadline, so a slow primary cannot consume the fallback's entire allowance. DeepSeek structured reviews request final JSON with thinking disabled to avoid exhausting the response before returning findings.

## Verification and recovery

A durable database claim prevents ordinary concurrent publication of the same reviewed result. Requests and verified receipts are audited. GitHub is read back to check the App, check name, external ID, exact SHA, completion status, conclusion and output. A receipt records verification **at publication time**, not continuous readiness or drift monitoring.

A timeout or unverified response is marked `UNKNOWN`. Refresh history, review the same assessment and retry. Before any create request, the publisher searches up to 1,000 check runs for the same App and deterministic external ID, then verifies an existing match rather than creating another. Duplicate matches or an exhausted search limit require review and stop publication. POST requests are not automatically retried. An abandoned in-progress claim can be retried after two minutes; remote GitHub writes and database commits are not a single atomic transaction, so this is bounded recovery rather than a guarantee of exactly-once external writes.

Production enforcement still requires the live acceptance release gate. The managed activation endpoint refuses to require this check without a current automatically published passing PR check for every target branch.

## Optional signed-report execution contracts

`CI_EXECUTION_CONTRACTS` is a deployment-controlled JSON array, not a user-entered claim. Each entry pins `ruleId`, `signerWorkflow` (owner/repo/.github/workflows/file.yml), `signerDigest` (reviewed 40-character commit SHA), `format` (`junit` or `sarif`), `tool` and `toolVersion`. Review the workflow commands and report generation at that exact commit before configuring it. The workflow must actually execute that rule and produce its report; an empty report is insufficient. Current built-in v1.1.0 packs support the pipeline report contracts listed in [Engineering check report adapters](engineering-check-adapters.md), including type/build command outcomes and component/resilience test execution. Earlier saved pack versions retain their original capabilities. Every required rule still needs its own approved execution contract and adequate report coverage. Native scanner support is a separate, narrower matrix in the [native execution guide](native-execution.md); report import support does not provide a native adapter.

Configure the existing offline attestation verifier and allowlist the signer workflow. Publish a new policy after changing contracts: the frozen policy stores the contract configuration digest. An approved CI source must map the rule to the workflow run. The report needs verified GitHub Actions provenance for the same repository, commit and run attempt. Test reports require at least one executed test and no failures. SARIF needs the expected tool/version, zero findings and complete report coverage. Publication rechecks the live workflow run; a rerun, expired evidence or changed contract keeps the result incomplete.

## Local governance acceptance exception

Preflyt uses the connected GitHub App and the selected repository's installation by default, including in production. That installation needs Organization Administration: write for the current organization-ruleset activation path. A separate governance App is optional in **Settings → Configuration → Governance**: enable **Use a separate governance App** and supply its credentials. Existing separate connections are preserved on upgrade; switch the option off to use the connected App. API and worker share the configuration encryption root and can decrypt managed credentials; keep these out of web, migration, execution-controller and scanner services. This configuration alone never activates a ruleset.

For the optional GitHub-native signed-report path, private artifact attestations require Enterprise Cloud. The normal completed-workflow path was verified on the private GitHub Team acceptance repository without a signer. Neither path requires making the repository public. See [GitHub artifact attestation availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Automatic checks and managed activation

In **Policies**, enable PR checks for the selected repository’s workflow connection. The worker discovers up to 99 open PRs per inventory, creates durable per-PR jobs, and schedules each completed task for reevaluation after sixty seconds. Actual delay depends on batch capacity and GitHub availability. Inventory batches cover ten repositories; processing batches cover twenty due tasks. Large inventories fail explicitly rather than silently skipping targets. Settings are bound to the enabling publisher's current repository permissions; revoked access cannot publish success.

One automatic check is maintained for each PR head SHA. Before reevaluation the worker marks it `action_required`; it then verifies current PR context, saved standards, CI bindings, published policy, trusted execution and live workflow attempts before updating it. Changed heads, closed/draft PRs, disabled settings and failed verification invalidate previously managed results. Database leases, generation checks, exponential backoff and bounded check search recover restarts/timeouts. Provider outages can delay invalidation: GitHub and the Preflyt database are separate systems, and polling is not instantaneous enforcement.

In **Merge Protection → Branch rules → Deployments**, choose a saved draft, review the exact desired configuration and affected PRs, obtain approval from another authorized administrator, then confirm activation. Both `github.ruleset.manage` and `policy.enforcement.manage` are required; built-in Owner/Admin roles have them. Policy publishers cannot activate protections. The policy Super Admin self-approval exception does not apply to ruleset deployment.

Enable Ruleset activation (`GITHUB_RULESET_ACTIVATION_ENABLED`) in Settings → Configuration and ensure the selected GitHub App has the required organization permission. A separate governance App is optional. Restart API and worker after connection edits; the activation switch refreshes live. Preflight requires current published policies for every target branch, fresh automatically verified passing checks bound to the assessment App, current PR impact, and no merge queue. Fork PRs are rejected. Activation creates a uniquely named organization ruleset targeted only at this repository; existing unmanaged protections are preserved. Legacy drafts need one explicit save to refresh canonical hashes.

The deployment records desired JSON, preview/hash, proposer, approver, source App IDs, GitHub ruleset ID and read-back hash. Unknown creation outcomes recover by the same unique name before another POST. **Verify GitHub** compares the recorded definition with current GitHub state and reports drift. **Roll back** disables only this managed ruleset after checking its recorded observed hash. External changes are never blindly overwritten. Disabling automatic checks is rejected while managed enforcement remains active, unknown or drifted. Resolve or roll back protection first.


### Private repositories on GitHub Team

The normal OIDC, signed-webhook and GitHub workflow/job verification path works without artifact attestations or an external signer. Optional GitHub-native artifact attestations for private/internal repositories require Enterprise Cloud. The organization-key adapter remains available when stronger signed-report evidence is explicitly required; see [private report setup](organization-signed-ci-reports.md). No signer is installed by the normal snippet flow.
