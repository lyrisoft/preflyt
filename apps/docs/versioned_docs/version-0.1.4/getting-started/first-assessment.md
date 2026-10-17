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

:::info Automatic scanning
Health runs every applicable built-in static analyzer automatically. No additional repository approval is required. If the scanner service or source access is unavailable, the report explains the failure; it never displays missing evidence as zero findings. The scanner service is installed once as part of your self-hosted deployment.
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

The **Checks** tab shows detected setup files. **Assessments** retains commit assessments of selected standards and CI evidence; **CI activity** shows GitHub results. These views remain separate from Health. The Overview's **Set up your first CI assessment** guide keeps setup in order:

1. **Inspect repository** finds its configuration and advances to standards.
2. Review the recommended standards and their checks. Keep or clear each selection, then choose **Save standards and continue**.
3. Choose **Create assessment** to save a report for the inspected commit and open its results. Missing CI evidence remains visible.

The guide resumes from saved progress, including standards you already chose. Each step has its own permission checks. It does not silently choose standards when you create an assessment, enable merge blocking or change AI source sharing. Automatic Health assessment does not adopt standards.
