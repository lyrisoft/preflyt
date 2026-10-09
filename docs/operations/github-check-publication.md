# GitHub readiness check publication

Status: the first P2.R3 slice supports manual publication and read-back verification of **non-passing** checks. Passing checks, automatic publication, published-policy evaluation, merge queues and ruleset activation remain pending.

## Setup

1. Grant the assessment GitHub App repository **Checks: write** permission and accept the updated installation permissions. Existing repository-read tokens retain their read-only permissions; publication mints a separate token limited to the selected repository.
2. Apply API migrations and regenerate the Prisma client.
3. Enable `GITHUB_CHECK_PUBLICATION_ENABLED=true` on the API deployment. The default is false. The worker does not publish checks.
4. The user needs repository-scoped `policy.read` to review and `policy.publish` to publish. GitHub access and installation permissions are checked again before writing.

See [GitHub Checks API](https://docs.github.com/en/rest/checks/runs) for the App permission and check-run contract.

## Review and publish

Open **Quality Gates → Readiness check**, select a repository, enter an open PR number and choose its latest saved assessment. Review the exact commit, GitHub App ID and proposed output, then publish. History is paginated and links to the GitHub check.

The stable check name is `Preflyt / Engineering Readiness`. A required control with approved negative CI evidence produces `failure`. Every other historical preview, including configuration-only PASS and WARN, produces `action_required`. Historical observe assessments cannot establish verified merge readiness. This publisher never emits `success`, `neutral` or `skipped`, and does not activate a ruleset.

Publication requires an open, non-draft, same-repository PR at the assessment SHA, current saved standards and CI source bindings, and the latest assessment for that commit. Changed previews are rejected. Fork PRs and merge-queue commits are not supported in this slice.

## Verification and recovery

A durable database claim prevents ordinary concurrent publication of the same reviewed result. Requests and verified receipts are audited. GitHub is read back to check the App, check name, external ID, exact SHA, completion status, conclusion and output. A receipt records verification **at publication time**, not continuous readiness or drift monitoring.

A timeout or unverified response is marked `UNKNOWN`. Refresh history, review the same assessment and retry. Before any create request, the publisher searches up to 1,000 check runs for the same App and deterministic external ID, then verifies an existing match rather than creating another. Duplicate matches or an exhausted search limit require review and stop publication. POST requests are not automatically retried. An abandoned in-progress claim can be retried after two minutes; remote GitHub writes and database commits are not a single atomic transaction, so this is bounded recovery rather than a guarantee of exactly-once external writes.

Do not require this check in an active ruleset yet. Full P2.R3 still needs verified passing evidence, published-policy evaluation and disposable-repository acceptance tests before activation preflight can succeed.
