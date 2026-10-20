# Connected MCP agents on findings — 2026-10-20

The finding's External verification actions now include every active MCP client connected by the signed-in user. Codex and Claude Code retain their supported desktop draft links. DeepSeek Harness has its logo and a named copy-task action. Other clients have a named copy-task action and a generic connector icon. Duplicate connections produce one action per agent.

An agent connected for other repositories remains visible through **Manage [agent] access**, linking to Integrations. It is not offered a task or desktop draft until that repository is approved with read access. Disconnected and expired connections are omitted. Combining multiple connections preserves access only when at least one active connection explicitly approves this repository.

All 16 focused agent helper/browser tests passed, covering known and unknown clients, duplicate connections, repository scope, expiry, revocation, read scope, safe fixed desktop schemes, copied tasks without credential creation, denied task access, and narrow-screen light/dark layouts. Web typecheck and focused ESLint passed. No new repository grant or model run was created by this change.

After rebuilding local Compose, the real `lyrisoft/maiguard-api` finding displayed **Manage DeepSeek Harness access**, **Open in Codex**, and **Copy verification task**. DeepSeek's active connection does not approve this repository, so the access action is the expected behavior. No additional repository access was granted during verification.
