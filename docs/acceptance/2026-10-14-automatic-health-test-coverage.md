# Automatic Repository Health test coverage

## Delivered

Repository Health requests test coverage by default. Discovery reads manifests,
lockfiles and configuration names; it never imports repository configuration into
the API. Existing test scripts select the tests. Initial support is Vitest, Jest
and Node with npm, pnpm 10 and Yarn Classic. Declared workspace packages run
individually; root orchestration is not duplicated. Saved framework/directory/command
overrides require repository execution permission, CSRF protection and an expected
settings revision. Each assessment captures its settings before execution.

A separate package-owned image prepares public dependencies with install scripts
and package-manager hooks disabled, then executes tests in a network-disabled
container. Both phases enforce inspected nonroot/read-only/capability/resource
controls. A bounded tmpfs dependency volume survives the phases and is removed
with ownership checks. Source hashes, immutable images, captured settings and
signed receipts bind results to the assessed commit. No API/platform credentials
or Docker socket enter either phase.

Reports retain per-package outcomes and union measured physical source lines.
Missing, failed, skipped, empty or incompatible results do not become a percentage.
Receipt validation rejects coverage whose package outcomes do not match. This is
repository-authored test evidence for Health, not independently proven test adequacy
or new CI/merge-gate evidence.

## Local validation

- 74 focused API tests passed across discovery, LCOV projection, signed receipt
  validation, scanner admission, runtime controls, cleanup/recovery and authenticated
  Health settings/snapshot integration.
- 32 Health browser tests passed, including editable/read-only settings behavior.
- API and web TypeScript checks and changed frontend ESLint checks passed.
- Local Prisma migration applied and client regenerated.
- Real Docker fixtures passed: npm/Jest 30.2.0; npm/Vitest 4.1.11 with its provider
  installed automatically; npm/Node; Yarn Classic/Node; two pnpm workspace packages
  with a local workspace dependency. The latter reported 3 passing tests and the
  measured union of both source files; a postinstall hook was not executed and the
  test received no DATABASE_URL.
- A failing pnpm package kept overall coverage incomplete, retained the other
  package's successful outcome and confirmed cleanup. Positional Node test paths
  were preserved when enabling coverage.
- Discovery rejects ambiguous lockfiles/escaping settings; LCOV projection rejects
  out-of-source and invalid line references; runtime tests reject changed volume
  controls and foreign cleanup ownership.

All container fixtures used generated repositories. No connected repository test
suite was run for this change. No code push or GitHub Actions run was performed.

## Limits

This initial image does not supply other language toolchains, browser installations,
private-registry credentials, external test services or dependency lifecycle scripts.
Unsupported setup is incomplete with a next action. Limits are 40 packages,
5-minute dependency preparation, 4m45s overall collection and 3 minutes per package,
with 1 CPU, 2 GiB memory and a 2 GiB dependency workspace per phase. These can be
insufficient for a large application; the result remains unavailable rather than
claiming complete coverage. Existing reports are unchanged. Reassess after upgrading
the scanner to obtain a new measurement.
