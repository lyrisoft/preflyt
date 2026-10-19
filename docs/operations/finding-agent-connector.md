# Manual finding MCP connector

Use [Hosted MCP OAuth](hosted-mcp-oauth.md) for the default native agent connection. The [local companion](local-companion.md) is optional for launching local tasks. Setup and revocation live under **Integrations → MCP and coding agents**. The instructions below cover the **Advanced: manual MCP connection** fallback.

Open a source finding under **Findings**. **Copy verification task** copies the finding, assessed commit, saved analysis, and bounded redacted source excerpt. It does not call a model or create credentials. Paste it into your coding agent in an authorized checkout of the repository.

To send review results back, choose **Manage agent connections**, open **Advanced: manual MCP connection** in Integrations, select **Codex** or **Claude Code**, then **Create connection**. This requires permission to run AI reviews on that repository. The token authorizes exactly one finding in one assessment at one source commit, expires after 24 hours, and is stored only as a hash by Preflyt. Copy it into the `PREFLYT_FINDING_TOKEN` environment variable of the process starting your agent. Keep it out of Git, prompts, screenshots, and shell history. The dialog shows the token only during setup; create another connection if you lose it. **Revoke connection** immediately disables an existing credential.

The dialog supplies the correct endpoint for the deployment. For local Compose, it is `http://localhost:8080/api/mcp`. Localhost works for agents running on the same machine. Remote/cloud agents require a reachable HTTPS deployment with the same repository permissions; do not expose the local development stack to make it reachable.

## Codex

Add to `~/.codex/config.toml`, using the URL supplied by Preflyt:

```toml
[mcp_servers.preflyt_finding]
url = "http://localhost:8080/api/mcp"
bearer_token_env_var = "PREFLYT_FINDING_TOKEN"
```

## Claude Code

Merge into the project's `.mcp.json`. Claude expands the token environment variable when loading this server:

```json
{
  "mcpServers": {
    "preflyt_finding": {
      "type": "http",
      "url": "http://localhost:8080/api/mcp",
      "headers": {"Authorization": "Bearer ${PREFLYT_FINDING_TOKEN}"}
    }
  }
}
```

Restart or reconnect your agent after setting its environment/configuration. Paste the copied verification task. Each token identifies a single finding; replace the token when reviewing another finding. Configurations contain no credential values and are compatible with the clients' normal MCP setup.

## Tools and evidence

The stateless Streamable HTTP endpoint supports initialization, notifications, ping, tool listing and tool calls. It returns JSON; GET returns 405 because it does not provide a server-initiated event stream. Browser origins are checked, browser cookies do not authorize MCP access, and repository/member permissions are rechecked for every authenticated call. No source download URL or GitHub credentials are exposed.

| Tool | Behavior |
|---|---|
| `preflyt_get_finding` | Reads the connection's finding and external review history |
| `preflyt_get_source_context` | Reads its saved bounded, redacted excerpt; additional source stays in your authorized checkout |
| `preflyt_submit_verification` | Appends agent name, assessed commit, `SUPPORTED`, `NOT_REPRODUCED` or `INCONCLUSIVE` outcome, reasoning, actual commands, and results |
| `preflyt_link_fix_pr` | Links an externally reported same-repository GitHub PR, assessed commit, tested `patchSha`, and summary |

Write calls require a unique 8–80 character `requestKey`; retry the same key only with identical content. Each text field is bounded to 12,000 characters, and credential-looking content is rejected. Each finding retains up to 50 external evidence records. Connections and submissions are audited; retries do not duplicate records. Linked PRs and test results are external assertions, not independently fetched or attested by Preflyt.

The finding page displays returned evidence as **External report**. Original findings, Needs review status, assessment results, and deterministic merge rules remain unchanged. The connector cannot mark findings verified/resolved, execute code, create branches, open/merge PRs, or modify a repository. Agents use their own permissions and environment for reproduction, testing and proposed fixes. Preflyt remains source-only; live service testing needs separate authorization.
