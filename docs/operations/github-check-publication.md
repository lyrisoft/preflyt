# GitHub readiness check publication

Status: manual publication evaluates the published branch policy when one exists. Verified execution can produce a passing check only under an approved pinned workflow contract. Durable automatic publication and single-repository ruleset activation are implemented behind explicit deployment flags. Live disposable-repository acceptance, forks and merge queues remain pending.

For production, use the [deployment and release-gate runbook](../deployment/github-governance-production.md). It includes the two-App boundary, private-repository plan requirement, container configuration and recovery.

## Setup

1. Grant the assessment GitHub App repository **Checks: write** permission and accept the updated installation permissions. Existing repository-read tokens retain their read-only permissions; publication mints a separate token limited to the selected repository.
2. Apply API migrations and regenerate the Prisma client.
3. Enable `GITHUB_CHECK_PUBLICATION_ENABLED=true` on the API deployment. The default is false. For automatic checks, also enable `AUTOMATIC_CHECK_PUBLICATION_ENABLED=true` and the publication flag on both API and worker.
4. The user needs repository-scoped `policy.read` to review and `policy.publish` to publish. GitHub access and installation permissions are checked again before writing.

See [GitHub Checks API](https://docs.github.com/en/rest/checks/runs) for the App permission and check-run contract.

## Review and publish

Open **Quality Gates → Readiness check**, select a repository, enter an open PR number and choose its latest saved assessment. Review the exact commit, GitHub App ID and proposed output, then publish. History is paginated and links to the GitHub check.

The stable check name is `Preflyt / Engineering Readiness`. A required control with approved negative CI evidence produces `failure`. Every other historical preview, including configuration-only PASS and WARN, produces `action_required`. Historical observe assessments cannot establish verified merge readiness. With a published policy, every required rule must be satisfied and at least one required execution rule must have verified evidence before `success` is allowed. Optional incomplete rules also prevent success. It never emits `neutral` or `skipped`, and does not activate a ruleset.

Publication requires an open, non-draft, same-repository PR at the assessment SHA, current saved standards and CI source bindings, and the latest assessment for that commit. Changed previews are rejected. Fork PRs and merge-queue commits are not supported in this slice.

## Verification and recovery

A durable database claim prevents ordinary concurrent publication of the same reviewed result. Requests and verified receipts are audited. GitHub is read back to check the App, check name, external ID, exact SHA, completion status, conclusion and output. A receipt records verification **at publication time**, not continuous readiness or drift monitoring.

A timeout or unverified response is marked `UNKNOWN`. Refresh history, review the same assessment and retry. Before any create request, the publisher searches up to 1,000 check runs for the same App and deterministic external ID, then verifies an existing match rather than creating another. Duplicate matches or an exhausted search limit require review and stop publication. POST requests are not automatically retried. An abandoned in-progress claim can be retried after two minutes; remote GitHub writes and database commits are not a single atomic transaction, so this is bounded recovery rather than a guarantee of exactly-once external writes.

Production enforcement still requires the live acceptance release gate. The managed activation endpoint refuses to require this check without a current automatically published passing PR check for every target branch.

## Reviewed execution contracts

`CI_EXECUTION_CONTRACTS` is a deployment-controlled JSON array, not a user-entered claim. Each entry pins `ruleId`, `signerWorkflow` (owner/repo/.github/workflows/file.yml), `signerDigest` (reviewed 40-character commit SHA), `format` (`junit` or `sarif`), `tool` and `toolVersion`. Review the workflow commands and report generation at that exact commit before configuring it. The workflow must actually execute that rule and produce its report; an empty report is insufficient. Supported adapters are test execution (JUnit), SAST, secret scanning, dependency scanning and container scanning (SARIF). Other execution rules remain incomplete.

Configure the existing offline attestation verifier and allowlist the signer workflow. Publish a new policy after changing contracts: the frozen policy stores the contract configuration digest. An approved CI source must map the rule to the workflow run. The report needs verified GitHub Actions provenance for the same repository, commit and run attempt. Test reports require at least one executed test and no failures. SARIF needs the expected tool/version, zero findings and complete report coverage. Publication rechecks the live workflow run; a rerun, expired evidence or changed contract keeps the result incomplete.

## Local governance acceptance exception

Production requires distinct `GITHUB_GOVERNANCE_APP_ID` and `GITHUB_GOVERNANCE_PRIVATE_KEY`, plus its `GITHUB_GOVERNANCE_INSTALLATION_ID`. The explicit `GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE=true` exception permits the assessment App only with `NODE_ENV=development`, exclusively for `lyrisoft/preflyt-p2-acceptance`. It is rejected for all other repositories and for production. This configuration does not itself activate a ruleset. The authorised local App is 4585551 and its lyrisoft installation is 153542598.

GitHub Team supports native artifact attestations only for public repositories. The currently private acceptance repository cannot complete the signed-report test on that plan; changing its visibility requires explicit approval. Existing production repositories remain private and untouched. See [GitHub artifact attestation availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Automatic checks and managed activation

In **Quality Gates → Readiness check**, enable automatic PR checks for the selected repository. The worker discovers up to 99 open PRs per inventory, creates durable per-PR jobs, and schedules each completed task for reevaluation after sixty seconds. Actual delay depends on batch capacity and GitHub availability. Inventory batches cover ten repositories; processing batches cover twenty due tasks. Large inventories fail explicitly rather than silently skipping targets. Settings are bound to the enabling publisher's current repository permissions; revoked access cannot publish success.

One automatic check is maintained for each PR head SHA. Before reevaluation the worker marks it `action_required`; it then verifies current PR context, saved standards, CI bindings, published policy, trusted execution and live workflow attempts before updating it. Changed heads, closed/draft PRs, disabled settings and failed verification invalidate previously managed results. Database leases, generation checks, exponential backoff and bounded check search recover restarts/timeouts. Provider outages can delay invalidation: GitHub and the Preflyt database are separate systems, and polling is not instantaneous enforcement.

In **Quality Gates → GitHub Rulesets → Deployments**, choose a saved draft, review the exact desired configuration and affected PRs, obtain approval from another authorized administrator, then confirm activation. Both `github.ruleset.manage` and `policy.enforcement.manage` are required; built-in Owner/Admin roles have them. Policy publishers cannot activate protections. The policy Super Admin self-approval exception does not apply to ruleset deployment.

Enable `GITHUB_RULESET_ACTIVATION_ENABLED=true` on the API and configure the separate governance App. Preflight requires current published policies for every target branch, fresh automatically verified passing checks bound to the assessment App, current PR impact, and no merge queue. Fork PRs are rejected. Activation creates a uniquely named organization ruleset targeted only at this repository; existing unmanaged protections are preserved. Legacy drafts need one explicit save to refresh canonical hashes.

The deployment records desired JSON, preview/hash, proposer, approver, source App IDs, GitHub ruleset ID and read-back hash. Unknown creation outcomes recover by the same unique name before another POST. **Verify GitHub** compares the recorded definition with current GitHub state and reports drift. **Roll back** disables only this managed ruleset after checking its recorded observed hash. External changes are never blindly overwritten. Disabling automatic checks is rejected while managed enforcement remains active, unknown or drifted. Resolve or roll back protection first.
