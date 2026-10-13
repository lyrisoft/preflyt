# Stable GitHub Actions connection

Use the existing [Docker Compose deployment](../operations/docker-compose.md) or [Kubernetes bundle](../../deploy/kubernetes/README.md). This is the normal GitHub workflow path: copy the snippet, commit it, run the workflow, and let Preflyt verify the run and publish the result. It requires neither manual report uploads nor a report signer.

## Deployment address

Choose the deployment host and HTTPS domain before changing GitHub callbacks or committed workflows. No permanent host or domain has been configured for the local acceptance environment. Its temporary tunnel is stopped.

For the existing same-origin web/API proxy, configure the following addresses. Replace `preflyt.example.com` with the actual deployment domain; this is a placeholder, not a running service.

| Setting | Address |
| --- | --- |
| Deployment `WEB_ORIGIN` | `https://preflyt.example.com` |
| Settings → Configuration → Public Preflyt API URL | `https://preflyt.example.com/api` |
| GitHub App webhook URL | `https://preflyt.example.com/api/github/webhooks` |
| GitHub App setup callback | `https://preflyt.example.com/api/github/setup/callback` |
| GitHub App installation OAuth callback | `https://preflyt.example.com/api/github/oauth/callback` |
| GitHub login callback, if enabled | `https://preflyt.example.com/api/auth/github/callback` |

The `/api` suffix in the public API setting is required for the bundled web proxy. The Action adds `/pipeline/policy` and `/pipeline/results`; the final gate adds `/pipeline/publication`. Using only the web origin reaches the SPA instead of these API endpoints. A separately hosted API may have a different base path; use its actual externally routed API base.

Terminate TLS at the host reverse proxy or Kubernetes ingress and forward the web origin to the web service. Compose publishes only the loopback web port `127.0.0.1:8080`; API, database and cache stay on the container network. Provision certificates and DNS on the selected host. The application stack does not create DNS records or a TLS proxy.

## Preserve the existing workspace

Use the reviewed API, web and migration images at the same immutable revision. Keep the database, queue volume and existing configuration, AI-provider and GitHub-user encryption keys. An upgrade must retain the existing workspace, policies, model settings and credentials; do not seed a second empty workspace to make the connection appear healthy. Follow the Compose backup, migration and restart instructions for the actual destination.

After connection edits, restart both API and worker. Public API address and feature-switch changes refresh at runtime. Saved Settings values take precedence over legacy environment values, so editing dotenv alone does not update an existing connection.

## Configure GitHub once

1. In Settings → Configuration, set the stable public API address and confirm the assessment GitHub App credentials and webhook secret. Enable GitHub event ingestion.
2. Point the intended GitHub App webhook at the stable address. Subscribe to the repository events used by this integration: pull requests, workflow runs and check runs. Keep existing access-management subscriptions where configured. GitHub signs the request; Preflyt verifies the original request body with the shared webhook secret.
3. Enable Publish PR checks and Automatic PR checks in Configuration. On the connected repository, enable PR checks and optional PR summary/AI feedback. Preserve the configured primary/fallback model; adding a stable address does not change the AI route.
4. Publish the target-branch policy. Copy its workflow snippet and commit the integration files into the repository. Install the final publication gate on the default branch. Its `workflow_run` trigger must name the checks workflow.
5. For existing acceptance workflows, update both their Action API URL and the default-branch final gate API URL. Saving the public API setting only changes newly generated snippets; it does not rewrite committed GitHub workflows.

The Action authenticates with GitHub OIDC, sends check IDs and results, and Preflyt verifies the completed workflow/jobs at the exact PR commit before registering check sources. Missing or failed evidence remains incomplete or failed. The final gate waits for verified GitHub publication and fails on errors, failed/incomplete results or timeout. The required PR-head check is `Preflyt / Engineering Readiness`; the final gate's default-branch Actions status does not replace that check.

## Verify the deployed connection

Run the existing smoke utility after event ingestion is configured:

```sh
PREFLYT_SMOKE_GITHUB=true node --env-file=.env scripts/deploy/smoke.mjs
```

It checks web/API readiness and confirms all three pipeline endpoints reject requests without a GitHub identity token, while the webhook rejects unsigned requests. It also checks the error comes from Preflyt's API guard, so an HTML page or unrelated proxy response cannot count as success. It sends no signed GitHub events, policy results or credentials to GitHub. Existing optional recovery-login smoke checks still apply when those credentials are in the environment.

This proves routing and authentication guards, not a completed workflow. Then use a small same-repository PR: confirm workflow results, automatic assessment/source registration, policy comment, configured AI review, PR-head check and final publication gate. Retest a deliberate failing change and publication-confirmation failure. Keep that PR unmerged until its outcome is reviewed.

## Merge protection

Use the connected GitHub App for Preflyt-managed organization rulesets, or optionally select a separate governance App in Settings → Configuration → Governance. The provider requires **Organization Administration: write** on the selected App's installation; repository Administration: read on the assessment App is insufficient. The connected repository supplies its installation automatically; separate credentials are needed only when the optional setting is selected. Restart API and worker after connection edits, then review and approve activation in Merge Protection. Approve GitHub permission changes separately from enabling repository PR checks.

The prior acceptance test demonstrated GitHub blocking a failed required Preflyt check using an owner-created, repository-scoped rule. It did not verify activation through Preflyt's governance App, drift recovery or rollback. Complete those acceptance steps with the correctly configured governance App. Preserve all unrelated GitHub branch protections.

## Current acceptance evidence

On 11 October 2026, the private acceptance repository verified automatic passing/failing policy checks, automatic source registration, PR summaries, DeepSeek PR reviews and final publication-gate failure/timeout/recovery. This used a temporary restricted tunnel; it is not evidence of a permanent production deployment. See [branch acceptance audit](../planning/branch-audit-2026-10-11.md).

Optional signed-report deployments remain documented in [CI report verification](../operations/ci-provenance.md). They are a stronger evidence option, not a prerequisite for this normal GitHub connection.
