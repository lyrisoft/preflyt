# Implementation gap closure

Status: active, audited against source and executable checks on 2026-10-10. This ledger distinguishes implementation, generated-fixture acceptance and production acceptance. It does not renumber P0–P11 or substitute imported CI coverage for native scanner coverage.

## Completed implementation in this closure

| Gap | Result | Evidence |
| --- | --- | --- |
| GitHub rotating user credentials | Database-serialized refresh across service instances; encrypted persistence; transient outages preserve credentials and workspace sessions; onboarding uses refreshed expiry | Identity provider and GitHub login integration tests |
| Provider authorization revocation | Signed, idempotent user revocation clears provider credentials/evidence/challenges while preserving local sessions and installation history | GitHub login integration tests, including refresh/verification races |
| Relationship invalidation | Signed organization/team/member events invalidate installation authorization revision and imported team freshness; payloads never grant access | GitHub login integration tests, delivery reuse and foreign organization rejection |
| Missed-event reconciliation | Bounded worker authorization refresh and team snapshots under current original-importer authority | Identity and Teams integration tests |
| Findings lifecycle | Scoped assignment, In review, resolution notes and optimistic revisions tied to the exact saved finding/commit | Scoped HTTP integration and Chromium mobile/keyboard tests |
| Critical report alerts | Current exact-commit unsuppressed critical reports use the existing transactional outbox and scoped Security Engineer recipients | Governance notification tests; source-suppressed entries ignored |
| Native execution failure alerts | One transactional, redacted notice per admitted attempt; verified failures/timeouts/runtime interruption and missing completion proof; blocked admission/user cancellation remain silent | Native failure and signed receipt suites; native assessment notice deduplication |
| AI availability and reservation alerts | Distinct-review transport debounce, success reset, cooldown and rejected daily budget admission use the existing audit/outbox rows | Current-role/repository/email revocation and concurrent producer tests; no keys or model output stored in notices |
| Branch-complete team impact | Latest policy revision shown independently for every active assigned branch; capped history cannot hide active assignments and newer missing provenance stays stale | Scoped Teams integration and Chromium regressions |
| Organization baseline | One explicit baseline per organization, all selected repository scope, existing assignment/preview/approval flow | Teams integration tests; new repository scope fails closed until reviewed |
| Explicit standard upgrades | Previewed replacement preserves frozen history/checks/profile and creates new drafts; stale old sources cannot publish | Teams integration tests, old v1.0 compatibility and v1.1 upgrades |
| Legacy acceptance harnesses | Older integration suites own randomly named local databases and apply every migration; no shared application-data reset | Full API suite passed with notification Redis transport |
| Delivery verification | Read-only PR workflow runs both builds and full API/browser suites against disposable services; release image publication reuses the same verification job | GitHub regression runs `38028028205` and `38034829841` passed; this does not confirm published image availability or production deployment |
| Offline dependency database | Optional scanner image bundles vendor data; runtime independently rejects stale/missing/incompatible metadata and scans without network access | Generated vulnerable npm lockfile detected; freshness tests passed; dependency coverage remains partial |
| Documentation drift | README, Teams, identity ADR, notification and native/governance deployment statements reconciled with current source | Source review; historical phase order unchanged |

## Remaining work, in order

1. Accept reviewed time-bound policy exceptions and their notifications on the clean versioned deployment. The request/independent approval/revocation/expiry workflow, publication integration and scoped notifications are implemented; explicitly reviewed nested team scope is implemented. Preserve strongest inherited requirements and independent authorization.
2. Accept the implemented explicit legacy identity linking/recovery on a clean versioned deployment. Recent dual proof, historical actors, last-Owner protection and alternate-identity self-approval checks are covered by integration tests; never match by email or username.
3. Complete the supported native adapter matrix; maintain the implemented fresh offline database image; retain live generated Kubernetes lifecycle acceptance and complete independent effective-isolation review. Keep connected-repository execution disabled without valid review.
4. Qualify the production organization signer and live webhook transport; private-repository signed-report PASS/FAIL/INCOMPLETE, merge enforcement, drift and rollback service acceptance passed. Fork PR and merge-queue support remain explicit limitations until implemented and accepted.
5. Audit the stacked delivery PRs, full regression suites and versioned release/deployment verification. Local builds alone do not prove published image availability or production acceptance.

## Local migration record

Before application migration, saved a protected `0600` local database snapshot at `/private/tmp/preflyt-gap-closure-20261010-1791608690089.dump` (192444 bytes; SHA-256 `a7e22f566c24d3eb46545392bca076ed0b583bc5023a0dbdb7759c83b28f2d29`). This file may contain credentials and identities; retain it locally under operator protection and never upload it with source.

The additive `20261010050000_finding_lifecycle` migration creates Findings triage records, a unique organization-baseline index and assignment supersession timestamps. It does not delete/recreate repositories, installations, identities or assessment history. The migration was applied successfully to the local application database; 43 migrations were current at that checkpoint; the configuration migration below brings the local database to 44.

## Verification record

- Six focused API files: 77 tests passed before relationship invalidation was added.
- GitHub login and Teams suites passed, including signed relationship invalidation and explicit upgrades. The final login suite passed all 25 tests after adding refreshed onboarding-expiry coverage.
- Legacy webhook and notification suites: 38 passed, one optional real-Redis test initially skipped. The notification suite then passed all 20 tests with the local Redis transport enabled.
- Chromium Teams, Findings and badge suites: 18 tests passed.
- Full API regression: 99 files passed; 1,098 tests passed, two optional acceptance tests initially skipped. Both were then enabled: offline GitHub attestation verification and isolated real-Redis dashboard acceptance passed (29 tests across their two files). The CI workflow enables both.
- Full Chromium regression: 47 files passed; 263 tests passed.
- API and web release builds passed. The Chromium run emitted a ResizeObserver warning without failing tests; no connected-repository execution or production acceptance is claimed.

These are scoped implementation results, not a claim that all phase/release gaps are closed.

- Remote CI at `f14c268` passed API regression but caught an asynchronous browser download assertion. The assertion now waits for the actual request and download; the corrected remote run remains to verify.

- Offline dependency slice: four API files passed all 44 tests; the generated dependency vulnerability fixture produced the expected FAIL with network disabled. Skills catalogue Chromium tests passed all 16 tests after the asynchronous assertion correction. API typecheck passed.

- GitHub CI run `38028028205` at `7708b15` passed both builds and the complete API/browser regression workflow.
- Live local Kubernetes generated fixtures passed PASS, FAIL and INCOMPLETE, including scheduling-gate admission, exact-source reports and UID-owned cleanup. They exposed and verified fixes for omitted false host flags and asynchronous Kubernetes garbage collection. Focused Kubernetes/controller regression passed all 27 tests; API typecheck passed. Ordinary local runc fixtures do not approve connected-source isolation.

## Database configuration follow-up (2026-10-10)

Super Admin Settings → Configuration now provisions 32 deployment application settings. API/worker bootstrap loads the database before constructing connection clients; legacy environment values are imported once. Encrypted credentials, masked reads, origin enforcement, revision conflicts and field-only audit records protect changes. Connection edits require restart; capability switches refresh live, including previously disabled notification consumers. Infrastructure, encryption roots, recovery credentials and execution trust stay in deployment secrets.

A protected application database and dotenv backup preceded additive migration `20261010100000_deployment_configuration`. The local migration and import succeeded. Every imported value was compared with the original environment before removing the 32 managed local dotenv fields. The separate encryption root was retained and backed up. Live Super Admin HTTP verification returned 32 masked fields, and a fresh startup verified the reduced environment.

Verification: API and web builds passed; full API suite passed 102 files / 1,109 tests (three optional tests skipped); full Chromium suite passed 48 files / 266 tests, followed by seven focused Settings tests including Super Admin access without a workspace and hiding Configuration from organization administrators. Real-worker acceptance verifies enabling an initially disabled notification consumer from the database without restart. See [deployment configuration](deployment-configuration.md) for Docker/Kubernetes provisioning, restart and backup instructions. This follow-up does not close the remaining work listed above.

## Inheritance safeguard and copy follow-up (2026-10-10)

Manual team edits previously allowed removing a repository after assigning standards, dropping its inherited requirements. Such removal now fails transactionally while any active assignment exists. Teams without assignments can still remove scope; explicit expansion still invalidates old source records and requires another preview. This safeguard alone did not implement reviewed exceptions, nested scope or exception notifications. Reviewed nested scope is now implemented in the follow-up below; time-bound exceptions and their notifications remain outstanding. GitHub access-loss reconciliation remains separate and preserves unavailable source history.

The AI help now explains the implemented conditional PR source review and automatic GitHub feedback rather than claiming both are absent. User-facing merge evaluation terminology is **Merge review result**; GitHub merge permission remains separate. API and web builds passed, the final Teams integration file passed 12 tests, and Chromium regression passed 48 files / 269 tests. Configuration PR71 regression run `38030321279` passed both builds and the API/browser suites. No production acceptance or full closure is claimed.

Full API regression for the follow-up passed 102 files / 1,110 tests, with three optional acceptance tests skipped. The final focused Teams run separately included the added unassigned-scope removal case.


## Notifications and branch impact follow-up (2026-10-10)

Native failure notices are recorded with admitted attempt state changes and deduplicate assessment creation. Signed runtime/cleanup failures with no process exit code alert while retaining INCOMPLETE evidence. Ordinary partial coverage and user cancellation do not produce execution-failure notices. Native critical finding detail remains outside the signed-count receipt contract.

AI availability alerts require three distinct failed reviews over at least one minute within ten minutes after the most recent success, with a thirty-minute connection-revision cooldown. Only actual transport failures qualify. Budget alerts describe rejected daily reservations, not provider invoices; rejection adds no reservation or model call. Mandatory security, governance and AI inbox notices retain current recipient/repository checks and bypass optional assessment mute. Email stays opt-in. Models and Model router have validated URL-addressable tabs for actionable notification links.

Teams Effective impact uses bounded latest-revision queries per assigned branch and independently checks current team provenance and standards selection. A newer policy without this team's source context cannot be hidden by an older matching policy. This changes reporting, not inherited requirements, approval rules or repository scope.

Production documentation now uses Settings → Configuration as the authoritative application configuration, distinguishes one-time environment import from live switches/restarted connections, and describes API/worker credential trust accurately. Separate production GitHub Apps, protected configuration encryption roots and reviewed isolated execution remain required. No schema migration, application database reset, provider write or production deployment was performed in this follow-up.

Verification so far: full API regression passed 104 files / 1,156 tests; one optional isolated dashboard Redis acceptance test was not enabled locally. Real notification Redis recovery and offline cryptographic proof verification were enabled and passed. Focused native execution tests passed 49 tests; focused AI/notification/transport tests passed 111 tests; branch impact/composition passed 18 API tests and 10 Chromium Teams tests. Final Chromium regression passed 49 files / 291 tests. API and web release builds passed. The browser run emitted the existing ResizeObserver warning without failing assertions. A closing-dialog test locator was corrected without relaxing desktop/mobile geometry assertions. Release publication and production acceptance remain outside these local results.


## P0 identity closure (2026-10-10)

Explicit legacy sign-in linking and ownerless-workspace recovery are implemented. The additive migration was applied after a protected local `0600` database snapshot; 46 migrations are current. It preserves repository, installation, identity and historical audit records. Linking retains the existing account's permissions, disables separate GitHub-only grants, rejects last-Owner removal and treats both historical actor IDs as one person for independent policy/ruleset approval. Recovery requires fresh GitHub organization-owner verification and an explicit action; it cannot replace an active Owner.

Focused verification: 70 login/policy/automatic-governance integration tests, eight OAuth controller tests and ten Chromium account-link/Settings tests passed; API typecheck, web release build and frontend lint passed. After correcting test prerequisites, the callback mock and bounded worker startup timing, full API regression passed 106 files / 1,206 tests; four optional tests were skipped. Full Chromium regression passed 52 files and had one Skills drawer-transition timeout; the focused Skills rerun passed all 17 tests. The full browser run is not recorded as passing. This entry closes implementation, not clean deployment acceptance or P2/P3 production qualification.

GitHub authority preflight verified App 4585551 and organization installation 153542598 for the private `lyrisoft/preflyt-p2-acceptance` repository. The governance installation override was process-local under the approved development exception; stored application settings were not changed. Production continues to require a separate privileged App. No successful live merge-enforcement acceptance is claimed by this preflight.

## Nested team scope implementation (2026-10-10)

Teams now previews the exact child repository union and approves a pinned source snapshot. It requires current management access to every repository, fresh direct GitHub parent/child relationships, bounded traversal and independent existing policy publication. Cycles, stale previews, revoked child access and implicit coverage removal are rejected. A reviewed refresh can restore a stale NESTED association only when the child still has verified access. Existing policy definitions are never rewritten by scope approval; users reapply standards to generate reviewed drafts.

Verification: full API regression passed 106 files / 1,209 tests with four optional tests skipped; the focused Teams API suite passed 15 tests, the Chromium Teams suite passed 12 tests, API typecheck, frontend build and scoped frontend lint passed. At this checkpoint, time-bound policy exceptions and their notifications remained unfinished; the reviewed-exception increment below supersedes that implementation status.

Protected pre-migration snapshot: `/private/tmp/preflyt-p0-p3-closure-1791629773011.dump`, user-readable only, 211713 bytes; SHA-256 `3aef5b71588e703cbb8e7a72e41186172117409a878a190a9e292b29231d98d1`. Never upload this database snapshot with source.

The nested-scope additive migration was applied successfully to the local development database after backup verification; all 47 migrations are current. Final full Chromium regression passed 55 files / 354 tests. A ResizeObserver warning was emitted without failing the suite.

## Private-repository governance acceptance (2026-10-10)

On the authorized private disposable repository `lyrisoft/preflyt-p2-acceptance`, controlled real GitHub Actions runs produced signed JUnit reports. Automatic service publication created exact-head checks: failing evidence blocked the actual merge request, incomplete evidence blocked it, and verified passing evidence allowed the merge. Each new head first published an incomplete result, preventing stale green evidence from carrying forward. The independently approved owned organization ruleset `24837900` activated for one repository and the dedicated `preflyt-p2-gate-target` branch, and verified rollback disabled it after acceptance PR #4 merged. Existing organization branch protections were unchanged.

A resumed drift test changed only the owned disabled rule's name through the authorized governance App, verified DRIFTED, verified rollback refusal, restored the exact disabled projection and verified ROLLED_BACK. This tests drift after rollback; it does not claim drift while active. Live checks and the merged PR were read back before saving the acceptance receipt.

These are real private-repository workflow/check/merge/ruleset results driven by isolated application services. Report signatures used a disposable process-local organization key. This does not qualify a production KMS signer, live webhook delivery, fork PRs, merge queues or release deployment. Production requires a separate governance App; the shared-App exception remains restricted to development and this disposable repository.

## Consolidated closure verification (2026-10-10)

The clean closure checkout based on merged development `e60b831` passed all 106 API files / 1,213 tests with Redis, dashboard cache and offline proof acceptance enabled; no API tests were skipped. All 55 Chromium files / 354 tests passed. API typechecking, web production build and scoped frontend lint passed. Keyboard tests now explicitly focus the selected theme radio before arrow navigation, and the Skills drawer does not restore trigger focus while handing off to the new-version editor. The existing ResizeObserver warning did not fail assertions.

Delivery PRs #75–#80 are merged into development; post-merge GitHub run `38048580613` passed. This verification does not close the remaining exception, release-deployment, native coverage or production qualification work.

## Reviewed policy exceptions (2026-10-10)

Implemented exact-policy/branch/commit/check requests, independent approval, rejection, revocation, expiry, current actor/provider authorization and durable governance notices. The policy UI uses saved-commit selection and custom controls; the merge preview labels qualified waivers **Allowed with exception** and retains original failed/missing outcomes. No new queue or untrusted execution path is introduced. The worker processes expiry and re-evaluates publication at the expiry cutoff. The additive migration was exercised only in owned disposable test databases; it has not yet been applied to the application database. See [operations and limitations](policy-exceptions.md).

Full local API regression passed 109 files / 1,228 tests with all optional acceptance flags enabled. Subsequent focused exception/contract/publication verification passed 21 tests, and automatic refresh/exception verification passed 35 tests, including refresh before the expiry cutoff and disabled-automation denial. Full Chromium regression passed 56 files / 361 tests; API typecheck, web production build and scoped frontend lint passed. The existing ResizeObserver warning did not fail assertions. Remote exact-head CI and release deployment acceptance still need verification. The final complete API run below supersedes the earlier local test count.

Final configured API regression passed 109 files / 1,235 tests with all optional acceptance flags enabled. Focused automatic-refresh and exception tests passed 35 tests after the expiry-audit revision refinement. Both release builds and scoped frontend lint passed. The local acceptance uses disposable databases and isolated queue/cache prefixes; the application database has not been migrated by this increment.
