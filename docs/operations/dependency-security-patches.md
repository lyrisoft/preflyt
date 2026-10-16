# Maintained dependency security patches

## braces 3.0.3 — GHSA-vfj7-8cjw-p6xm

The 16 October 2026 package advisory database reports no upstream patched release
for the deeply nested AST stack-exhaustion issue. `braces` is transitive through
Docusaurus/micromatch and build tooling; the advisory is not evidence of an exposed
Preflyt API endpoint.

Preflyt applies `patches/braces@3.0.3.patch` using pnpm `patchedDependencies` and the
lockfile's patch hash. This is an actual dependency fix, not an audit ignore:

- Parser construction bounds both braces and parentheses to a maximum AST depth
  of 128, before parse-time recursive serialization.
- Compile, expansion and stringify validate caller-supplied child graphs
  iteratively before entering recursive traversal. Excessive depth and cyclic
  child graphs produce a bounded `SyntaxError`.
- Ordinary brace globs, ranges, escaped literals and long shallow patterns retain
  their previous behavior. Patterns exceeding the supported nesting bound are
  intentionally rejected.
- `scripts/ci/braces-depth.test.mjs` resolves the actual installed Docusaurus
  dependency and exercises balanced/unbalanced nesting below its character limit,
  deep/cyclic ASTs and normal glob behavior.
- CI runs those regressions. Docker builds copy `patches/` before frozen install,
  so they cannot quietly install the unpatched dependency graph.

`pnpm audit` continues to report version 3.0.3 because advisory matching does not
inspect local patch contents. Preserve the raw audit finding together with the
patch hash and test results. Do not claim an upstream-fixed version, a clean raw
audit or apply a global advisory ignore. Remove the patch only after an upstream
fix is adopted and these regressions pass against it. This patch applies to pnpm's
workspace graph; other package managers and separately bundled scanner tools need
their own dependency audit.
