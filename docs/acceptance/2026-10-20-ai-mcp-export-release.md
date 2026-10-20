# Complete AI, MCP and report export release — 2026-10-20

The release branch applies the previously local AI/MCP/export commit on top of the published v0.1.13 remediation baseline. The import-only conflict preserves both remediation tracking and PDF/Markdown exports. No earlier feature work is omitted.

Added twelve reviewed change entries covering DeepSeek Harness setup, all connected-agent finding actions, collapsed connection history, PDF/Markdown report exports with the supplied logo, assessed-source snapshots, saved AI recommendations, provider token accounting and failure reasons, local Compose sandbox startup, separate AI review status, repository language icons, automatic workspace update checks, and complete release-note coverage. The source-built local Compose configuration and environment example have explicit upgrade explanations. No new database migrations are introduced.

The update panel refreshes stale release metadata from the workspace query on initial load, focus and the existing ten-minute polling interval. Enabled automatic checks, administrator permission, five-minute freshness and server cooldowns remain enforced. Reader sessions do not initiate privileged update checks. Failed automatic checks preserve saved version information. Clicking the version opens release notes; a manual check remains available. The automatic-check setting no longer incorrectly implies an exclusively hourly cadence.

Verification: 164 browser tests passed across ten suites; API/web TypeScript checks, focused release-panel lint and whitespace checks passed. The release-note/deployment scripts passed 32 tests, including the actual image count, immutable release identity, release-note digest guards and configuration upgrade coverage. The environment reference check documents all 53 example variables. API integration results are recorded before publication below.

Production publication is explicitly user-authorized, including admin merges to development and main. The production workflow publishes images and versioned documentation; publication alone does not restart an installed server.

Final API verification: all 250 tests across 16 suites passed, including saved-source access/redaction, guidance reuse, provider protocols and usage, DeepSeek OAuth/revocation, export authentication, remediation isolation and release-check permissions. Combined with the 164 browser tests and 32 release/deployment script tests, 446 focused checks passed. No model review or connected-repository source execution was started by this verification.
