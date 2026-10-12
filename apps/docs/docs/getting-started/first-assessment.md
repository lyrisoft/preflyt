---
id: first-assessment
title: Your first report
sidebar_label: First report
description: Follow your repository's first Health assessment without setting up CI.
---

# Your first report

Selecting a repository queues a **Health assessment** of its default branch. Open the repository’s **Health** tab to follow it. You do not need a workflow, pull request or saved standards for this report.

## Follow the assessment

1. [Select a repository](select-repositories.md), then open its **Health** view.
2. Watch **Queued** change to **Running**. The worker freezes the branch commit before inspection and analysis.
3. Read the processing status, completeness and freshness separately. **Completed** means the report was saved; it can still be **Partial**.
4. Review each analysis outcome and its limits. Open a finding to see its rule, severity, file and reported line at the assessed commit.
5. Use **Reassess** after changes. To assess another branch, choose it in **Assessment branch**, then choose **Reassess**. The previous report remains in history.

Owners, Admins and Security Engineers with repository access can request Health analysis. Readers see only reports within their assigned scope. Completion, partial-analysis and failure notifications link to the report when notifications are enabled.

:::info Analysis availability
Health uses qualified analyzers in a separately approved execution runtime. Without that runtime, Preflyt saves an **Inspection only / Partial** report with detected repository context and the analyses that could not run. Finding counts are unavailable. Ask the deployment operator to complete runtime qualification; a saved report does not establish that a scanner ran.
:::

Static Health defaults do not install dependencies, run package scripts or tests, build images, invoke AI, publish standards or alter GitHub protection. They do not produce a merge readiness check. See [Repository health](../user-guide/repository-health.md) for supported analyzers, source handling and labels.

## Existing repositories

Upgrading does not automatically scan every repository selected before this feature was installed. Open **Health** and choose **Assess repository** for a repository that shows **Not assessed**. Existing standards and policies remain in place.

## Add continuous feedback when ready

Health gives a report about a repository revision. [Pull request checks](../user-guide/pull-request-checks.md) provide ongoing feedback about proposed changes:

1. Review recommended [standards](../user-guide/standards.md) and publish a [policy](../user-guide/policies.md) for the target branch.
2. Review the workflow setup and create a setup PR, then merge it through your normal process.
3. Confirm a test PR has an assessment and a matching **Preflyt / Engineering Readiness** check at its current commit.
4. Optionally enable [AI reviews](../user-guide/ai-reviews.md) and [merge protection](../user-guide/merge-protection.md).

The **Checks** tab shows detected setup files. **Assessments** retains commit assessments of selected standards and CI evidence; **CI activity** shows GitHub results. These views remain separate from Health. The Overview's **Set up your first CI assessment** shortcut can save recommended standards after your explicit request; automatic Health assessment does not do this.
