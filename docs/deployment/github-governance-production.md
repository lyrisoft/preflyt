# Production deployment: GitHub checks and governance


## GitHub workflow verification — 11 October 2026

The normal GitHub Actions integration verifies execution directly against GitHub. Separate report signatures and deployment execution contracts are optional; they are not a setup prerequisite for this path. The optional signed-report instructions below apply only when that stronger verification path is selected. For the normal setup and correct public endpoint paths, use the [stable GitHub connection guide](stable-github-connection.md).

The Action authenticates with GitHub OIDC and submits the exact report bytes and policy check IDs. After the run completes, Preflyt matches the signed GitHub event with a fresh GitHub API read of the repository, PR head, workflow path/ID, run attempt, successful job and completed steps. A server-only audit receipt binds each report checksum and check ID to that run and published policy. Existing source approval, report parsing/integrity, freshness, coverage, rerun and policy checks still apply. The publisher verifies the current GitHub run again. OIDC alone, uploaded reports and caller-supplied success labels cannot create a passing result.

This trusts the configured repository workflow to run its intended commands. It does not independently certify the tool installation or execution environment. Optional signed-report contracts remain available for deployments requiring that stronger boundary. Tests need executed cases with no failures; security reports need a named tool, no findings and no incomplete coverage. Missing, failed, stale, ambiguous or superseded required evidence cannot pass.

This is the deployment contract for the implemented policy-aware readiness publisher. Use it with the [Docker Compose runbook](../operations/docker-compose.md), [check publication guide](../operations/github-check-publication.md) and [signed-report setup](../operations/ci-provenance.md). Deploy an immutable reviewed release, not an unpinned branch checkout.

## Current release boundary

| Capability | Current behavior |
| --- | --- |
| Published branch policy evaluation | Automatic evaluation after verifying completed same-repository GitHub workflow runs at the current PR head SHA. |
| Passing readiness check | Requires every required rule to pass and at least one required execution rule. Normal pipeline evidence uses OIDC, signed GitHub events, completed workflow/job verification and server-only report receipts; report signatures are optional. Native evidence retains its admitted execution and runtime-review requirements. Optional incomplete rules also prevent success. |
| No published policy | Historical observe preview; never publishes success. |
| Check publication | Disabled by default; explicitly enabled automatic PR checks maintain the PR-head result. The UI has no manual Publish check flow. |
| Automatic publication and invalidation after changes | Implemented with durable jobs, per-repository enablement and bounded invalidation/retry polling. |
| Organization ruleset deployment, activation, drift recovery and rollback | Single-repository activation, independent approval, current-state verification and managed rollback are implemented behind an explicit flag. Bounded worker drift verification is implemented. Broader targeting and live private-repository enforcement acceptance remain pending. |
| Fork PRs and merge queues | Not supported by the current publisher. |
| Live end-to-end acceptance | Private-repository passing/failing checks, automatic source registration, DeepSeek PR reviews and final publication-gate failure/timeout/recovery verified on 11 October 2026. The test tunnel is stopped. Permanent deployment and Preflyt-managed ruleset activation/drift/rollback remain unverified. |

Production enforcement still requires the live acceptance tests below. Code and mocked-provider integration tests do not demonstrate GitHub merge enforcement. Publishing a policy does not modify a GitHub Actions workflow. Automatic checks must be explicitly enabled for the repository, and ruleset activation requires separate review and approval.

## One GitHub App by default

Preflyt reuses the GitHub App and installation already connected to the selected repository. A second App is optional, including in production. Assessment, PR feedback and ruleset operations still use separate purpose-limited installation tokens.

| Connection | Permissions and purpose | Configuration |
| --- | --- | --- |
| Connected Preflyt App | Repository Metadata: read, Contents: read, Pull requests: read (write for PR summaries and AI reviews), Actions: read and Checks: write. Organization Members: read supports member access. Organization Administration: write is required only for Preflyt-managed organization rulesets. | Settings → Configuration → GitHub: existing App credentials. The selected repository supplies its installation ID automatically. |
| Optional separate governance App | Organization Administration: write for approved organization ruleset management. Its verified installation must belong to the target organization. | Settings → Configuration → Governance: enable **Use a separate governance App** (`GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED`), then enter its App ID, private key and installation ID. |

New installations default to one App. Existing separate credentials are preserved on upgrade; turn the optional setting off to reuse the connected App. Switching connections requires an API and worker restart. Saved separate credentials are retained while disabled; incomplete selected separate connections fail without falling back to the primary App. GitHub required-check `integration_id` continues to identify the App that publishes the readiness check.

Sharing one App means its private key can authorize all granted permissions. Purpose-limited tokens reduce the permissions of each operation; they do not isolate a compromised App key. Organizations that require separate credentials can opt into the second App. GitHub installation permissions must be approved in GitHub before ruleset activation; selecting an App in Preflyt does not grant permission or change branch protection.

Organization administration is an organization-level authority; repository selection alone does not make it a repository-only permission. Ruleset writes independently enforce exact single-repository scope and independent approval. The existing `policy.publish` permission authorizes readiness publication; it does not expose ruleset activation. Built-in Owner/Admin roles have `github.ruleset.manage` and `policy.enforcement.manage`; both are required for activation. The policy Super Admin exception does not authorize ruleset self-approval.

Provision App private keys, client secrets, webhook secrets and callbacks in **Settings → Configuration** as Super Admin. Managed credentials are encrypted in PostgreSQL; legacy environment values are imported once and cannot overwrite saved settings. Keep `CONFIGURATION_ENCRYPTION_KEY` and `GITHUB_USER_TOKEN_ENCRYPTION_KEY` in deployment-managed secrets, stable across upgrades and restore. Never put credentials or encryption roots in source control, frontend configuration, Docker build arguments or example files. Losing an encryption root prevents decrypting its stored credentials; changing the environment is not a key-rotation procedure. Use HTTPS callbacks matching the deployed public origin and GitHub App registrations. See [deployment configuration](../operations/deployment-configuration.md).

See the official [Checks API](https://docs.github.com/en/rest/checks/runs) and [organization rules API](https://docs.github.com/en/rest/orgs/rules?apiVersion=2026-03-10) for GitHub permission requirements.

## GitHub plan and workflow prerequisites

Normal completed-workflow verification does not require artifact attestations and was exercised on the private GitHub Team acceptance repository. The repository must contain the generated Action/snippet and the default-branch final publication gate. Same-repository PRs are supported; fork PRs and merge queues remain outside this verified integration.

For the optional signed-report path, GitHub-native attestations on private/internal repositories require Enterprise Cloud. An organization-key signer is an alternative when that stronger verification is explicitly required; see [signed report setup](../operations/organization-signed-ci-reports.md). In that mode, keep the signer isolated from untrusted PR code, verify exact original report bytes and pins, and provide the reviewed container trust configuration below. No signer is installed by normal workflow setup.

## Runtime configuration

Keep `NODE_ENV=production` for production deployments. In **Settings → Configuration → Governance**, enable Publish PR checks (`GITHUB_CHECK_PUBLICATION_ENABLED`) only for the configured and reviewed GitHub integration. Enable Automatic PR checks (`AUTOMATIC_CHECK_PUBLICATION_ENABLED`) only after staging checks pass, and Ruleset activation (`GITHUB_RULESET_ACTIVATION_ENABLED`) only after the production release gate passes. All three default false and refresh from the shared database every five seconds; worker consumers apply switches on their next reconciliation tick. GitHub, governance and sign-in connection edits require restarting both API and worker. Infrastructure, encryption roots and the evidence trust settings below remain deployment-managed.

### Optional signed-report verifier

The following variables and container mounts are needed only for the optional signed-report path, not normal completed GitHub workflow verification.

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

The root `.env` file is used for Compose interpolation; arbitrary new keys are **not automatically passed into containers**. The current `docker-compose.yaml` forwards legacy managed settings for the API’s one-time import, plus deployment-managed proof mode, organization public keys and execution contracts. Provision governance credentials through Settings rather than adding runtime environment overrides after import. Verifier paths and trust material still require an explicit reviewed API/worker override with read-only file mounts. Validate the combined Compose configuration without printing resolved secrets. An environment template is not proof that the deployed runtime received the variables.

**Trusted application boundary:** API and worker both receive the same `CONFIGURATION_ENCRYPTION_KEY` and unpack the complete managed configuration, including governance credentials. Environment forwarding only to the API is a bootstrap convention, not credential isolation from the worker. Treat both application processes, their database access and encryption root as privileged. Production requires fresh purpose-limited installation tokens and server-side target/approval checks; a separate governance App is optional. Web, migration, execution-controller and scanner services must not receive managed App credentials or the configuration encryption root. Controllers use dedicated runtime/signing credentials; scan containers receive none of these credentials.

A [reviewable Compose override example](github-evidence.compose.example.yaml) forwards deployment-managed evidence configuration to both API and worker, mounts a reviewed host directory read-only at `/opt/preflyt-attestation`, and forces production mode with the local exception off. Its governance environment fields remain for backwards-compatible first import; saved Settings values take precedence. The worker subsequently reads those credentials from the same encrypted database configuration. Set `PREFLYT_ATTESTATION_DIR` to the protected absolute host directory containing `gh` and `trusted-root.json`, with permissions allowing the non-root runtime to read/execute them. This example fixes the container paths shown in the table; for a derived image, adjust paths and mounts together.

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

A contract approves reviewed workflow execution, not an arbitrary report label. Review the actual command, installed tool/version, failure behavior and report generation at the pinned commit. Keep the signer in the attestation allowlist. Current built-in v1.1.0 definitions support trusted report adapters for every catalogue check; see [engineering check adapters](../operations/engineering-check-adapters.md) for the exact rule, format, completeness and tool contracts. Earlier saved versions retain their original supported-check limits. Native execution coverage is separate. JUnit needs at least one executed test and no failures; SARIF needs the expected tool/version, zero findings and complete coverage. Every required rule in the saved policy still needs evidence.

After changing contracts, create/edit a policy draft against current standards and complete approval/publication again. The policy freezes the contract digest. Trust-root, verifier or allowlist changes invalidate older receipt trust for new evaluations; collect a fresh assessment after re-verification. Historical assessments are immutable.

## Deploy and verify automatic publication

1. Follow the [stable GitHub connection guide](stable-github-connection.md): choose the host/domain, retain the existing database/encryption keys, deploy the reviewed API/web/worker/migration revision and configure the externally routed API base URL.
2. Verify HTTPS sessions, current repository grants, App installation access, signed webhook delivery, queue health and the GitHub endpoint smoke check.
3. Publish the branch policy, enable repository PR checks and optional PR/AI feedback, and commit the generated workflow integration plus default-branch final publication gate. Existing committed snippets must be updated explicitly after an API address change.
4. Run a clean same-repository PR. Confirm completed-run verification, automatic check-source registration, the saved assessment, policy summary, configured AI review, the PR-head check and final gate. No manual mapping, upload or Publish check step is required.
5. In the isolated staging repository, test failed, missing, stale, wrong-SHA and rerun evidence, revoked access and publication-confirmation failure/timeout/recovery. Missing evidence must never become success. Verify published output by read-back.
6. If stronger signed-report verification is selected, configure and independently review its signer, contracts and trust material before exercising that optional path. Do not impose those prerequisites on normal GitHub workflow verification.

Record release SHA, migration results, organization/repository/branch, App and installation IDs, policy/evaluation hashes, GitHub check URL and observed results. Do not record tokens or private keys.

## Enforcement release gate and recovery

Production activation remains blocked until live acceptance verifies automatic passing, failing and incomplete PR results, stale/rerun invalidation, independent approval, activation read-back, actual merge blocking, drift and rollback on a supported staging repository. The implementation now supplies these controls, but local tests do not replace that release gate. Fork PRs and merge queues remain unsupported and activation preflight rejects them.

1. Enable Publish PR checks and Automatic PR checks in Settings → Configuration; API and worker must use identical deployment-managed evidence trust configuration. Enable repository PR checks from the workflow connection in Policies.
2. Verify current automatic passing, failing and incomplete results at exact head SHAs. Confirm worker scheduling, permission revocation, configuration changes and outage recovery. Freshness is bounded by polling and upstream availability; it is not an atomic transaction with GitHub merges.
3. Enable Ruleset activation in Settings → Configuration only after acceptance is recorded. Save the ruleset draft again to refresh legacy hashes. Review the exact repository/branches/check source and current PR impact, obtain independent administrator approval, then confirm activation in Deployments.
4. Verify GitHub ruleset ID and observed JSON/hash. Verify passing merges still require all other GitHub protections; failing and incomplete PRs must be blocked.
5. Change the disposable managed ruleset externally, use Verify GitHub, confirm drift is reported, and confirm rollback refuses to overwrite it. Restore the expected definition through an explicitly reviewed GitHub action before managed rollback.
6. Roll back through Deployments to disable only the dedicated ruleset. Verify read-back, then disable repository automation. Automatic-check disablement is rejected while managed protection remains active, unknown or drifted.

Do not disable credentials/worker or flip publication flags as a substitute for rollback: existing GitHub rulesets remain active and can block merges. During upstream outages, manual authorized GitHub recovery may be necessary. Preserve every unrelated protection and the existing audit records.

Retain audit/publication/attestation records and the additive database schema during application rollback. Restore an earlier immutable application image only after reviewing schema compatibility. Disabling or rotating governance credentials is separate from removing GitHub protections. Retain evidence and configuration history for incident review.

## Local and production connections

One-App mode is supported in local and production deployments. The former `GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE` exception is no longer needed and is ignored. Never copy test keys or installation IDs into production. A connected installation is selected from the authorized repository, and the provider verifies App ownership, organization, suspension state and organization Administration: write before issuing a ruleset token.

## GitHub Team private repositories

Normal GitHub workflow verification works without artifact attestations or a report signer. For deployments explicitly requiring signed reports, private GitHub-native attestations require Enterprise Cloud; the organization-key adapter is an alternative described in [private report setup](../operations/organization-signed-ci-reports.md). No signer or IAM resources are automatically installed.
See the [private repository proof alternatives](../operations/github-check-publication.md#private-repositories-on-github-team).

Ruleset Insights additionally needs repository Administration: read on the assessment App. Insights uses a repository-limited read-only token and never uses the governance write connection.
