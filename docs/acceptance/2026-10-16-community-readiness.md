# Community preparation and Cloud boundary — 16 October 2026

## Scope and identity

Based on `b9b5bb2` plus uncommitted working-tree changes. This is local preparation,
not a released candidate. Earlier acceptance reports retain their stated scope.
No commit, push, repository transfer, visibility change, public release or website
publication was performed. A read-only GitHub issue lookup informed the edition
boundary; no issue comment/body was published.

The owner confirmed they own Lyrisoft, the support mailbox receives reports and
there is no second maintainer. @iampeters administrator access was verified.
Original-code/assets rights and all upstream redistribution obligations have not
been certified from ownership of the company alone.

## Completed corrections

- Maintainer/security/conduct policies identify the single maintainer and working
  reporting mailbox. Security support targets the latest stable Community release
  after launch, without promised older-version backports or an SLA.
- GitHub Actions defaults were changed to `read`, with workflow PR approval
  disabled; the resulting settings were read back. The repo remains private.
  Current main rules require PRs/non-fast-forward protection but no DCO/checks;
  development required-check enforcement remains pending.
- Fork development PRs now select the read-only regression workflow. Internal
  OIDC development checks cannot be selected by fork PRs. Added a read-only
  community/docs workflow and dependency update configuration. These workflows
  have not run remotely because the preparation has not been pushed.
- Applied the hash-bound pnpm `braces@3.0.3` recursion patch. Excessively nested
  strings and child ASTs are rejected before recursive walkers; ordinary globs
  and supported shallow input remain valid. No advisory ignore was added.
- Inspected the pinned Semgrep 1.179.0 archive and found both CE and proprietary
  engine binaries. The Dockerfile now excludes the unused proprietary binary
  from the final standalone and bundled scanner layers. Scanner cache exports
  use final-layer-only `min`; older private build caches are not cleared by this.
- Added actual upstream scanner license texts/source attribution and generated
  installed Node dependency notices/inventories for application images. Missing
  upstream texts remain explicit; this is not complete redistribution clearance.
- Recorded a canonical repository/transfer runbook. Current remote remains
  `lyrisoft/preflyt`; recommended branded transfer target is `preflytlabs/preflyt`
  after the owner establishes and approves that organization.
- Owner selected issue #97 / P4.RI repository indexing and outside-diff retrieval
  as **Cloud-only**. Updated product/roadmap/readiness, Community docs and pricing.
  Future implementation belongs in separate private Cloud code. Community keeps
  existing profiles, Health/source evidence, CI checks and BYOK diff reviews.

## Checks actually run

- Clean CI-mode frozen pnpm install with scripts disabled passed.
- 39 Node automation/deployment tests passed on macOS, including three dependency
  security regressions and notice/export tests. Two GNU-tar-only packaging tests
  initially failed on macOS tar, then both passed in the pinned Linux Node image.
- 16 Python CI/DCO tests passed.
- 11 API CI contract tests passed.
- Four pricing browser tests passed at 320/768/1440px and for the cost/AI FAQ.
  The first sandboxed browser launch could not bind localhost; the authorized
  local-server run passed.
- Documentation production build, generated asset checks, all 48 environment
  variable references and TypeScript check passed.
- 13 existing generated-source Semgrep fixtures passed against the sanitized CE
  image. Seeded failures and clean passes are expected outcomes, not test failures.
- Every layer of the final bundled Semgrep OCI archive was inspected: proprietary
  engine absent; eight scanner license/source records retained.
- All five ARM64 application images rebuilt and inspected locally. Production
  image builds include API/web compilation and web prerendering. API image notice
  inventory contains 310 package versions, with ten missing-text/metadata entries
  requiring upstream review; the host web/docs inventories include build tools
  and identify 15/46 review entries respectively. They are not claimed cleared.
- Whitespace validation passed. Full application/database/browser suites were
  not rerun in this preparation; earlier reports describe their own revisions.

The raw registry audit still identifies `braces` 3.0.3 / GHSA-vfj7-8cjw-p6xm;
version-based advisory matching does not inspect local patches. Retain that
finding alongside the exact lockfile patch hash and passing regression evidence.
Do not report a clean raw advisory audit or a vendor-published fixed version.

## Local image record

| Image | Local content ID (ARM64) |
| --- | --- |
| preflyt-api | `sha256:3370bdaee0aa4cf71b69d699402dc488747615f0fde761940d8fbfd5e39fb921` |
| preflyt-api-migration | `sha256:555689a062b58da304c854043eac5810f95e3e88d43711a93b91dece71eee7ea` |
| preflyt-native-controller | `sha256:3ebe1417262e7e68f9d4d3ad897153fb4ca10a3ae9a99e3a608cb18ce86dd7a5` |
| preflyt-health-scanner | `sha256:df247de3cf6341c3a896b4d0287b6f4f5e81c4043dbf1ba6a30a87e69f4c17af` |
| preflyt-web | `sha256:ba05fe6e19bc4f1e93002f0f613b9b9c7f2b61048561509a85cff9e305e48105` |

All five IDs were retagged to the existing
`preflyt-local/<image>:optimized-20261015-arm64` aliases and verified against the
ignored `work/community-local/images.json`. The previous record is retained in
`work/community-readiness/previous-local-images.json` for rollback reference.
These local IDs are not public multi-platform registry manifest digests.

The Preflyt Compose containers present at the start of work were no longer on
the Docker engine at final verification; only unrelated services were running.
No Preflyt stack was recreated, no live migrations applied and no volumes changed.
Therefore there is no final post-update live Compose smoke/clean-install claim.

## Still open before release

- Rights sign-off for original/third-party material; missing notice texts,
  corresponding source/build obligations for distributed copyleft components,
  exact database/provider terms and final platform artifact inventories.
- Final privacy/exposure review of source/screenshots and old registry caches;
  final AMD64/ARM64 clean installation/recovery and live GitHub onboarding,
  same-run CI coverage/gates and optional BYOK acceptance.
- Final source SHA/release version, image digests and verified signed artifact
  evidence, followed by the owner's explicit go/no-go. No independent pentest
  or legal certification is implied by these local checks.
- Choose/control a branded GitHub organization if desired. A GitHub 404 for the
  proposed names does not prove registration/transfer availability.

## Still needing publication after approval

1. Commit/push reviewed source, policies and workflows; publish the approved
   canonical Community repository (or execute the separately approved transfer).
2. Publish versioned AMD64/ARM64 API, migration, web, Health scanner and optional
   controller images, complete notices/source assets, SBOMs and provenance;
   verify anonymous pulls and startup on both platforms.
3. Publish release notes, installation downloads, exact image digests/platforms,
   compatible Preflyt Action version, supported versions and known limits.
4. Deploy website/docs changes, including pricing/Cloud-only context, Community
   guides, release/license badges and public community links.
5. Exercise a real fork PR and enable required DCO/community/branch checks in
   GitHub after their contexts exist. Verify protections/reporting in the final
   launch repository. Align issue #97's remote body with the owner-approved
   Cloud-only scope when remote issue editing is authorized.
6. A new Preflyt Action Marketplace release is necessary only if that separate
   repository changes or a new version is required for compatibility.

The [readiness tracker](../planning/open-source-readiness.md) and
[launch runbook](../operations/community-repository-launch.md) contain the same
publication boundary. Publication cannot replace outstanding clearance or tests.
