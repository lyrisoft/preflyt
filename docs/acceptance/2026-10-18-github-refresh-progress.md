# Workflow refresh progress — 2026-10-18

- Pending workflow setup reads show an accessible loading status and spinner.
- Read queries poll at the server deadline without forcing GitHub refreshes, retrying writes, or displaying repeated background-error toasts. Polling stops on success/unrelated errors and pauses in background tabs.
- Cold data distinguishes queued/running work, provider throttling, refresh failure and overdue work with no live worker lease. A stalled message asks administrators to check the worker without asserting it is offline.
- Compose exposes GITHUB_DISPLAY_STALL_SECONDS to API and worker, default 180 seconds. No new migration is required for this change; the earlier saved-read migrations still apply.
- Local validation: 7 PostgreSQL integration tests; browser component/query tests; API build and web typecheck; documentation build and Compose validation. No production deployment, commit or push.
