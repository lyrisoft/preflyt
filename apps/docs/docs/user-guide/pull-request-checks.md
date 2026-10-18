---
id: pull-request-checks
title: Pull request checks
sidebar_label: Pull request checks
description: Run your policy's checks in GitHub Actions and get a Preflyt result on every pull request.
---

# Pull request checks

Preflyt can check every pull request against your published [policy](policies.md) and show the result on the pull request as a GitHub check named **Preflyt / Engineering Readiness**.

Your own GitHub Actions workflow runs the tests and scanners. Preflyt then verifies that the run really happened and evaluates the result.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/pull-request-checks.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/pull-request-checks.jpg" alt="Policies → CI jobs explains the steps for connecting GitHub Actions to a published branch policy." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>Policies → CI jobs explains the steps for connecting GitHub Actions to a published branch policy. Select the image to view it full size.</figcaption>
</figure>

## How it works

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHub Actions
  participant P as Preflyt
  Dev->>GH: Opens or updates a pull request
  GH->>GH: Your workflow runs tests and scans
  GH->>P: Preflyt Action fetches the policy and submits the reports
  Note over GH,P: Authenticated by GitHub's short-lived OIDC identity.<br/>No Preflyt API key or manual upload.
  P->>GH: Verifies the completed run, job and steps
  P->>P: Evaluates the policy
  P->>GH: Publishes Preflyt / Engineering Readiness on the pull request
  GH->>GH: The final gate job waits for it
```

A result only counts when Preflyt verifies the actual report-producing jobs for the current run attempt and PR head commit. The final gate runs in the same workflow after those jobs finish; Preflyt does not wait for that gate to finish before evaluating its predecessors. An uploaded report or a success label on its own can never produce a pass.

## Review saved check results

Open **Repositories → your repository → Checks** to see the latest saved assessment for the selected standards and revision. The cards show passed checks, failed checks and checks with missing or unverified evidence. The results table explains each check and links to its saved evidence.

The **assessed commit** identifies the revision those results apply to. It can differ from the inspected commit in the repository profile. A successful GitHub job alone does not establish a passing Preflyt check; the saved server evaluation verifies the required evidence. When no assessment exists or verification fails, result counts remain unavailable.

Assessment activity appears above the results and counts saved evaluations, including repeated evaluations of the same commit. Configuration setup and check sources are under **Standards**. GitHub's current merge permission remains separate from these historical saved results.

## Before you start

Check each of these. Several need a deployment administrator.

| # | What | Where |
| --- | --- | --- |
| 1 | The GitHub App has **Checks: Read and write**, **Actions: Read-only** and **Pull requests: Read** (write for comments). | [GitHub App](../self-hosting/github-app.md) |
| 2 | The repository is [selected](../getting-started/select-repositories.md). | Repositories |
| 3 | **Public Preflyt API URL** is set to a public HTTPS address that GitHub can reach, not `localhost`. With Preflyt's bundled web proxy, include `/api`, for example `https://preflyt.example.com/api`. | **Settings → Configuration → GitHub** (Super Admin) |
| 4 | **Publish PR checks** and **Automatic PR checks** are on. | **Settings → Configuration → Governance** (Super Admin) |
| 5 | A [policy is published](policies.md) for the branch pull requests target. | **Policies** |
| 6 | PR checks are on for the repository. | **Settings → PR feedback** |

For item 6, open **Settings → PR feedback**, choose the repository and select **Enable checks**. **Enable checks for all** turns them on for every connected repository.

The **Public Preflyt API URL** applies without a restart. If it is empty, the snippet shows `<PUBLIC_PREFLYT_API_URL>` and a note tells you to ask a deployment administrator to set it.

## Install the policy runner once

1. Open **Policies → CI jobs**, choose the repository and its published target-branch policy.
2. Review the complete `.github/workflows/preflyt.yml` draft and the detected project setup. Existing CI and deployment files stay separate.
3. Select **Generate workflow with AI** to request a repository-specific proposal. Instructions are optional. Preflyt uses the built-in **Preflyt CI setup** skill automatically; you do not need to adopt or configure a second skill.
4. Review the comparison, the source workflow used for setup, and any unresolved prerequisites. Select **Use this draft** to apply the proposal to the editor. AI does not write to GitHub.
5. Confirm that you reviewed the YAML and target branch, then select **Create setup PR** or **Create update PR**. If the App lacks write permissions, download the workflow and open the PR manually.

### AI setup and existing workflows

The single **Preflyt CI setup** skill supports creation and updates. In creation mode, AI reads detected package scripts, package-manager and workspace information, and supported existing CI prerequisites at the selected commit. It chooses a supplied setup plan; Preflyt renders the workflow and validates the PR trigger, Action version, permissions and final gate. It does not accept invented commands, services or unsupported Action inputs from the model. Missing setup stays visible in the notes and can be edited manually.

Setup follows the checks in your published policy. Static checks do not start databases, create test environment files, run migrations or seed data. Lint, type checks and builds install the selected project's dependencies. Test infrastructure is proposed only when an existing CI job matches the selected test command and package directory. If that match is uncertain, review the setup notes and edit the YAML. A built-in container scan may also need a local image build. When selected checks or commands change, review the updated setup comparison before replacing an installed workflow.

For **Container scanning**, Preflyt detects your Dockerfiles automatically. If there is one, no selection is needed. If there are several, choose your app under **Dockerfile to build**. Preflyt adds the build step and image tag automatically; the image is built on the GitHub Actions runner. Review the displayed build context and any build arguments or secrets your app needs. Your Dockerfile choice is kept when generating with AI, downloading or creating the workflow PR. Changing it resets the review confirmation and preserves any manual YAML edits until you load the new generated workflow.

The existing workflow-edit endpoint uses the same skill in update mode with stricter preservation checks: triggers, existing jobs, deployment behavior and existing commands must remain intact. The skill is inspectable and downloadable under **Skills**; it is not an AI assessment check and cannot decide readiness.

AI requires a tested Repository model, enabled source sharing and repository permission to run AI reviews and publish policy setup. The affected setup information is sent to that configured model. Potential credential-bearing files are excluded from creation context; keep credentials in GitHub secrets. The UI explains unavailable AI, and manual YAML editing remains available. Generating a proposal does not execute checks, verify reports, create a PR or activate merge protection.

The generated standalone snippet has two jobs. When integrating with an existing workflow, keep its check jobs and add one terminal gate:

- **`preflyt_checks`** runs your checks and submits the results using the Preflyt Action.
- **`preflyt_gate`** (named **Preflyt final gate**) waits for Preflyt's verified result and fails if the policy fails or is incomplete. It depends on every other job in that PR workflow. Do not add a separate `workflow_run` publication-gate workflow. Documentation and post-merge deployment workflows can remain separate.

The snippet contains your API URL and the exact Preflyt Action version `v2.1.1`. It contains no check list or report mapping. The Action fetches the published target-branch policy at the beginning of each run. Adding a check or changing a standard takes effect after you publish a new policy revision; the workflow stays the same.

```yaml
# Shape of the generated snippet. Copy the real one from Preflyt.
jobs:
  preflyt_checks:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write          # lets the Action prove its identity to Preflyt
    steps:
      - uses: actions/checkout@...
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false
      # Your dependency installation steps go here.
      - name: Preflyt policy
        if: ${{ always() && github.event_name == 'pull_request' }}
        uses: lyrisoft/preflyt-action@v2.1.1
        with:
          api-url: https://preflyt.example.com/api
  preflyt_gate:
    name: Preflyt final gate
    needs: [preflyt_checks]
    # ...
```

### What the built-in checks run

The built-in security recipes automatically pull pinned scanner images: **Semgrep** for static application security, **Gitleaks** for secrets, and **Trivy** for dependency, container and infrastructure scans. Docker must be available on the Linux runner. Source is mounted read-only, scans receive no GitHub/OIDC credentials or Docker socket, and raw scanner logs are suppressed. Set `CONTAINER_IMAGE` in the job when selecting container image scanning.

Built-in SAST uses **Preflyt SAST v1**, an owned, digest-checked set of 18 review-oriented JavaScript/TypeScript, Python and shell rules. The scanner runs offline. This is specific pattern coverage, not the full Semgrep registry, interfile taint analysis or an exhaustive security audit. The Action contains the exact rules and narrow fixture exceptions; a separately licensed scanner can run through a custom SARIF command.

The check job completes after submitting genuine reports, including failed or partial results. Successful collection does not mean the policy passed. Each report is evaluated independently, and the required **Preflyt final gate** fails when required checks fail or remain incomplete. Missing execution output and transport errors still fail the collection job. Require the final gate in GitHub branch protection.

Build, type checking, tests and lint reuse the project tools installed in the job. Keep your dependency installation before Preflyt. Configure a **Workflow command** and **Result file** in [Standards](standards.md) for a project-specific or custom control. Commands belong to the approved policy revision; editing an unpublished standard does not change an active policy. A required check without a runnable command, tool or real report stays **Incomplete**.

An Action submission can include up to **10 reports**. Custom commands must produce real results for the selected check; missing or unrelated reports cannot satisfy it.

### Let Preflyt open the pull request for you

Instead of pasting, open the **CI jobs** tab and use the **GitHub workflow** panel:

1. Choose the workflow to change with **Choose workflow**.
2. Use **Edit YAML**, choose the job and select **Install policy runner**. **Rewrite with AI** can help preserve existing jobs. Review the proposal before using it.
3. Choose **Create setup PR**.

Preflyt opens a pull request that adds the workflow. It never edits your default branch directly, and the App needs **Contents**, **Workflows** and **Pull requests** write permission for this. **Download files** is a fallback if you would rather commit it yourself.

## What you see on a pull request

| Where | What |
| --- | --- |
| **Checks tab** | **Preflyt / Engineering Readiness**: passed, failed or incomplete. |
| **Checks tab** | **Preflyt final gate**: the job in your workflow that fails when the result is failed or incomplete. |
| **Checks tab** | **Preflyt / AI Review**, if [AI reviews](ai-reviews.md) are on. It is always advisory. |
| **Pull request comment** | An optional policy summary, if you turn it on in **Settings → PR feedback**. |
| **Preflyt** | A report under **Assessments**, and a row in **Merge Protection → PR checks**. |

After the first verified run, Preflyt connects the workflow automatically and shows **Workflow connected. Completed runs appear in Assessments.** Under **Recent policy runs** you can open each report.

### Optional pull request feedback

In **Settings → PR feedback**:

- **Post a policy summary comment on the PR** adds one comment per pull request.
- **Review changed code with AI and comment on PRs** turns on AI review. It needs [AI set up](ai-reviews.md).

Comments and AI suggestions are feedback. Findings never override the deterministic check result. When automatic AI feedback is enabled, the final gate waits for its publication; a provider or publication failure can fail the workflow even though the AI findings themselves are advisory. Inline feedback is limited to five actionable issues and deduplicated across commits; the PR summary is kept short.

### Understand the final gate’s waiting stage

Open **Preflyt final gate → Wait for verified Preflyt publication** in the GitHub
Actions logs. The Action shows the current stage and elapsed time:

- Check jobs: the report-producing jobs are still finishing or being verified.
- Result submission: Preflyt has not received this run’s reports yet.
- Result verification: Preflyt is validating reports against the run, commit and policy.
- GitHub publication: Preflyt is publishing the verified policy result.
- AI review: the configured review is queued or running.
- AI feedback publication: the review finished and its feedback is being posted.

After report verification completes, Preflyt requests the configured review
immediately. It preserves permissions, source-sharing consent and review limits.
The worker normally picks up queued reviews within its five-second polling tick;
queue load and GitHub publication can take longer. A background retry remains
available if immediate admission fails.

Stage changes appear immediately, with a heartbeat every 30 seconds while the same
stage is pending. Failure logs identify a safe reason or API HTTP status code.
No private response bodies or credentials are printed. The gate still fails for
failed or incomplete evidence and expires after fifteen minutes. AI suggestions
remain advisory and cannot change the policy result.

## Branch policies and deployment

Policies select requirements for the **PR target branch**. They do not rewrite your workflow triggers or job conditions. To run different checks for `development` and `main`, publish a policy for each, then update the workflow with branch conditions and real reports that satisfy each policy. Re-run a PR to each target to verify the routing.

PR validation does not inherently require Docker images. Type checks, lint, compilation, tests and scanners can run on the runner. Docker Compose integration tests do need images or prebuilt images, so schedule them explicitly where needed. Building and publishing deployment images belongs in a separate post-merge `push` workflow when that matches your release process. Preflyt does not deploy your application or publish its images for you.

## Make it required

A check on a pull request does not block anything by itself. To make GitHub require it, see [Merge Protection](merge-protection.md).

## Limits

- Pull requests from the **same repository** only. Fork pull requests and merge queues are not supported.
- **Draft** pull requests are not checked.
- The runner must be Linux with **Python 3 and Git**. GitHub's `ubuntu-latest` has both.
- The Action must run in a job with `contents: read` and `id-token: write`.

## If something does not appear

| Symptom | Check |
| --- | --- |
| The snippet shows `<PUBLIC_PREFLYT_API_URL>` | A deployment administrator has not set **Public Preflyt API URL**. |
| The Action fails to reach Preflyt | The API URL must be public HTTPS. GitHub's runners cannot reach `localhost`, a private network or a self-signed certificate. |
| **No workflows found** | Commit the snippet to a workflow file in the repository first. |
| No **Preflyt / Engineering Readiness** check | PR checks are off for the repository, **Publish PR checks** is off, no policy is published for the target branch, or the App lacks **Checks: write**. |
| The gate job times out | Preflyt did not verify the run in time. Open the report and the [webhook deliveries](../self-hosting/troubleshooting.md#github). |
