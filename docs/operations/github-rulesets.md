# GitHub rulesets: discovery, deployment and Insights

Application connections and feature switches are now provisioned in **Settings → Configuration** by Super Admin. Environment names below describe the legacy import contract; once stored, database values take precedence. See [deployment configuration](deployment-configuration.md). Infrastructure and execution trust controls remain deployment-managed.

See the [production governance deployment guide](../deployment/github-governance-production.md) for one-App setup, optional separate credentials, permissions and activation release gates. Configuring credentials alone does not enable activation: default-off flags, current passing checks and independent approval are required.

Quality Gates → GitHub Rulesets shows rulesets GitHub returns for the selected repository, including applicable parent organization/enterprise rulesets. Choose a repository, open a ruleset, and inspect its branch patterns, rule types, approval count and required status-check names/source App IDs.

This is the first **P2.R1** slice. It uses the existing GitHub App with a repository-limited **Metadata: read** token; no organization administration permission is added. The discovery UI has no GitHub write actions. The P2.R2 wizard previews and saves local drafts for one selected repository. Those discovery and draft endpoints never write GitHub. The separate Readiness check and Deployments tabs now provide automatic publication and independently approved, single-repository activation behind default-off flags; see [publication setup](github-check-publication.md).

## Access and data

- `GET /github/repositories/:repositoryId/rulesets?page=1`: 20 entries per page, with `hasMore`, `page` and `fetchedAt`.
- `GET /github/repositories/:repositoryId/rulesets/:rulesetId`: normalized read-only detail. Required-check App IDs are GitHub integration IDs, not installation IDs.
- Both require an active session and `policy.read` for a selected, available repository in the current organization. Authorization is checked before and after the GitHub operation.
- Lists and details are cached in Redis for up to 60 seconds, keyed by GitHub App, installation, access revision, repository, page/detail ID. Without Redis, fresh GitHub data is read. Installation and upstream repository access are checked even before cached results are served.
- Existing shared GitHub request pacing, cooldowns, bounded retries and single-flight handling apply. Refresh may return the same snapshot within the one-minute cache window; fetched time remains the time of the source read.
- Pagination is deliberately bounded at 1,000 pages. A full page indicates that another page may exist; the next page can be empty. Pages do not form an atomic GitHub snapshot.

## Interpretation and limits

**Active** is GitHub enforcement; **Disabled** is not enforced; **Evaluate** is GitHub evaluation without blocking. These states are not Preflyt PASS/BLOCK/INCOMPLETE decisions. Unknown states or malformed responses fail rather than appearing as empty results.

Branch patterns remain GitHub patterns, including `~DEFAULT_BRANCH` and `~ALL`. The view lists rulesets associated with a repository; it does not resolve effective protection for each branch. Legacy branch protection is not included. No rulesets returned therefore does not prove a branch is unprotected.

The detail response intentionally omits organization repository-target lists, bypass actors and full rule parameters. It is not the complete deployable JSON. Organization-wide discovery and resolved effective branch protection remain pending. Separate deployment APIs provide preflight, approval, dedicated-ruleset activation, current-state verification and safe rollback. Ruleset Insights provides the repository-scoped view described below.

Plan/permission/provider failures are shown as errors. An empty result is displayed only after a successful list response. GitHub remains the authority for merge protection.

See [GitHub repository rules API](https://docs.github.com/en/rest/repos/rules) and [the product specification](../product/github-ruleset-management.md).


## Local draft wizard (P2.R2 single-repository slice)

Open **Drafts → New draft** inside Quality Gates → GitHub Rulesets. Choose up to
20 branches from the searchable GitHub branch list, choose Standard/Strict/Custom,
and review the server-generated protections, exact check name, saved pack versions
and full configuration. Save stores a local draft; it does not change GitHub.
Readers can view drafts. Users with `policy.draft` can create or edit them.

Editing a draft uses the current saved standards. When those differ from the old
draft, the editor explicitly reports the change before review. Changing inputs or
returning from review clears the preview. Saving uses the reviewed inputs. A 409
conflict requires an explicit reload and another review; reloading an existing draft
discards unsaved edits. Drafts are paginated at 20 entries per page.

## Local draft API

- `GET /github/repositories/:repositoryId/ruleset-drafts?page=1` returns 20 local
  drafts per page and the current saved standards selection. Requires `policy.read`.
- `GET /github/repositories/:repositoryId/ruleset-drafts/:draftId` reads one scoped
  draft and its current standards selection, including when list ordering changes.
- `POST /github/repositories/:repositoryId/ruleset-drafts/preview` validates and
  compiles a preview without database writes. Requires `policy.draft` and the web
  origin; returns the exact definition/hash and frozen pack versions used by save.
- `POST /github/repositories/:repositoryId/ruleset-drafts` saves a local
  Standard, Strict or Custom draft. Requires `policy.draft` and the configured web origin.
- `POST /github/repositories/:repositoryId/ruleset-drafts/:draftId/edit` edits a
  draft using its `expectedHash`. A stale draft or changed standards selection returns
  409 so callers can reload before saving.

Draft inputs specify a name, profile, 1–20 exact branch names, review/control
options and `expectedSelectionId` (or null when no standards have been adopted).
Standard requires one approval; Strict requires two approvals and resolved
conversations. Both prevent force pushes and deletion. Custom provides bounded
options. Every generated definition includes the stable Preflyt check name and
`enforcement: disabled`. Draft branch names are validated syntactically. Deployment preflight separately verifies live branch existence, source App, published policy, current passing checks and governance permissions before activation.

The selected standards ID and pack versions are frozen in the draft. Saving and
editing are audited, concurrent edits conflict, and organization/repository grants
are checked. Lists expose `activationAvailable: false`; no draft endpoint writes to
GitHub. The check's source App ID remains unset until verified publisher preflight.

Apply database migrations before using these endpoints. Broader organization and multi-repository targeting, exclusion patterns and resolved effective protection remain pending. Drafts remain local; use Deployments for the independently reviewed activation flow. Live passing/failing/incomplete acceptance remains pending. This selected-repository slice does not close P2.


## Repository Ruleset Insights (P2.R5 first slice)

Open **Quality Gates → GitHub Rulesets → GitHub → a ruleset → Insights**.
Select hour/day/week/month, branch, GitHub username and matching rule result.
The API reads at most 20 GitHub suites per page and fetches each suite's details.
Only detailed rule evaluations with the selected `rule_source.id` are included.
The response counts **matching rule occurrences on the current GitHub page**,
not unique PRs, all evaluations in the period, or contributor compliance.
A page can be empty after ruleset/result filtering while a next page exists.

- `GET /github/repositories/:repositoryId/rulesets/:rulesetId/insights?page=1&period=week&result=all`
- Optional `ref` and `actor` filters; use an exact Git ref such as `refs/heads/main`.
- Active pass/fail, evaluate-mode failures and attributable rule bypasses are separate.
- Suite-level bypass is preserved in history; it is never counted as a ruleset bypass without a matching rule result.
- The failed-rule chart and counts reconcile with the visible filtered history.
- Every row contains its source suite ID, timestamp, actor, ref, exact commit link and matched rule details.
- Preflyt readiness checks remain in their own Readiness check tab.

The assessment App needs repository **Administration: read** to read GitHub Rule Suites.
Tokens are narrowed to this repository and read-only administration/metadata; the
governance App is not used for Insights. `policy.read` is checked before and after
the upstream read. A changed grant, malformed detail or upstream failure returns
an error rather than partial or misleading counts. Responses are `no-store`.
Shared GitHub pacing, cooldowns and bounded read retries apply. Each page needs
up to 21 upstream calls plus access verification; no unbounded period scan runs.

### Saved history and collection

Select **Saved GitHub history** in Insights for retained evaluations. The API accepts `source=retained`, the same repository/ruleset/filter/page parameters, and an additional `period=quarter` (90 days). Counts remain page-scoped. Collection freshness and failures appear alongside the saved results. No collected history means no known results, not a passing repository.

Deploy the additive migration `20261010000000_ruleset_insights_history`, regenerate the Prisma client, and restart the API/worker during your deployment. Enable `RULESET_INSIGHTS_SYNC_ENABLED=true` on the worker and API. Both services use `RULESET_INSIGHTS_RETENTION_DAYS` (default 90, accepted range 30–365). Compose forwards both settings. The feature defaults off; enabling it needs repository Administration: read on the assessment App, not privileged governance credentials.

The worker reads at most five due selected, available repositories per reconciliation, at most 20 suites plus their details per repository page. It uses shared provider pacing/retry limits, a five-minute database lease, and a persisted page cursor. Further pages become due after five seconds; a finished sweep or failure waits five minutes. Access is rechecked transactionally against the current installation revision and repository selection before committing evidence. A stopped worker or expired lease cannot persist results. Native execution is not involved.

Snapshots retain the stable repository ID, suite ID, matched ruleset IDs, source SHA, actor/ref, provider timestamp, fetch timestamp, original detail JSON and canonical SHA-256 digest. Duplicate IDs do not create extra results. An existing suite with different provider details leaves the original record intact, records a collection error and retries later; operators must investigate instead of silently replacing history. Reads verify the payload digest and indexed identity before attribution. Collection state and all page writes commit atomically.

Enabled reconciliation deletes evaluations whose provider timestamp is older than the configured retention, including history from repositories that were deselected. History is unavailable to users without current repository `policy.read`, even if it was collected while they had access. Lowering retention permanently removes older snapshot data on the next reconciliation; audits and assessment records are separate. Disabled collection does not run retention cleanup; operators should retain the worker schedule or use their database retention procedure when decommissioning the feature.

**Coverage is collected evaluations only.** Each sweep queries GitHub's month window; it cannot recover older history that was never collected. Provider pagination is a changing list, not an atomic historical snapshot. Sweeps overlap and deduplicate, but a completed sweep is not proof of complete period coverage. A full 1,000th page stops the sweep with a collection error instead of claiming a completed sweep. The page limit, access failures, missed runs and upstream availability can leave gaps. The UI shows these observations without claiming all PRs or all period totals.

Organization-wide comparisons, longer trend charts and exact links to Preflyt assessments remain pending. No browser or live GitHub acceptance is claimed by the local regression tests. See [GitHub Rule Suites API](https://docs.github.com/en/rest/repos/rule-suites).


## Scheduled managed-ruleset drift checks

With `GITHUB_RULESET_ACTIVATION_ENABLED=true`, the worker reads at most five due managed ACTIVE/DRIFTED/ROLLED_BACK deployments per reconciliation. It claims each observation window in PostgreSQL and polls no more often than five minutes. It uses the approving administrator's identity, current repository/organization permissions and the configured governance connection. Revoked authorization stops observation. Permission is checked again after the GitHub read. Polling only reads GitHub; it never activates, replaces, repairs or disables protections.

A matching provider hash updates the verification timestamp. A changed hash marks DRIFTED and records an audit plus a scoped notification once per distinct deployment/hash; the expected managed definition stays intact. Restoring the exact expected provider definition can restore the corresponding ACTIVE/ROLLED_BACK state after verification. Unknown provider reads preserve the old state and verification timestamp, with an explicit outdated-state message. The next attempt waits five minutes. Notifications require the existing default-off notification configuration. An operator must review drift; safe rollback still rejects protections that no longer match the expected managed receipt.

The additive `20261010001000_ruleset_drift_schedule` migration and regenerated client are required. API and worker restart remains an operator deployment action. Local database tests cover successful drift observation, repeated-poll deduplication and provider timeout. No live GitHub deployment acceptance is claimed.
