# Optional local companion

For direct agent connections, use [Hosted MCP OAuth](hosted-mcp-oauth.md). The companion is optional for launching local tasks from Preflyt.

MCP and coding-agent connections live under **Integrations → MCP and coding agents**. Findings offer **Verify**, **Verify and fix**, and a link to manage connections. Tokens and MCP configuration are handled by the companion for each task.

## One-time setup

1. Install Node.js 22+, Git, and Codex or Claude Code. Sign in using the agent's own CLI.
2. Download `preflyt-companion.mjs` from Integrations.
3. Start it with a trusted local repository folder:

   ```sh
   node ~/Downloads/preflyt-companion.mjs --server http://localhost:8080/api --workspace /path/to/your/repos
   ```

4. In the browser window, select repositories and approve the computer. Keep the companion process running.

No Preflyt token, agent configuration edit, or per-finding connector installation is needed. The companion uses the locally installed agent and its allowance; model charges are controlled by that agent's account. This is a Node companion, not a packaged/signed desktop application or an autostart service. Installing and running it once is necessary; a browser cannot silently install software or change another application's configuration.

The chosen folder and up to three directory levels beneath it are searched for GitHub checkouts, excluding symlinks, hidden directories, dependency and build folders. Only GitHub repository names are sent to Preflyt. Absolute local paths remain local. Checkout discovery is fixed for a companion session; restart and approve a new connection after changing the workspace or installed agents. A connection approves explicit repositories, never every future repository.

## Tasks

A finding action queues a durable task for the chosen online computer and agent. The server rechecks active membership, organization permissions, repository access and the assessed commit when claiming it. One task runs per companion. Claims are atomic; failed or interrupted jobs do not silently launch a paid retry.

The companion creates a separate Git worktree at the exact assessed SHA. That commit must already exist locally; fetch it using your normal Git workflow if it is missing. Verify uses a detached worktree. Verify and fix uses `preflyt/fix-<job-id>`. Existing checkout edits are preserved. Worktrees stay under the companion's private state folder for review; they are not automatically deleted, committed, pushed, merged or deployed.

Codex uses its read-only or workspace-write sandbox. Claude uses explicit read tools, plus Edit/Write in fix mode, and strict per-task MCP configuration; Bash is not preapproved. Neither path disables agent permission checks. If tests cannot run under those permissions, the agent must say so and return an inconclusive review. Repository hooks/installers, live-service tests and automatic publishing are not authorized by this workflow. Review proposed edits and run any additional checks under your own approved environment.

A finding-specific MCP credential is created only when the companion claims the task. It is passed through the child environment and a private temporary config references the environment variable. It is never put in command arguments, the browser, global agent configuration or server task records. The config is removed on process completion. The agent reads the finding/source and submits actual reasoning, commands and results through the existing Preflyt MCP tools. Task completion requires a submitted verification record. A completed task is not an independently verified finding: returned evidence is **External report**, and VAPT remains **Needs review**.

Cancel or disconnect revokes active task credentials. The companion checks the lease every 10 seconds and terminates the child process group when cancelled or access is lost. A missed one-minute lease or ten-minute queued deadline fails the job. Each local task has a 30-minute timeout and bounded output; raw agent output and credentials are not sent to server logs. Check the companion terminal and local worktree after a failure. Review evidence already submitted stays attached to its finding. No deterministic gate or triage disposition is changed by the connector.

## OAuth and storage

The companion is a fixed public client (`preflyt-companion`) using authorization code + PKCE S256, a random state, issuer/resource binding, a short-lived browser consent request, and a loopback-only `127.0.0.1` callback on a random port. Approval is explicit in the signed-in workspace and lists the repositories being granted. Authorization codes are single-use and expire after five minutes. Access credentials last 15 minutes; refresh credentials rotate atomically and expire after 30 days. Server storage holds only credential hashes. Replaying a code or an already rotated refresh credential fails.

OAuth is the companion's connection transport. The companion provisions a separate, narrow MCP bearer credential for each task; direct native-client discovery and OAuth are implemented separately on the [hosted MCP endpoint](hosted-mcp-oauth.md). The manual finding-scoped MCP connector remains available under Advanced in Integrations.

Browser mutations enforce the configured Origin and session authorization; native OAuth calls use bearer authentication. Repository and organization permissions are rechecked on native calls. A disabled account or disconnected computer cannot claim more tasks. Users can see and disconnect only their own computers in the current workspace. Secrets are excluded from the listing response.

The companion writes private state under `~/.preflyt/companion/<server-hash>` with directory mode 0700 and credential files 0600, using atomic replacement. A process lock prevents two companions rotating the same credential. Use `--state-dir` for an isolated test instance. To pair again after expiry/revocation, stop it, remove its `connection.json`, and restart. Clear the old connection from Integrations. Do not copy state between computers or commit it to Git.

## Deployment

Set `PREFLYT_PUBLIC_API_URL` to the externally reachable API base if it differs from `${WEB_ORIGIN}/api`. The Compose web proxy uses `http://localhost:8080/api`. Use HTTPS outside localhost. The resource is configured by the server, never inferred from an untrusted Host header. Companion traffic is outbound except the temporary loopback pairing callback. No agent or local repository is executed inside the API or worker container.

The API image includes the downloadable script under `/app/resources`. Apply migration `20261019060000_companion_oauth` and regenerate Prisma before deployment. Rebuild API, worker, migration and web images together; retain the existing Strix bridge recreation procedure.

## Verification

- Disposable PostgreSQL tests cover OAuth PKCE/redirect/resource binding, expiry, code/refresh replay, current access, atomic claims, evidence-required completion, cancellation, revocation and abandoned leases.
- A local temporary Git fixture with a stub agent checks exact-commit worktrees, checkout preservation, per-process MCP configuration and cleanup. It performs no model inference.
- Browser tests cover Integrations placement, consent selection, statuses, agent logos, task actions, cancellation, access errors and 320px layouts in both themes.
- Live Compose smoke checks pairing/token issuance, companion polling, MCP access and cleanup. These transport checks do not establish that a real model verified or fixed a vulnerability.
