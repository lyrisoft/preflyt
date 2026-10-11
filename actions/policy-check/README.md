# Preflyt policy check

Connect your existing GitHub Actions workflow to a published Preflyt PR policy.
GitHub runs your tests and scanners; Preflyt verifies the completed run, evaluates
the policy and publishes its result on the PR. Optional AI reviews use the model
and skills configured in Preflyt and post advisory feedback on the PR.

No Preflyt API key, manual report upload or copied Action files are needed.
Authentication uses GitHub's short-lived OIDC identity.

## Add to an existing workflow

Connect the repository in Preflyt, publish a policy for the target branch and copy
the policy or standard's generated YAML. It includes the appropriate check IDs.
Keep your existing jobs and dependency/tool installation steps. This Action
requires a Linux runner with Python 3 and Git; GitHub-hosted Ubuntu provides both.
The first release supports same-repository, non-draft pull requests.

```yaml
name: CI
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  checks:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false
      # Keep your existing dependency and tool installation steps here.
      # Example: an earlier step runs pytest --junitxml=reports/tests.xml
      - name: Preflyt policy
        if: ${{ always() && github.event.pull_request.head.repo.full_name == github.repository }}
        uses: lyrisoft/preflyt-action@v1.0.0
        with:
          api-url: ${{ vars.PREFLYT_API_URL }}
          checks: |
            {"tests.required":{"report":"reports/tests.xml"}}
```

Set the repository variable PREFLYT_API_URL to your public HTTPS Preflyt API base
(including /api when using Preflyt's bundled web proxy). Published policy checks
and repository PR feedback must be enabled in Preflyt.

Use the exact release commit SHA for immutable version pinning. Preflyt-generated
snippets pin that commit. The v1.0.0 tag identifies the first release.

## Check configuration

The checks input accepts inline JSON or a repository JSON filename. Each key is
the exact check ID from the published policy, with a report path relative to the
workspace. A report from an earlier step must exist in the same job. To run a
command, add argv as an executable/arguments array:

```json
{
  "tests.required": {
    "argv": ["python3", "-m", "pytest", "--junitxml=reports/tests.xml"],
    "report": "reports/tests.xml"
  }
}
```

Built-in snippets use ["preflyt-recipe", "tests.required", "reports/tests.xml"]
to resolve a recipe bundled with this Action. Recipes reuse installed test tools,
scanners and package scripts; they do not install tools or invent passing results.
Custom commands and report paths can be configured in Preflyt standards.
Tests use JUnit; supported security checks use SARIF. Build and type-check commands
produce a command-result JUnit report. Missing/unsupported tools or reports stay
not evaluated. Required failures and missing results fail the job. Up to 10
reports are supported per source run.

## Final publication gate

Commit this separate workflow to the repository's default branch. It waits for
the exact source run's verified assessment and successful GitHub publication.
It fails on policy failure, incomplete results, publication errors or timeout.
Change CI to the exact name of your checks workflow.

```yaml
name: Preflyt publication gate
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
permissions:
  contents: read
  id-token: write
jobs:
  publication:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    if: ${{ github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.head_repository.full_name == github.repository }}
    steps:
      - name: Wait for verified Preflyt publication
        uses: lyrisoft/preflyt-action@v1.0.0
        with:
          mode: gate
          api-url: ${{ vars.PREFLYT_API_URL }}
          source-run: ${{ github.event.workflow_run.id }}
          source-attempt: ${{ github.event.workflow_run.run_attempt }}
```

The gate never checks out or executes PR code. Require the PR-head check
**Preflyt / Engineering Readiness** in your GitHub ruleset. The gate's own status
runs at the default-branch commit and does not replace that required PR check.
Comments and AI suggestions are feedback; GitHub enforces merge permissions.

## Inputs and output

| Input | Purpose |
| --- | --- |
| api-url | Required public HTTPS Preflyt API base. |
| mode | check (default) or gate. |
| checks | Check commands/report paths; defaults to {}. Required policy checks must be supplied in check mode. |
| source-run | Source workflow run ID in gate mode. |
| source-attempt | Source workflow attempt in gate mode. |
| proofs | Optional signed-report bundle map. Separate signatures are not required for normal GitHub verification. |

The result output in check mode is passed, failed or incomplete. It is the runner's
local outcome; Preflyt's later verified assessment is authoritative for its policy.
API errors fail the Action. Submission retries are bounded and idempotent.

## Verification and security

Preflyt binds results to repository, exact PR commit, workflow, run attempt,
policy revision and report checksums, with completed-run GitHub verification.
OIDC proves workflow identity; uploaded success claims alone cannot pass a policy.
Your configured workflow remains responsible for running the intended tools.
Commands receive neither the Action's OIDC credentials nor platform API settings.
Never run untrusted PR code under pull_request_target or in the publication gate.

This repository contains only the integration Action. Its MIT license does not
license the Preflyt application or backend.

## Development

```sh
python3 -m unittest discover -p 'test_*.py' -v
```
