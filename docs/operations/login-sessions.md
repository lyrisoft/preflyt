# Login session persistence

Application connections and feature switches are now provisioned in **Settings → Configuration** by Super Admin. Environment names below describe the legacy import contract; once stored, database values take precedence. See [deployment configuration](deployment-configuration.md). Infrastructure and execution trust controls remain deployment-managed.

Super Admin logins now receive a persistent HttpOnly/SameSite cookie and a PostgreSQL session with a 24-hour absolute expiry. Ordinary OIDC sessions retain their eight-hour expiry. Activity does not extend these limits. A login issued before this change keeps its original expiry; sign in again to receive the new 24-hour session. Expired or revoked sessions are never revived.

API restarts with the same database and credentials preserve sessions and password hashes. Changing/removing the configured Super Admin credentials still revokes local sessions. Logout, expired sessions and inactive membership still deny access.

The frontend route check uses credentialed, non-cached requests. It retries transient network/server failures up to three times with 3-second request deadlines and short backoff. If it cannot confirm authentication, it shows **Reconnect to Preflyt**, retaining the current URL and offering **Retry connection**. It redirects to sign-in only for a confirmed `authenticated:false` result or HTTP 401. Malformed responses, 403 and 5xx responses do not masquerade as logout. Protected content remains inaccessible until the check succeeds.

`GET /auth/session` sends `Cache-Control: no-store`; browser checks also bypass cached responses. Redis is not an authentication authority: session validity and membership revocation are read from PostgreSQL.

No database migration or new setting is needed. Reload the updated frontend and let the API load the changed code. The agent does not manage the operator's running API process. Use the same browser hostname throughout (`localhost` and `127.0.0.1` have separate cookies), and require secure cookies over HTTPS in production.

Scoped checks: auth integration tests cover startup persistence, 24-hour cookie/server expiry, credential revocation, logout and expired sessions. Node tests cover API outage recovery, failed/malformed responses, cookie credentials/cache options and stalled-request deadlines. Frontend typecheck and touched-file lint cover the reconnect view. Browser tests remain skipped.
