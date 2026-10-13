# Preflyt agent instructions

Read `docs/agents/product-implementation-guardrails.md` before changing product code.

Status badges must use `apps/web/src/components/status-badge.tsx` and the shared mapping in `apps/web/src/lib/status-tones.ts`. Success/healthy/completed = green; failure = red; pending/stale/draft = amber; information/in progress = blue; inactive/disabled/planned = neutral. Add a regression test for new status labels. Never choose colors independently on a page or use blue for Synced.

Keep communication direct. Ask only when something material is unclear.

Use the shared PageHeader and SurfaceIcon components for new or updated workspace UI. Follow docs/design/enterprise-ui-guidelines.md for header layout, 40px card icon tiles, card hierarchy and primary/secondary/destructive buttons. Preserve responsive behavior and existing actions.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
