# Preflyt PR policy Action


## GitHub workflow verification — 11 October 2026

The normal GitHub Actions integration verifies execution directly against GitHub. Separate report signatures and deployment execution contracts are optional; they are not a setup prerequisite for this path. This supersedes earlier mandatory-signer instructions below.

The Action authenticates with GitHub OIDC and submits the exact report bytes and policy check IDs. After the run completes, Preflyt matches the signed GitHub event with a fresh GitHub API read of the repository, PR head, workflow path/ID, run attempt, successful job and completed steps. A server-only audit receipt binds each report checksum and check ID to that run and published policy. Existing source approval, report parsing/integrity, freshness, coverage, rerun and policy checks still apply. The publisher verifies the current GitHub run again. OIDC alone, uploaded reports and caller-supplied success labels cannot create a passing result.

This trusts the configured repository workflow to run its intended commands. It does not independently certify the tool installation or execution environment. Optional signed-report contracts remain available for deployments requiring that stronger boundary. Tests need executed cases with no failures; security reports need a named tool, no findings and no incomplete coverage. Missing, failed, stale, ambiguous or superseded required evidence cannot pass.

This local increment fetches the current published PR policy using a short-lived GitHub Actions identity token, runs reviewed repository commands, writes a job summary and submits results to Preflyt automatically. No Preflyt login cookie, administrator API key or manual report upload is used.

## Current setup

Set **Settings → Configuration → Public Preflyt API URL** once as a deployment administrator. It must be a public HTTPS API address reachable from GitHub's runner. Connect the repository and publish a policy for the PR target branch.

Open **Standards → View YAML** on a standard card (or an individual check's details) to copy a highlighted workflow snippet. **Policies → CI jobs** also provides one combined snippet for the selected published policy. Download the four Action files once, extract them into the repository, paste the snippet into the existing job after checkout and dependency installation, add the stated permissions and commit. Select the workflow and click Connect workflow; Preflyt validates the committed YAML and creates its check-source connections automatically. Per-check source dropdowns are recovery controls.

The YAML editor and AI rewrite are optional. Create setup PR bundles the reviewed YAML and the Action files and saves the connection together; there is no separate save step. Review and merge the PR in GitHub. PR publication and summary comments are configured in **Settings → PR feedback**, rather than repeated in workflow setup.

Use the Action from a reviewed commit of the Preflyt repository, or copy this directory into `.github/actions/preflyt-policy` in the consuming repository. A private remote Action requires GitHub access; Preflyt has not published a public Action release.

Add the step to the existing CI job after dependencies are installed. Check out the exact PR head rather than GitHub's synthetic merge commit. Use a GitHub-hosted Linux runner with Python 3 and Git. Provide job-level `contents: read` and `id-token: write` permissions. No write permissions are required by the Action.

```yaml
# Within an existing job with an exact PR-head checkout and installed dependencies:
permissions:
  contents: read
  id-token: write
steps:
  # Preserve your existing checkout and dependency installation steps here.
  - name: Preflyt policy
    uses: ./.github/actions/preflyt-policy
    with:
      api-url: https://YOUR_PREFLYT_API
      checks: |
        {"build.required":{"argv":["pnpm","build"],"report":".preflyt/results/build.xml"}}
```

The inline `checks` input maps approved policy check IDs to executable argument arrays and report paths. For build/type checks the Action produces the command result automatically; test and scanner adapters read the tool's normal JUnit/SARIF output. `report` is an internal file produced by the pipeline, not a user upload. `argv` is optional for existing reports produced earlier in the same job. Commands stay in the repository workflow. Optional AI proposals are reviewed before use and cannot remove existing triggers, jobs or steps. The Action also accepts an existing repository JSON file path for backward compatibility.

```json
{
  "build.required": {
    "argv": ["pnpm", "build"],
    "report": ".preflyt/results/build.xml"
  },
  "tests.required": {
    "argv": ["pnpm", "test:ci"],
    "report": ".preflyt/results/tests.xml"
  }
}
```

The Action files are `action.yml`, `transport.py`, `run.py` and `recipes.py`. Built-in snippets use small recipes for tools and package scripts already installed/configured by the repository's job. They do not install package managers, test reporters or scanners. Tests support existing Vitest, Jest with jest-junit, Node test runner and pytest; scanners reuse existing Semgrep configuration, Gitleaks, Trivy or ESLint SARIF tooling. Container scans need the job's `CONTAINER_IMAGE`. An unavailable tool or unsupported runner stays incomplete. Use a repository-specific command and result file in the check's standard for other tooling. Execution recipes do not establish trusted verification by themselves.

Adapt commands and reporter settings to the repository. Unknown adapters, absent output, timeouts and missing required checks cannot pass. Custom checks use the existing supported JUnit/SARIF adapters. API errors also fail the Action. Result submission retries bounded transient failures with a fresh identity token and an idempotent server receipt.

## Receipt and trust boundary

`POST /pipeline/results` revalidates current repository access, workflow/run attempt, PR head and published policy. It stores a bounded, immutable submission in `PipelineRunSubmission` and returns a pending-verification receipt. Required checks and titles come from the server policy, not the submitted body. A stale commit/policy or changed result for the same run is rejected.

OIDC proves the workflow identity; it does not prove the checks ran correctly. Submissions do not mark existing assessments or merge review results as passed. The worker waits for the live run to complete and its matching signed GitHub event, imports reports, verifies supplied execution proofs, and records an assessment against the published policy. It retries transient failures and marks superseded PRs/policies stale. If enabled, it creates or updates the App’s one PR summary using verified policy evaluation. Processing receipts link to the assessment and comment. At most 10 reports can be submitted per run, matching the existing artifact quota. Execution checks can pass after completed GitHub workflow/job verification and rule-specific report validation; signatures are optional. Do not replace the existing verified Preflyt gate with this runner job as an authoritative protection until live acceptance is complete. Downstream jobs can depend on this job's execution outcome; no branch rules are modified automatically.

## Validation status

Regression tests are written but not run at the user's request. No GitHub workflow was triggered. Local additive database migration and Prisma client generation were performed; these are setup operations, not test acceptance.


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
