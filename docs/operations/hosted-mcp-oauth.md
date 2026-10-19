# Hosted MCP OAuth

**Integrations → MCP and coding agents** defaults to a hosted, Streamable HTTP MCP connection. Users add the Preflyt endpoint in their agent once, sign in to Preflyt in the browser, and approve selected repositories. The agent manages its own OAuth credentials. No downloaded companion, environment token or configuration file edit is required for this path.

## Connect

The default Compose URL is `http://localhost:8080/api/mcp`. Use the deployed Preflyt URL in production.

Codex:

```sh
codex mcp add preflyt --url http://localhost:8080/api/mcp
codex mcp login preflyt
```

Claude Code:

```sh
claude mcp add --transport http --scope user preflyt http://localhost:8080/api/mcp
```

Then run `/mcp` in Claude Code and authenticate Preflyt. An agent that already has a server named `preflyt` should use its existing login/reconnect action instead of adding the same name again. Remove an older static bearer header/token configuration before switching that entry to OAuth; an explicitly configured bearer token takes precedence in native clients.

The approval screen identifies the client-provided name, registered return address, requested permissions and repositories. The name is not a verified vendor identity. Approve only a login you started. Users explicitly select repository access; future repositories are not added automatically. Connections are owned by the signed-in user and workspace, and can be disconnected under Integrations.

Once connected, copy a finding's verification task into the agent. The task contains the assessed commit and exact scope identifiers. The agent reads the saved analysis and source, checks the actual repository using its own environment and permissions, then submits external review evidence and any proposed fix PR link. Hosted MCP supplies tools; it does not start a local agent process. The [local companion](local-companion.md) is optional for users who want Preflyt's finding buttons to start local tasks. The manual per-finding token flow remains under Advanced.

## Transport and discovery

- Resource: `${PREFLYT_PUBLIC_API_URL}/mcp`, default `${WEB_ORIGIN}/api/mcp`.
- Unauthorized GET/POST returns 401 with `WWW-Authenticate: Bearer resource_metadata="..."` and the supported review scopes.
- Protected resource metadata is available through the advertised `/api/.well-known/oauth-protected-resource/mcp`, plus RFC 9728 origin-root discovery paths.
- The issuer is `${PREFLYT_PUBLIC_API_URL}/mcp-oauth`. RFC 8414 metadata is available at the origin-root `/.well-known/oauth-authorization-server/<api-path>/mcp-oauth` and the API metadata routes. The web proxy forwards `.well-known` discovery to the API.
- Public-client dynamic registration uses POST `/mcp-oauth/register`, `token_endpoint_auth_method=none`, registered redirect URIs, authorization code and refresh grants. Client ID Metadata Documents are not advertised or fetched. Clients fall back to dynamic registration.
- GET `/mcp-oauth/authorize` validates the registered callback, MCP resource, code response, PKCE S256 and scopes, then sends the user to Preflyt's authenticated consent page.
- POST `/mcp-oauth/token` accepts standard form token requests. Codes are single-use, expire in five minutes, and bind client, exact callback, PKCE challenge, resource, user, organization and approved repositories.
- Access credentials last 15 minutes. Refresh credentials rotate atomically and expire with the connection after 30 days. Invalid, expired or replayed credentials fail. The database holds hashes; browser connection APIs expose no credentials or hashes.
- POST `/mcp-oauth/revoke` supports public-client token revocation; the browser's Disconnect action revokes the connection and its derived finding grants.

Registered redirect URIs must be HTTPS, except HTTP loopback addresses for local native callbacks. As required by RFC 8252, native re-login may change the HTTP loopback port while preserving host, path and query; each issued code is still bound to the exact callback requested for that login. Fragments and URL credentials are rejected. Metadata/logo URLs supplied by clients are never fetched. Public registration and pending request counts are bounded. Use HTTPS for deployed Preflyt; localhost HTTP is for local Compose testing. A remote/cloud client cannot reach a laptop's localhost endpoint.

Set `PREFLYT_PUBLIC_API_URL` only when the public API base differs from `${WEB_ORIGIN}/api`. Discovery and issuer URLs come from configured origins, never a supplied Host header. Preserve the root `.well-known` proxy when hosting the API beneath `/api` or another path.

## Tools and permissions

OAuth connections use explicit `scope` arguments identifying `origin`, `repositoryId`, `assessmentId` and `findingId`. Temporary per-finding tokens continue to use the original four tools without a scope argument, preserving existing companion/manual clients.

| Tool | OAuth behavior |
|---|---|
| `preflyt_list_repositories` | Approved repositories that remain accessible under current permissions |
| `preflyt_list_findings` | Compact, paginated findings in one approved repository |
| `preflyt_get_finding` | Exact saved finding, full analysis and external evidence history |
| `preflyt_get_source_context` | Saved, bounded, redacted source at the assessed commit |
| `preflyt_submit_verification` | Append external reasoning, outcome, actual commands and results |
| `preflyt_link_fix_pr` | Append a same-repository proposed fix PR and tested patch SHA |

`findings:read` permits reading. `findings:review` additionally permits evidence submission and PR links, requiring the user's current `ai.review.run` repository permission. Active global membership, organization access and repository permissions are checked on requests. Read-only grants cannot submit results. Repository selection is rechecked when listing and reading; approval is never a substitute for current access.

Writes reuse the existing exact-commit evidence validation, idempotency, secret filtering and per-finding limits. Derived grants are bound to the OAuth connection and revoked with it. Reports remain **External report**; AI findings remain **Needs review**. OAuth and agent output cannot resolve a finding, waive a check, authorize a merge, execute repository code on Preflyt, or create/merge a PR.

## Verification and deployment

Apply `20261019073000_hosted_mcp_oauth`, regenerate Prisma, and rebuild API, worker, migration and web together. Existing Strix bridge recreation/reload instructions still apply. The migration adds tables and an optional grant binding; existing manual/companion credentials remain valid.

Disposable database tests cover discovery, dynamic registration, callback/client/resource/PKCE binding, standard form token exchange, replay rejection, scope and repository limits, current membership, revocation and preserved finding status. Browser tests cover the hosted default, native setup commands, consent, connection management, optional companion and mobile layouts. The official MCP SDK smoke performs discovery through the real web proxy, registration, approval, code exchange, tool/source reads, refresh and revocation. It does not run a model or fabricate review evidence.

Client/spec references: [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp).

## Open a finding in a coding agent

Finding details show an **Open in Codex** or **Open in Claude Code** logo button when the current user has a non-expired, non-revoked hosted connection with read access to that repository. Multiple connections for the same supported agent produce one button. Other MCP clients retain the Copy verification task fallback; OAuth by itself does not define a universal client-launch protocol.

The buttons use the documented desktop draft links: [Codex](https://learn.chatgpt.com/docs/reference/commands#deep-links) `codex://threads/new?prompt=...&originUrl=...` and [Claude Code in Claude Desktop](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link) `claude://code/new?q=...`. The desktop application must be installed. The user reviews the draft and sends it; the link never submits it automatically. A terminal-only installation cannot handle these desktop links, so Copy verification task remains available.

The authenticated `/finding-agents/launch-task` endpoint resolves the actual repository and assessed commit and generates a short handoff containing the MCP finding scope. Tokens, source code and saved reasoning are excluded from the link. The agent fetches evidence through the user's approved MCP connection, where normal repository and scope checks still apply. No grant, local execution, model request or status change is created by preparing/opening the draft. The optional companion remains the separate route for queued local execution.
