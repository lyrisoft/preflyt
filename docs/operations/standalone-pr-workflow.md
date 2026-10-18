# Install Preflyt pull request checks

In **Policies → CI jobs**, select a repository and its published target-branch policy. The target branch is the policy branch, such as `development`; it is not automatically replaced with the repository default branch.

Preflyt generates a complete `.github/workflows/preflyt.yml`. No existing GitHub workflow or workflow ID is required. The file includes a name, PR events, the target-branch filter, concurrency, exact PR-head checkout without persisted credentials, job permissions, project setup, the published policy runner and the final verification gate. Draft PRs and PRs from forks are skipped. Updates to open PRs rerun the workflow.

## Project setup

Generation reads the selected branch at a verified commit without checking out or executing its code on the server. It proposes prerequisites from an existing Linux verification job before its first test/lint/build command. Supported prerequisites include runtime installation, dependency installation, services, test environment setup, database migrations and seeds. Deployment steps, jobs requiring another job's outputs, matrix values, reusable-workflow inputs, deployment environments and custom checkout paths are not copied automatically. The source workflow and commit are shown for review. This is source-based inference, not an execution guarantee.

When no suitable verification setup exists, supported manifest/lockfile detection proposes Node/npm/pnpm/Yarn, Python requirements and Go setup. Additional runtimes, ambiguous dependencies, test services and custom commands require review in the YAML. A single discovered Dockerfile supplies a local image-build proposal for container scanning; its context, arguments and build secrets must be reviewed. Multiple Dockerfiles require an explicit choice. Generated image builds do not push or deploy.

Policy check commands still come from the published Standard. The current Action executes those commands from the repository root: a job's `defaults.run.working-directory` does not change composite Action execution. For projects under directories such as `api/`, configure the check's **Workflow command** and **Result file** in Standards accordingly. Setup warnings call out this boundary. Missing commands, reports, services or trusted evidence remain incomplete; generating a workflow does not create passing evidence.

## Review and create the PR

Review the complete YAML, setup notes and existing/new-file comparison. Edit the YAML directly or select **Generate workflow with AI**, which uses the built-in **Preflyt CI setup** skill. It inspects detected packages and existing CI prerequisite choices at the verified commit, selects a source-backed setup, and returns a diff plus unresolved setup notes. No instructions are required. The same skill supports creation and the legacy existing-workflow edit endpoint, with separate validators. Review the proposal before applying it; generation cannot write GitHub files. Confirm the target branch and project setup before choosing **Create setup PR** (or **Create update PR** for an installed workflow). The workflow's PR-only trigger, target branch, configured Preflyt address, exact checkout and final gate dependencies are validated on the server.

The GitHub App requires Contents, Workflows and Pull requests write permissions. The deployment must have a public HTTPS API URL and automatic check publication enabled. Creating the setup PR enables repository check publication if necessary, before the PR can dispatch a run; it does not activate merge protection. No workflow source is registered as verified solely because a PR was created. First verified runs register their actual workflow ID automatically. Downloading the workflow is available as a manual-install fallback and does not enable publication.

The server rereads the target branch before proposing a PR and rejects stale previews. GitHub writes use a new setup branch and one reviewed file; existing CI/deployment workflows and the target branch are not edited directly. Retries reuse the same setup request and recover a matching existing PR. An unrelated file already named `preflyt.yml` is protected from replacement. Valid installed Preflyt setup customizations are preserved when generating an update.

Merge the setup PR in GitHub, then open or update a non-draft, same-repository PR targeting that branch. Check the saved assessment and verified GitHub readiness publication. Configure required GitHub checks separately in Merge Protection. A created setup PR, an enabled publisher and a successful submission are not proof of a passing policy result.

## Verification status

Regression coverage was added for generation, target-branch validation, copied prerequisites, stale/unauthorized requests, isolated setup-branch writes and complete-workflow copy wording. Focused generation, workflow validation, permission, stale-source, provider and browser regressions are verified as recorded in the CI setup acceptance report. Live GitHub setup-PR and runner acceptance remain to be performed.
