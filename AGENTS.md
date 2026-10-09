# Preflyt agent instructions

Read `docs/agents/product-implementation-guardrails.md` before changing product code.

Status badges must use `apps/web/src/components/status-badge.tsx` and its shared semantic mapping. Success/healthy/completed = green; failure = red; pending/stale/draft = amber; information/in progress = blue; inactive/disabled/planned = neutral. Add a regression test for new status labels. Never choose colors independently on a page or use blue for Synced.

Keep communication direct. Ask only when something material is unclear.
