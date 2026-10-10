# Preflyt agent instructions

Read `docs/agents/product-implementation-guardrails.md` before changing product code.

Status badges must use `apps/web/src/components/status-badge.tsx` and the shared mapping in `apps/web/src/lib/status-tones.ts`. Success/healthy/completed = green; failure = red; pending/stale/draft = amber; information/in progress = blue; inactive/disabled/planned = neutral. Add a regression test for new status labels. Never choose colors independently on a page or use blue for Synced.

Keep communication direct. Ask only when something material is unclear.

Use the shared PageHeader and SurfaceIcon components for new or updated workspace UI. Follow docs/design/enterprise-ui-guidelines.md for header layout, 40px card icon tiles, card hierarchy and primary/secondary/destructive buttons. Preserve responsive behavior and existing actions.
