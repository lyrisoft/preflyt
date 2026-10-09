# PR Code Quality Review

**Status:** Product specification; implementation must be verified per phase. **Existing P0–P11 order is unchanged.**  
**Related:** [Skill-based review](skill-based-code-review.md), [Engineering Standards Library](engineering-standards-library.md), [PRD](../PRD.md), [roadmap](../roadmap/incremental-delivery.md).

## Objective

Automatically assess pull requests for code correctness, maintainability, reliability, security, testing quality and architectural risk **before merge**. This is an assessment and feedback system, **not an autonomous coding agent**.

## Review workflow

1. Receive a verified GitHub PR opened/synchronize/reopened event; bind assessment to repository, PR, base and exact head SHA.
2. Load changed paths, diff, bounded related context, language/framework and effective versioned engineering policies.
3. Ingest CI-produced lint, typecheck, coverage, static-analysis and test evidence; use approved hardened execution for any Preflyt-run tools.
4. Select applicable deterministic rules and permitted read-only AI review skills. Apply organization model routing, budgets and data-egress policy.
5. Normalize findings with source, file/range, rule/skill version, severity, confidence, evidence and observed-versus-inferred classification.
6. Deduplicate and reconcile findings across revisions; distinguish newly introduced issues from existing repository debt when supported by reliable baseline evidence.
7. Produce evidence-linked review summary and optional GitHub inline annotations/comments. **Summary-only is the safe default**; high-confidence inline publication requires organization approval and GitHub permissions.
8. Evaluate deterministic required checks and publish the exact-revision GitHub readiness check. AI speculation alone cannot BLOCK or waive a gate.

## Assessment domains

- Correctness: null/error handling, unsafe assumptions, resource lifecycle.
- Maintainability: complexity, duplication, cohesion, unnecessary abstractions and code organization.
- Type and build quality: compiler, linter and language-specific analyzers.
- Reliability: timeouts, retries, idempotency, concurrency and graceful failure.
- Security: secrets, injection, authorization, dependency and IaC risk.
- Testing: missing required suites, coverage quality, edge cases and regression evidence.
- Architecture: boundaries, API compatibility, data migrations and integration contracts.

Distinguish **verified static/tool findings**, **contextual AI hypotheses**, and **recommendations**. Absence of visible controls in a diff does not prove absence in the application.

## Tools and extensibility

Use approved existing tools and their machine-readable outputs (e.g. ESLint, TypeScript, Ruff, Semgrep CE subject to license, Gitleaks, OSV-Scanner, language-specific analyzers). Treat scanner capabilities as declared/tested, not blanket support. Reviewdog-style adapters can map findings to PR locations but must not be trusted to authorize GitHub writes.

## GitHub feedback and status

- Stable check name/source: `Preflyt / Engineering Readiness`; associate each result with exact PR SHA and effective policy version.
- Default PR feedback is a single summary/check report. Inline comments are opt-in, limited, actionable, deduplicated and associated with valid changed lines; do not post repetitive comments on every synchronize event.
- Reconcile fixed/superseded findings when a new commit arrives; keep previous revision history but do not carry its green gate forward.
- Missing required evidence is INCOMPLETE, failed verified mandatory checks are BLOCK, allowed advisory findings may WARN; AI-only findings never independently create a deterministic block.
- GitHub branch rulesets enforce required checks, not Preflyt's AI agent.

## Page experience

Assessment detail → **Code Quality** tab: overview of verified/advisory findings, changed-file scope, tool and skill coverage, baseline-vs-new issues, policy outcomes and evidence freshness. Filter by severity, file, rule, engine and revision. Finding detail shows evidence, code range, reviewer rationale, suggested investigation, confidence and source. Include unavailable, skipped, stale and permission-denied states.

## Phased delivery

- **P1:** Import lint, typecheck, code-quality and coverage evidence; expose normalized findings and optionally read-only AI review against approved PR context.
- **P2:** Add first-party Code Quality policy pack and deterministic gate evaluation, with summary/check feedback.
- **P3:** Add tested native static analyzers only after independent sandbox approval.
- **P4:** Advanced context-aware, multi-skill AI review, deduplication and opt-in inline GitHub feedback.
- **P5:** Surface same findings/skills through CLI and IDE using shared contracts.

## Acceptance

- [ ] Real PR CI evidence produces accurate source-linked code-quality findings.
- [ ] New PR SHA cannot inherit a previous passing result.
- [ ] Unsupported or missing mandatory checks remain INCOMPLETE.
- [ ] AI review does not override deterministic gates or execute arbitrary code.
- [ ] Existing findings are not repeatedly posted as duplicate GitHub comments.
- [ ] Every GitHub comment is traceable to exact commit, file/range and source evidence.
- [ ] No source is sent to external models without approved data-egress policy.
