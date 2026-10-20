# MCP connection history — 2026-10-20

The MCP integration page shows active agent connections first. Disconnected and expired connections appear in a collapsed **Connection history (N)** section with a scrollable list. Disconnecting moves a connection into history after the server confirms revocation. With no active connections, the page offers setup above and keeps history available.

Historical rows say repositories were previously approved. Existing status badges, timestamps and disconnect actions are preserved. This is a presentation change; it does not delete connection records, review evidence, or change repository permissions.

Verification: all 11 hosted integration browser tests passed, including history expansion and keyboard collapse, expired connections, post-disconnect state, history-only and empty lists, and 320px layouts in light and dark themes. Web typecheck and focused ESLint passed.

The production web Compose image was rebuilt and its container became healthy. In the running local page, DeepSeek Harness and Codex remained visible while three disconnected entries appeared under **Connection history (3)**. Expanding showed all three saved entries; pressing Enter collapsed them again.
