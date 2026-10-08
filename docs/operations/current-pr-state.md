# Current PR state and assessment links

The API serves saved PR state without GitHub calls. A separate read model holds the most recently observed context and its verification metadata. Historical assessment snapshots remain immutable.

## Local API

Authenticated sessions with selected, available repository access can GET:

- `/github/repositories/:repositoryId/pull-requests`: up to 50 tracked PRs, verification labels and a truncation flag.
- `/github/repositories/:repositoryId/pull-requests/:number`: observed head/base/state, verification age, applicable PR/CI assessment links and fixed reason codes.

The list includes closed PRs. Rows originate from supported signed PR events; there is no initial enumeration/backfill of all repository PRs yet. No browser request triggers provider synchronization. No-store responses prevent cached authorization/context from bypassing access checks.

A RECENTLY_VERIFIED label requires a successful provider read less than five minutes old for the same installation and access revision. Pending, conflicted, failed, expired and reconnect-invalidated state is UNVERIFIED. This is recent provider confirmation, not a guarantee that GitHub cannot have changed after that read.

## Ordering and reconciliation

The worker updates observed PR state atomically with delivery processing and historical assessments. Older provider timestamps cannot move it backward. Equal-time differing contexts and observations with uncertain ordering invalidate verification. Replayed identical timestamp/context pairs are no-ops. Missing legacy context invalidates any prior verification rather than guessing a head or base.

The worker considers up to 20 tracked PRs per reconciliation pass, due immediately when a PR event invalidates them and otherwise five minutes after their last attempt. Provider reads use the shared installation rate limiter and cooldowns. Tokens are scoped to one repository with metadata:read and pull_requests:read, separate from contents tokens; GitHub App Pull requests:read permission must be installed. No write scope is requested. Outages/rate limits retain saved context but clear verification and mark ERROR for retry.

Database compare-and-set claims suppress duplicate work. Results apply only if the PR revision, repository access, installation ID and installation access revision still match those captured before the request. A new webhook, deselection or revocation prevents an in-flight refresh from restoring old data. Worker shutdown cancels its shared provider and stops PR reconciliation.

## CI linkage

Only recently verified, open, same-repository PRs expose applicable links. Both link types require the exact current head SHA, installation, current standards selection and active approved-binding revision.

PR assessments additionally match the full pinned PR context: number/object ID, head/base IDs, refs, SHAs and draft/merged state. Later CI assessments are linked as exact-head COMMIT observations, not rewritten into PR snapshots or treated as validation of the base/merge context. Changing the base therefore invalidates a PR-context assessment; a head-only CI link may still exist but proves no base-specific validation.

Links come from the latest matching saved assessments, with a 100-candidate limit and explicit collectionTruncated flag. Matching snapshots undergo integrity verification. A final context/access check withholds links if state or policy changed while the request was reading.

readiness remains NOT_EVALUATED and qualityGate remains null. EXECUTION_NOT_VERIFIED means links exist, not that required checks executed or that the PR can merge. Missing links return NO_APPLICABLE_ASSESSMENT. Closed, forked and unverified contexts have explicit reasons and null links. Historic snapshots remain available through the existing assessment endpoints.

## Limits and verification

Initial PR discovery, trusted tool execution validation, gates and UI integration remain separate slices. Periodic reads can repair missed events for tracked PRs, but cannot discover PRs never observed locally. At large scale, scheduling and closed-PR retention need further tuning; bounded passes may delay verification, and expiry hides links safely during that delay.

Scoped tests cover ordering conflicts, exact-head linkage, policy/binding/base changes, verification expiry, provider failures, in-flight event/access races, session/repository guards, token permission isolation, tamper rejection and actual worker startup/shutdown. No browser or full-system suite is required for this backend task.
