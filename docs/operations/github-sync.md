# GitHub local read model and access synchronization

Ordinary authenticated `GET /github/repositories`, `/overview` and `/:id/profile` read PostgreSQL only. The profile response includes installation `syncState`, `lastVerifiedAt` and `lastSyncAttemptAt`; clients should display last successful synchronization and pending/error/stale state. A reload makes zero outbound GitHub calls on these paths. Existing Preflyt session, role and selected/active repository guards remain authoritative. Saved reports are historical, not proof of current GitHub head or readiness. Claude owns the frontend presentation of these metadata fields.

This deployment retains its conservative existing policy: known upstream installation revocation/suspension or repository removal blocks saved-data access by deactivating the installation/deselecting the repository. Historical records remain in PostgreSQL. Removed repositories become `available: false`, so inventory hides them without cascading deletion of profiles, standards and assessments. Restored repositories become available after live reconciliation but remain unselected until an authorized user selects them. Local application authorization remains distinct from upstream permission to fetch new data.

Configure the existing GitHub App webhook URL and secret and run `pnpm dev:worker`. Besides PR/CI events, the signed endpoint accepts `installation` created/deleted/suspend/unsuspend/new_permissions_accepted and `installation_repositories` added/removed events. Unknown installations cannot be connected by a webhook. Verification of original bytes precedes normalization. A separate durable access inbox stores only delivery hash, installation ID, event/action and processing status; no payload, credentials or tokens are retained.

Known removals/suspensions take effect in the acceptance transaction, without waiting for Redis or the worker. Installation rows serialize duplicate acceptance, and unique IDs/hash checks reject changed-payload replay. Every access event increments a durable access revision and marks synchronization PENDING. An all-to-selected change can omit removed IDs: Preflyt pauses that installation until a full inventory is verified. Unsuspend/addition notifications do not independently grant access. Delayed negative events conservatively revoke until live reconciliation confirms current access.

The worker dispatches access inbox entries through the existing BullMQ queue, retry policy and PostgreSQL recovery. It also checks every five seconds for PENDING/never-attempted installations or installations last attempted over five minutes ago (bounded to 20 per pass). A five-minute database lease limits duplicate syncs across workers. Full installation verification and repository inventory are fetched outside a transaction; results apply only when the captured access revision and lease still match. A webhook arriving during sync therefore prevents stale results from restoring access. Periodic reconciliation includes inactive installations so verified restoration can be detected. A worker outage or GitHub outage can delay repair: five minutes is a normal scheduling interval, not a guaranteed revocation deadline.

Rate limits/outages mark synchronization ERROR and preserve the prior read model; confirmed missing/suspended installations mark REVOKED and clear selection. Local reads remain available during an upstream outage if access has not been revoked locally. Monitor worker health and synchronization age. `GET /github/repositories?refresh=true` remains a compatibility path for explicit synchronous reconciliation and shares the same lease/revision safeguards. Discovery and selection operations still verify live upstream access. There is no automatic source-code execution.

Installation tokens are reused in private process memory by installation, exact repository scope (or inventory scope), permissions and durable access revision. Concurrent token minting is coalesced; reuse stops 60 seconds before GitHub expiry. Scope is never widened to satisfy another repository request. Access events change the revision, making old cached tokens unusable on subsequent token acquisition in every API/worker process. Upstream authorization failures evict matching token entries. Tokens are never written to the general Redis cache, database, browser or logs; restart simply remints them. Cross-replica encrypted token storage and conditional ETag polling remain future optimizations.

Apply additive migration `20261009020000_github_sync` before restarting API and worker. It adds sync/revision/lease fields, repository availability and an access-delivery inbox, preserving existing rows. Back up PostgreSQL first. No new environment variable/service is required. Existing GitHub App lifecycle events are delivered automatically when webhooks are enabled; signed acceptance still requires `GITHUB_EVENTS_ENABLED=true` and the configured secret. Periodic synchronization can repair installation access even when lifecycle delivery was missed.

Scoped checks cover local profile/inventory reads with GitHub unavailable, removal/suspension/unsuspend, omitted removal lists, signed acceptance/replay, malformed events, revision races, failed synchronization, historical retention, token reuse/scope/expiry/revision, queue reconciliation and worker shutdown. They use an isolated database and uniquely scoped Redis queues; worker process tests explicitly disable live GitHub and telemetry exporters. Local checks do not assert measured production latency or live GitHub webhook delivery.

Tracked [PR state](current-pr-state.md) is also reconciled in the worker; ordinary PR API reads remain local and exact-revision assessment links expire when current context is unverified.


### GitHub organization linking and member sync

The human sign-in App also needs **Organization permissions → Members: Read-only**.
Repository access alone cannot verify organization membership or list members. After
changing the App permissions, a GitHub organization owner must approve the updated
installation permissions and sign in again to receive a token with that access.

If GitHub returns `403 Resource not accessible by integration` with
`x-accepted-github-permissions: members=read`, check this permission on the App
configured by `GITHUB_APP_ID`, not just a separate governance App. Existing repository
connections remain intact. Start linking from an existing workspace Owner session in
Access Control. Successful linking returns to `/access-control?tab=github`, where the
owner can sync members and assign access.

GitHub request and response-body timeouts during human sign-in return a retryable
503. They do not grant access or consume an organization-link challenge before
verification succeeds. An unreachable API is shown separately from an unconfigured
Super Admin account.


Organization linking runs inside Access Control. GitHub authorization returns to a
confirmation drawer in the GitHub members tab; cancellation or callback failure
returns to that same tab with a retry action. Failed confirmation never clears or
replaces the administrator session. Cancel clears only the pending link proof.
Super Admin sessions with an inferred workspace persist that verified workspace
scope when linking starts, so the final ownership check sees the same scope.
