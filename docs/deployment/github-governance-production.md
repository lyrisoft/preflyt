# Production deployment: GitHub checks and governance

This is the deployment contract for the policy-aware readiness publisher introduced in `812d7cc`. Use it with the [Docker Compose runbook](../operations/docker-compose.md), [check publication guide](../operations/github-check-publication.md) and [signed-report setup](../operations/ci-provenance.md). Deploy an immutable reviewed release, not an unpinned branch checkout.

## Current release boundary

| Capability | Current behavior |
| --- | --- |
| Published branch policy evaluation | Implemented for manual publication at the current open PR head SHA. |
| Passing readiness check | Conditional on every required rule passing, at least one required execution rule, verified signed reports, reviewed execution contracts and live workflow-run verification. Optional incomplete rules also prevent success. |
| No published policy | Historical observe preview; never publishes success. |
| Check publication | Disabled by default; manual reviewed publication and explicitly enabled automatic publication are available. |
| Automatic publication and invalidation after changes | Implemented with durable jobs, per-repository enablement and bounded invalidation/retry polling. |
| Organization ruleset deployment, activation, drift recovery and rollback | Single-repository activation, independent approval, current-state verification and managed rollback are implemented behind an explicit flag. Broader targeting and scheduled drift sync remain pending. |
| Fork PRs and merge queues | Not supported by the current publisher. |
| Live end-to-end acceptance | Not completed. Local unit/integration checks do not establish production acceptance. |

Production enforcement still requires the live acceptance tests below. Code and mocked-provider integration tests do not demonstrate GitHub merge enforcement. Publishing a policy does not modify a GitHub Actions workflow. Automatic checks must be explicitly enabled for the repository, and ruleset activation requires separate review and approval.

## Separate GitHub Apps

Use two distinct App IDs and private keys in production. An installation ID identifies an App installation in an organization; it is not an App ID. GitHub required-check `integration_id` must identify the assessment App that publishes the check.

| Connection | Permissions and purpose | Configuration |
| --- | --- | --- |
| Assessment App | Repository Metadata: read, Contents: read and Pull requests: read for existing profiling/PR flows; Actions: read for live workflow-run identity; Checks: write for readiness publication. Organization Members: read is used by the separate member access flow. | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`; retain existing client ID/secret and login/callback settings. |
| Governance App | Organization Administration: write for approved organization ruleset management. Install in the intended GitHub organization; restrict its operational use to approved targets. | `GITHUB_GOVERNANCE_APP_ID`, `GITHUB_GOVERNANCE_PRIVATE_KEY`, `GITHUB_GOVERNANCE_INSTALLATION_ID`. |

The ordinary assessment App must not retain Organization Administration: write in production. After the local shared-App test, remove that privileged permission from the assessment App before using its connection in production. Accept updated installation permissions and verify the resulting installation metadata. Do not reuse a PAT, governance key or governance token as the assessment connection.

Organization administration is an organization-level authority; repository selection alone does not make it a repository-only permission. Ruleset writes independently enforce exact single-repository scope and independent approval. The existing `policy.publish` permission authorizes readiness publication; it does not expose ruleset activation. Built-in Owner/Admin roles have `github.ruleset.manage` and `policy.enforcement.manage`; both are required for activation. The policy Super Admin exception does not authorize ruleset self-approval.

Store private keys, client secrets, webhook secrets and `GITHUB_USER_TOKEN_ENCRYPTION_KEY` in deployment-managed secrets. Never put them in source control, frontend configuration, Docker build arguments or example files. Keep the user-token encryption key stable across upgrades and restore; changing it invalidates encrypted stored tokens. Use HTTPS callbacks matching the deployed public origin and GitHub App registrations.

See the official [Checks API](https://docs.github.com/en/rest/checks/runs) and [organization rules API](https://docs.github.com/en/rest/orgs/rules?apiVersion=2026-03-10) for GitHub permission requirements.

## GitHub plan and workflow prerequisites

GitHub-native artifact attestations for private/internal repositories require **GitHub Enterprise Cloud**. GitHub Free, Pro and Team support them only for public repositories. See [GitHub attestation availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

For private production repositories on GitHub Team, this signed-report path cannot establish verified passing execution. Keep results incomplete and production required-check activation unavailable. Do not make production repositories public, weaken proof validation, or treat an administrator upload as verified evidence to bypass the plan limitation. A public disposable test validates only that test environment; it does not demonstrate private-repository support on Team.

The workflow must execute the test/scanner and attest the exact original JUnit/SARIF report bytes. Pin third-party Actions and signing workflow code to reviewed commit SHAs. Attestation generation requires workflow `id-token: write`, `attestations: write` and `contents: read`; these belong to the workflow's GitHub token and are distinct from Preflyt App permissions. No repository workflow editing permission is required by the current Preflyt publisher.

The proof must match the observation repository, commit, workflow run, attempt and signer. A merge-ref SHA is not a PR head SHA. The current attestation importer does not support cross-repository reusable signing; do not promise central reusable-workflow coverage until that path is implemented and tested. Self-hosted runner attestations are rejected by the current verifier.

## Runtime configuration

Set `NODE_ENV=production` and `GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE=false`. Leave `GITHUB_CHECK_PUBLICATION_ENABLED=false` until the manual-publication smoke checks below pass. Enable `AUTOMATIC_CHECK_PUBLICATION_ENABLED` on API and worker only after staging checks pass. Enable `GITHUB_RULESET_ACTIVATION_ENABLED` on the API only after the production release gate passes. All three flags default false.

| Variable | Requirement |
| --- | --- |
| `CI_ATTESTATION_GH_PATH` | Absolute path to the reviewed executable GitHub CLI inside the container. |
| `CI_ATTESTATION_GH_SHA256` | SHA-256 of that exact binary, in lowercase hexadecimal. |
| `CI_ATTESTATION_ROOT_PATH` | Absolute path to the reviewed Sigstore trusted-root file inside the container. |
| `CI_ATTESTATION_ROOT_SHA256` | SHA-256 of that exact file, in lowercase hexadecimal. |
| `CI_ATTESTATION_WORKFLOWS` | JSON array of exact `owner/repo/.github/workflows/file.yml` signer paths. |
| `CI_EXECUTION_CONTRACTS` | Reviewed JSON array of rule-to-workflow contracts; see below. |

Obtain the CLI and trusted roots through a reviewed administration process, verify their provenance, and record their hashes in the release record. Provide a compatible executable and roots through a derived image or read-only mounts. The base API image does not include the configured verifier. Use container paths rather than developer-machine paths; verify that the non-root runtime can execute/read them and write its bounded temporary files. Verification is offline and does not need a GitHub token.

API and worker must use the same workflow allowlist, trust-root/binary hashes and execution contracts when collecting assessments. The API verifies uploaded bundles; the worker freezes receipt validation in event-triggered assessments. Mismatched configuration leaves evidence incomplete.

The root `.env` file is used for Compose interpolation; arbitrary new keys are **not automatically passed into containers**. The current `docker-compose.yaml` forwards the publication flag, but does not forward the attestation, execution-contract or governance settings. Supply a reviewed production override that explicitly maps the values to API/worker and mounts the verifier files read-only. Do not pass governance credentials to the web, worker or migration service. Validate the combined Compose configuration without printing resolved secrets. An environment template is not proof that the deployed runtime received the variables.

A [reviewable Compose override example](github-evidence.compose.example.yaml) forwards the evidence configuration to both API and worker, mounts a reviewed host directory read-only at `/opt/preflyt-attestation`, and forces production mode with the local exception off. It forwards governance credentials only to the API for the reviewed deployment endpoint. Set `PREFLYT_ATTESTATION_DIR` to the protected absolute host directory containing `gh` and `trusted-root.json`, with permissions allowing the non-root runtime to read/execute them. This example fixes the container paths shown in the table; for a derived image, adjust paths and mounts together.

Use the same reviewed override on configuration checks, startup, upgrades and rollback; otherwise the services lose their evidence configuration. For example, from the repository root, after replacing placeholders and keeping publication disabled:

```sh
docker compose --env-file .env -f docker-compose.yaml \
  -f docs/deployment/github-evidence.compose.example.yaml config --quiet
docker compose --env-file .env -f docker-compose.yaml \
  -f docs/deployment/github-evidence.compose.example.yaml \
  up -d --wait --wait-timeout 180
```

`config --quiet` checks Compose interpolation/schema without dumping resolved secrets. It does not verify mounted file hashes, executable compatibility, GitHub permissions or live acceptance. Review those separately before publication. The example is optional and is not automatically loaded by plain `docker compose up`.

Contract example (replace every placeholder through reviewed deployment configuration):

```json
[
  {
    "ruleId": "tests.required",
    "signerWorkflow": "your-org/your-repo/.github/workflows/tests.yml",
    "signerDigest": "<reviewed full 40-character workflow commit SHA>",
    "format": "junit",
    "tool": "<reviewed test tool name>",
    "toolVersion": "<reviewed test tool version>"
  }
]
```

A contract approves reviewed workflow execution, not an arbitrary report label. Review the actual command, installed tool/version, failure behavior and report generation at the pinned commit. Keep the signer in the attestation allowlist. Supported contracts are `tests.required` with JUnit and `security.sast`, `secrets.scan`, `security.dependencies`, `containers.scan` with SARIF. Other execution rules remain unsupported. JUnit needs at least one executed test and no failures; SARIF needs the expected tool/version, zero findings and complete coverage. Every required rule in the saved policy still needs evidence.

After changing contracts, create/edit a policy draft against current standards and complete approval/publication again. The policy freezes the contract digest. Trust-root, verifier or allowlist changes invalidate older receipt trust for new evaluations; collect a fresh assessment after re-verification. Historical assessments are immutable.

## Deploy and verify manual publication

1. Back up PostgreSQL and rehearse restore using the Compose runbook. Record the prior application image revision and configuration hashes without recording secret values.
2. Deploy the reviewed API/web/worker release and run `prisma migrate deploy` with migration-owner credentials. Include `20261009220000_policy_check_evaluation` and `20261009230000_automatic_readiness_governance`, which add publication proof, automation jobs and managed deployment receipts. Source deployments also regenerate Prisma. Prebuilt images must already include the matching generated client.
3. Keep the publication flag off. Verify HTTPS sessions, current repository grants, App installation access, signed webhook processing, queue health and authorized read-only evidence views.
4. Verify the binary/root hashes and runtime configuration. Approve the numeric workflow identity for each supported adopted rule. Import original report bytes and verify their signed bundles against the exact workflow observation.
5. Save the standards selection and execution contracts before policy review. Approve and publish the explicit branch policy. Collect a new assessment after evidence verification; an older assessment is not upgraded in place.
6. In an isolated supported staging repository, test passing, failed, missing, stale, wrong-SHA and rerun evidence. Test unauthorized actors, revoked repository access and changed contract/trust configuration. Missing evidence must never become success. Verify permissions and published output by read-back.
7. Enable `GITHUB_CHECK_PUBLICATION_ENABLED=true` only for the reviewed manual-publication rollout. Under Quality Gates → Readiness check, select the latest assessment for an open same-repository PR, review the exact commit/App/output and publish. Confirm the stable check name, source App, SHA, conclusion, output and stored policy/evaluation hashes.
8. Test timeout recovery without automatically repeating a POST. `UNKNOWN` requires review and bounded recovery of the same deterministic publication; duplicate matches stop the write.

Record release SHA, migration results, organization/repository/branch, App and installation IDs, workflow/tool pins, policy/evaluation hashes, GitHub check URL and observed results in the acceptance record. Do not record original report contents, tokens or private keys.

## Enforcement release gate and recovery

Production activation remains blocked until live acceptance verifies automatic passing, failing and incomplete PR results, stale/rerun invalidation, independent approval, activation read-back, actual merge blocking, drift and rollback on a supported staging repository. The implementation now supplies these controls, but local tests do not replace that release gate. Fork PRs and merge queues remain unsupported and activation preflight rejects them.

1. Enable publication and automatic publication on API and worker using identical evidence configuration. Enable repository automation under Quality Gates → Readiness check.
2. Verify current automatic passing, failing and incomplete results at exact head SHAs. Confirm worker scheduling, permission revocation, configuration changes and outage recovery. Freshness is bounded by polling and upstream availability; it is not an atomic transaction with GitHub merges.
3. Enable activation only after acceptance is recorded. Save the ruleset draft again to refresh legacy hashes. Review the exact repository/branches/check source and current PR impact, obtain independent administrator approval, then confirm activation in Deployments.
4. Verify GitHub ruleset ID and observed JSON/hash. Verify passing merges still require all other GitHub protections; failing and incomplete PRs must be blocked.
5. Change the disposable managed ruleset externally, use Verify GitHub, confirm drift is reported, and confirm rollback refuses to overwrite it. Restore the expected definition through an explicitly reviewed GitHub action before managed rollback.
6. Roll back through Deployments to disable only the dedicated ruleset. Verify read-back, then disable repository automation. Automatic-check disablement is rejected while managed protection remains active, unknown or drifted.

Do not disable credentials/worker or flip publication flags as a substitute for rollback: existing GitHub rulesets remain active and can block merges. During upstream outages, manual authorized GitHub recovery may be necessary. Preserve every unrelated protection and the existing audit records.

Retain audit/publication/attestation records and the additive database schema during application rollback. Restore an earlier immutable application image only after reviewing schema compatibility. Disabling or rotating governance credentials is separate from removing GitHub protections. Retain evidence and configuration history for incident review.

## Local exception is not a production deployment pattern

The authorized local test may share assessment App `4585551`, installed in lyrisoft as `153542598`, only for `lyrisoft/preflyt-p2-acceptance`, with explicit `NODE_ENV=development` and `GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE=true`. The governance configuration helper rejects this exception in production and for other repositories. The deployment endpoint checks this restriction before opening governance credentials.

Do not copy these test identifiers, keys or the exception flag into production. Do not change a production deployment to development mode to bypass separation. A later production governance App must have a distinct App ID, key and verified organization installation.
