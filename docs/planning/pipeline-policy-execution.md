# Pipeline policy execution


## GitHub workflow verification — 11 October 2026

The normal GitHub Actions integration verifies execution directly against GitHub. Separate report signatures and deployment execution contracts are optional; they are not a setup prerequisite for this path. This supersedes earlier mandatory-signer instructions below.

The Action authenticates with GitHub OIDC and submits the exact report bytes and policy check IDs. After the run completes, Preflyt matches the signed GitHub event with a fresh GitHub API read of the repository, PR head, workflow path/ID, run attempt, successful job and completed steps. A server-only audit receipt binds each report checksum and check ID to that run and published policy. Existing source approval, report parsing/integrity, freshness, coverage, rerun and policy checks still apply. The publisher verifies the current GitHub run again. OIDC alone, uploaded reports and caller-supplied success labels cannot create a passing result.

This trusts the configured repository workflow to run its intended commands. It does not independently certify the tool installation or execution environment. Optional signed-report contracts remain available for deployments requiring that stronger boundary. Tests need executed cases with no failures; security reports need a named tool, no findings and no incomplete coverage. Missing, failed, stale, ambiguous or superseded required evidence cannot pass.

Goal: connect repositories → define checks/standards → create a policy → run it at configured SDLC stages → see outcomes and insights. GitHub Actions is the first execution path. Users do not manually upload reports.

First scope: current same-repository, non-draft PRs and their published target-branch policy. Build/QA/deployment stages follow after this path is accepted. Preserve the familiar sidebar. Work directly on the running branch. No tests, builds or GitHub Actions until requested.

## Progress — 10 October 2026

- Implemented locally: read-only published-policy fetch authenticated by GitHub OIDC; Action policy fetch, exact-head checkout check, bounded repository-command execution, job summary and failure/incomplete exit; direct automatic result submission; strict policy/run/repository identity and duplicate submission validation; durable pending-verification storage.
- Applied locally: additive `PipelineRunSubmission` migration and regenerated Prisma client.
- Written, not executed: result intake regressions for stale scope, missing required checks, duplicate/unknown rules and invalid reports.
- Implemented locally: completed-run worker processing, signed-event and current-run verification, existing artifact/proof import into policy assessments, durable retries and stale-run handling; workflow discovery/setup with Action and configuration downloads; opt-in App-owned PR summary comments serialized per PR and linked to saved assessments.
- Implemented locally: inline repository workflow YAML editor, visible policy-check panel and check source mappings, optional AI rewrite using the enabled Repository route with source-sharing and request controls, side-by-side draft review, and an explicit setup-PR action carrying the edited YAML plus the three local Action files. GitHub repository writes require Contents, Workflows and Pull requests write permissions; the base branch is never edited directly. Download is a fallback. AI drafts preserve existing triggers, jobs and steps; unsupported proposals are rejected. Adding a result step does not invent test/scanner commands or successful evidence.
- Written, not executed: workflow YAML preservation/validation, source-read scope and setup-PR stale-base/permission regressions.
- Applied locally: processing leases/retries, assessment/comment receipt fields and comment opt-in migration.
- Pending acceptance: full tests and failure → blocked merge → fix → verified pass on a real PR. Public Action release and repository workflow changes remain separate rollout steps.

A pending submission is a runner assertion, not a verified passing assessment. Existing deterministic evidence, authorization, published-policy pins and merge protection remain authoritative. Neither a stage label nor an uploaded success assertion establishes execution. No public Action release, repository workflow change or branch-rule change has been made.

Next authorized verification: run the written regression tests, then accept one configured PR workflow end to end. Execution PASS requires completed GitHub run/job verification plus valid rule-specific reports; OIDC or an unsigned upload alone stays incomplete. Separate signer contracts are optional. See [the public Action README](https://github.com/lyrisoft/preflyt-action/blob/development/README.md) for the current integration contract and limits.


### Workflow editor usability

- Policy scope, repository and the Branch policies / CI jobs tabs share a compact toolbar.
- Workflow setup creates check-source mappings automatically. The visible Check sources button opens their review/edit drawer; manual per-check mapping is not a prerequisite for the YAML setup flow.
- YAML syntax highlighting applies in light and dark themes. Fullscreen controls retain the existing editor instance, draft, selection and undo history.
- The AI setup link opens `/intelligence?tab=routing` directly.
- Fullscreen regression coverage was written. Tests and builds remain deferred at the user's request.

- Workflow discovery and branch-pinned YAML now use the existing five-minute Redis cache; the browser also reuses YAML for five minutes. Refresh fetches current GitHub workflow lists/content without replacing local edits. Setup PR creation bypasses cached sources and still verifies the reviewed base commit. Cache scope, expiry, refresh and access-denial regressions were written; execution remains deferred.


## Setup simplification — 11 October 2026

Supersedes the editor-first setup and repeated model/publishing configuration above. Applied directly on the running `codex/p0-p3-phase-closure` checkout:

- Standard cards expose View YAML. A modal shows syntax-highlighted, read-only YAML and a Copy snippet button. Individual checks and the selected policy have snippets too; a policy combines its execution checks into one step.
- Workflow setup leads with the snippet. The editor and AI rewrite are optional. Connect workflow validates the committed setup and creates source mappings. Create setup PR installs files and connects the workflow in one action; repair is shown only if its connection failed.
- Public Preflyt API URL is configured once by a deployment administrator. GitHub runners cannot use localhost. The local Action has four files and reuses installed repository tools; it does not install scanners or package managers. Custom tooling still needs its repository command/result path.
- Model setup uses one Models table and tests on save. One default model is reused unless a stage has an explicit override. Successful connection tests no longer expire daily; changed configuration invalidates them. Source sharing remains explicit.
- PR feedback settings centralize policy check publication, policy summary comments and optional AI feedback. No token prices or budgets are required.

Tests were written/updated and left unrun. No tests, builds, lint, typechecks, hosted Actions, external PRs or repository workflow changes were performed for this increment. Public Action release and real-PR acceptance are still pending. Current-run identity, signed evidence, approval and authorization requirements remain in force; missing evidence cannot pass.


### Automatic snippet connection (11 October 2026)
Copy the snippet, commit it and run the workflow. With repository PR checks enabled,
the Action can fetch its published target-branch policy without preconfigured CI
sources. Preflyt registers report check IDs against the actual workflow ID only
after the live completed run, attempt, commit, signed GitHub event, policy and
current publisher access agree. Registration is idempotent and audited; it is
source identity, not proof that a check passed. Existing unrelated sources are retained.
Manual publishing and the copy-flow Connect workflow button were removed from the UI.
Submission errors fail the Action. Completed-run assessment/publication happens after
the workflow finishes, so a later publication error cannot retroactively fail that
finished job; required GitHub check enforcement remains necessary. A synchronous
publication acknowledgement path is still pending. Tests were added, not run.


### Final publication gate (11 October 2026)
Setup downloads and setup PRs include `.github/workflows/preflyt-gate.yml`, watching
the selected checks workflow by name. Commit the gate and Action transport files
to the repository default branch: GitHub runs workflow_run gates only from that branch.
The gate starts after a same-repository PR workflow completes, checks out only
trusted default-branch code, and waits up to ten minutes for the exact submitted
assessment's verified GitHub publication. Failed/incomplete results, stale runs,
disabled access/configuration, API errors and timeouts fail the gate job.
Require the PR-attached `Preflyt / Engineering Readiness` check in GitHub branch
rules along with your existing CI checks. The follow-up workflow job runs at the
default-branch commit, so its own job name is not a PR-head required check. The original completed run stays unchanged; the final gate
is a separate failing workflow/check. PR comments are informational and do not
determine the gate result. No report download or execution of PR code occurs in it.
The processor now publishes the exact verified assessment before optional comments.
Tests are written but were not run. The preceding pending-gate note is superseded.

## Policy-only execution — 12 October 2026

Supersedes explicit workflow check/report mappings. The approved design installs one runner per repository and fetches the published PR target-branch policy on every run. The API exports execution version 1 with commands and output paths from that immutable definition. New checks apply after a new policy revision is approved and published; editing library content alone does not change an active policy.

The separate public Action provisions pinned Semgrep, Gitleaks and Trivy containers for built-in scanner recipes. Project dependencies remain in the workflow; project/custom commands live in Standards. Source mounts are read-only for scanners, credentials and the Docker socket are excluded, and report limits remain 10 × 256 KiB with a 900 KiB submission cap. Only unused SARIF rule descriptions are removed, preserving findings and diagnostics. Unconfigured, unavailable, timed-out and missing-report checks remain incomplete.

The editor installs or upgrades one policy runner, without per-check Add controls. Generated YAML is independent of the selected check list. The previous explicit mapping helper and Action input are removed; Preflyt is the only consumer being migrated. Existing exact-commit, run-attempt, policy integrity, authorization, GitHub verification and final publication gates remain in force.

Validation includes policy export access/staleness/integrity regressions, workflow preservation, the actual API manifest executed by the separate Action, clean/failing/missing-command outcomes, path protection, credential stripping and real Docker scanners. The Action must be tested and published first; Preflyt changes are pushed only after its immutable release is available.

## Standalone PR installation — 18 October 2026

The installation flow now generates a complete `.github/workflows/preflyt.yml` for the selected published policy branch. This supersedes selecting an existing CI/deployment workflow and inserting a snippet. The target branch is explicit; PR opened/update/reopen/ready events run the checks and final gate in the same workflow.

Generation proposes repository-backed verification prerequisites, supported manifest-based dependency setup and a local container build when unambiguous. The user reviews setup warnings and the complete file before creating a setup/update PR against the policy branch. Unknown setup and subdirectory command requirements remain explicit. New PR creation does not depend on an existing workflow ID, does not edit existing CI/deployment workflows, and registers actual sources only after verified runs. Existing legacy API endpoints remain available for compatibility.

See [standalone PR workflow installation](../operations/standalone-pr-workflow.md). The bundled Preflyt CI setup skill supports source-backed creation and preservation-checked updates. Focused API/browser regression and TypeScript checks are recorded in the CI setup acceptance report; live GitHub/runner acceptance remains pending.
